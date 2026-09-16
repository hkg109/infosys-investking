import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { loadGameState, ACTIVE_GAME_ID } from '../src/game-store.js'
import { createRankingRouter } from '../src/ranking-routes.js'
import {
  createRankingCoordinator,
  publicRankingPayload,
  refreshRankings,
  viewerRankingPayload,
} from '../src/rankings.js'
import { digestSessionToken, SESSION_COOKIE_NAME } from '../src/session-auth.js'

const clientUrl = 'http://localhost:5173'
const adminPassword = 'ranking-test-admin'

test('ranking API reports unavailable databases', async (t) => {
  const app = express()
  app.use('/api/rankings', createRankingRouter(null, { getSnapshot: () => ({ status: 'WAITING' }) }, {
    clientUrl, adminPassword,
  }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/rankings`)
  assert.equal(response.status, 503)
})

test('PostgreSQL rankings: asset totals, ties, API, socket updates and final freeze', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30000,
}, async (t) => {
  const schema = `test_rankings_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  let database
  let server
  let schemaCreated = false
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections() })
    await database?.end()
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.end()
  })
  await admin.query(`CREATE SCHEMA "${schema}"`)
  schemaCreated = true
  database = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  await database.query(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'))
  await loadGameState(database, { totalRounds: 3, roundDurationMs: 600_000, tradingDurationMs: 540_000 })
  await database.query("UPDATE companies SET current_price = 10 WHERE id IN ('A', 'B')")

  const emptyFinal = await refreshRankings(database, { initialCash: 100, final: true })
  assert.equal(emptyFinal.final, true)
  assert.equal(emptyFinal.rankings.length, 0)
  const lateUserId = randomUUID()
  await database.query("INSERT INTO users (id, nickname, pin_hash, role) VALUES ($1, '종료 후 참가자', 'test-only', 'USER')", [lateUserId])
  assert.equal((await refreshRankings(database, { initialCash: 100 })).rankings.length, 0)
  await database.query('DELETE FROM users WHERE id = $1', [lateUserId])
  await database.query('DELETE FROM ranking_states WHERE game_id = $1', [ACTIVE_GAME_ID])

  const aliceId = randomUUID()
  const bobId = randomUUID()
  const charlieId = randomUUID()
  const adminId = randomUUID()
  for (const [id, nickname, role] of [
    [aliceId, '앨리스', 'USER'], [bobId, '밥', 'USER'], [charlieId, '찰리', 'USER'], [adminId, '관리자', 'ADMIN'],
  ]) {
    await database.query('INSERT INTO users (id, nickname, pin_hash, role) VALUES ($1, $2, $3, $4)',
      [id, nickname, 'test-only', role])
  }
  await database.query(`INSERT INTO wallets (game_id, user_id, cash) VALUES
    ($1, $2, 500), ($1, $3, 600)`, [ACTIVE_GAME_ID, aliceId, bobId])
  await database.query(`INSERT INTO portfolios (game_id, user_id, company_id, quantity) VALUES
    ($1, $2, 'A', 20), ($1, $3, 'B', 10)`, [ACTIVE_GAME_ID, aliceId, bobId])

  const first = await refreshRankings(database, { initialCash: 100 })
  assert.equal(first.final, false)
  assert.deepEqual(first.rankings.map(({ nickname, rank, totalAssets }) => ({ nickname, rank, totalAssets })), [
    { nickname: '밥', rank: 1, totalAssets: 700 },
    { nickname: '앨리스', rank: 1, totalAssets: 700 },
    { nickname: '찰리', rank: 3, totalAssets: 100 },
  ])
  assert.equal(first.rankings.some(({ nickname }) => nickname === '관리자'), false)
  assert.equal('userId' in publicRankingPayload(first).rankings[0], false)
  assert.equal('cash' in publicRankingPayload(first).rankings[0], false)
  assert.equal(viewerRankingPayload(first, charlieId).me.rank, 3)

  const emitted = []
  const coordinator = createRankingCoordinator(database, { emit: (name, payload) => emitted.push({ name, payload }) }, {
    initialCash: 100,
  })
  await coordinator.handleGameEvent({ name: 'trading:close' })
  assert.equal(emitted.at(-1).name, 'ranking:update')
  assert.equal(emitted.at(-1).payload.totalParticipants, 3)

  const sessionToken = randomBytes(32).toString('hex')
  await database.query(`INSERT INTO user_sessions (token_hash, user_id, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '1 hour')`, [digestSessionToken(sessionToken), charlieId])
  let status = 'RUNNING'
  let pendingEvents = Promise.resolve()
  const game = { getSnapshot: () => ({ status }) }
  const app = express()
  app.use('/api/rankings', createRankingRouter(database, game, { clientUrl, adminPassword, initialCash: 100, beforeRefresh: () => pendingEvents }))
  app.use((_error, _request, response, _next) => response.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/rankings`
  assert.equal((await fetch(base)).status, 401)
  const mine = await fetch(base, { headers: { Origin: clientUrl, Cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` } })
  assert.equal(mine.status, 200)
  assert.equal((await mine.json()).ranking.me.nickname, '찰리')
  assert.equal((await fetch(`${base}/admin`, { headers: { Origin: clientUrl } })).status, 401)
  const adminResponse = await fetch(`${base}/admin`, {
    headers: { Origin: clientUrl, Authorization: `Bearer ${adminPassword}` },
  })
  assert.equal(adminResponse.status, 200)
  assert.equal((await adminResponse.json()).ranking.rankings.length, 3)

  await database.query("UPDATE companies SET current_price = 20 WHERE id = 'A'")
  const changed = await refreshRankings(database, { initialCash: 100 })
  assert.equal(changed.rankings[0].nickname, '앨리스')
  assert.equal(changed.rankings[0].totalAssets, 900)

  status = 'FINISHED'
  let releaseEvents, markEntered
  const entered = new Promise(resolve => { markEntered = resolve })
  pendingEvents = { then(resolve) { markEntered(); releaseEvents = resolve } }
  const finalRequest = fetch(`${base}/admin`, { headers: { Authorization: `Bearer ${adminPassword}` } })
  await entered
  // The last event has not applied yet; the HTTP request must not freeze old prices.
  await database.query("UPDATE companies SET current_price = 30 WHERE id = 'A'")
  releaseEvents()
  const final = (await (await finalRequest).json()).ranking
  assert.equal(final.final, true)
  assert.equal(final.rankings.find(({ nickname }) => nickname === '앨리스').totalAssets, 1100)
  await database.query('UPDATE wallets SET cash = 999999 WHERE game_id = $1 AND user_id = $2', [ACTIVE_GAME_ID, charlieId])
  const frozen = await refreshRankings(database, { initialCash: 100 })
  assert.equal(frozen.final, true)
  assert.equal(frozen.rankings.find(({ nickname }) => nickname === '찰리').totalAssets, 100)
})
