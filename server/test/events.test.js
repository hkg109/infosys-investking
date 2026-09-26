import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { createEventRouter } from '../src/event-routes.js'
import { loadGameState } from '../src/game-store.js'
import {
  applyRoundEvent,
  saveGameSchedule,
  createEventCoordinator,
  getGameSchedule,
  validateEventInput,
} from '../src/events.js'

const clientUrl = 'http://localhost:5173'
const adminPassword = 'event-test-admin'

test('event validation rejects duplicate companies and unsafe rates', () => {
  assert.throws(() => validateEventInput({ title: '', news: '뉴스', result: '결과', effects: [] }), { code: 'INVALID_EVENT' })
  assert.throws(() => validateEventInput({
    title: '사건', news: '뉴스', result: '결과',
    effects: [{ companyId: 'A', changeRate: 10 }, { companyId: 'a', changeRate: -5 }],
  }), { code: 'INVALID_EVENT_EFFECT' })
  assert.throws(() => validateEventInput({
    title: '사건', news: '뉴스', result: '결과', effects: [{ companyId: 'A', changeRate: -100 }],
  }), { code: 'INVALID_EVENT_EFFECT' })
  assert.equal(validateEventInput({
    title: '[장중] 긴급 소식', news: '뉴스', result: '결과', effects: [{ companyId: 'A', changeRate: 10 }],
  }).title, '[속보] 긴급 소식')
})

test('event API reports unavailable databases', async (t) => {
  const app = express()
  app.use(express.json())
  app.use('/api/events', createEventRouter(null, { getSnapshot: () => ({ status: 'WAITING', currentRound: 0 }) }, {
    adminPassword, clientUrl,
  }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/events/current`)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'DATABASE_UNAVAILABLE' })
})

test('PostgreSQL events: CRUD, unique scheduling, one-time price changes and socket payloads', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30000,
}, async (t) => {
  const schema = `test_events_${randomUUID().replaceAll('-', '')}`
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

  const game = {
    status: 'WAITING', phase: 'WAITING', currentRound: 0, totalRounds: 3,
    getSnapshot() { return { status: this.status, phase: this.phase, currentRound: this.currentRound, totalRounds: this.totalRounds } },
  }
  const app = express()
  app.use(express.json())
  app.use('/api/events', createEventRouter(database, game, { adminPassword, clientUrl }))
  app.use((_error, _request, response, _next) => response.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/events`
  const request = (path, options = {}) => fetch(`${base}${path}`, {
    ...options,
    headers: {
      Origin: clientUrl,
      Authorization: `Bearer ${adminPassword}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const eventBody = (index, companyId = 'A', changeRate = 10) => ({
    title: `사건 ${index}`,
    news: `사건 ${index}의 사전 뉴스`,
    result: `사건 ${index}의 결과`,
    effects: [{ companyId, changeRate }],
  })

  assert.equal((await fetch(`${base}/admin`)).status, 401)
  assert.equal((await request('/admin', {
    method: 'POST', body: JSON.stringify(eventBody('오류', '없는기업', 10)),
  })).status, 400)

  const created = []
  for (const [index, companyId, rate] of [[1, 'A', 20], [2, 'B', -5], [3, 'C', 15], [4, 'D', 8]]) {
    const response = await request('/admin', { method: 'POST', body: JSON.stringify(eventBody(index, companyId, rate)) })
    assert.equal(response.status, 201)
    created.push((await response.json()).event)
  }
  const updated = await request(`/admin/${created[0].eventId}`, {
    method: 'PUT', body: JSON.stringify(eventBody('수정', 'A', 25)),
  })
  assert.equal(updated.status, 200)
  assert.equal((await updated.json()).event.effects[0].changeRate, 25)
  assert.equal((await request(`/admin/${created[3].eventId}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request('/admin').then((response) => response.json())).events.length, 3)

  const startCoordinator = createEventCoordinator(database, { emit() {} })
  await startCoordinator.prepareGameStart({ totalRounds: 12 })
  assert.deepEqual(await getGameSchedule(database), [])
  await startCoordinator.reconcile({ status: 'FINISHED', phase: 'RESULT', currentRound: 3 })
  assert.deepEqual(await getGameSchedule(database), [])
  assert.equal((await database.query('SELECT * FROM event_schedule_states')).rowCount, 0)
  await saveGameSchedule(database, { rounds: [] }, { totalRounds: 3 })
  await startCoordinator.prepareGameStart({ totalRounds: 3 })
  assert.deepEqual(await getGameSchedule(database), [])
  assert.equal((await fetch(`${base}/admin/schedule/randomize`, { method: 'POST' })).status, 401)
  assert.equal((await request('/admin/schedule/randomize', { method: 'POST', headers: { Origin: 'https://invalid.example' } })).status, 403)
  const assigned = await saveGameSchedule(database, { rounds: created.slice(0, 3).map((event, index) => ({
    round: index + 1, events: [{ eventId: event.eventId, displayOrder: 1, triggerPhase: 'CLOSE' }],
  })) }, { totalRounds: 3, tradingDurationMs: 540000, haltDurationMs: 3000 })
  await database.query("UPDATE event_schedule_states SET mode='RANDOM'")
  await startCoordinator.prepareGameStart({ totalRounds: 3 })
  await startCoordinator.reconcile({ status: 'PAUSED', phase: 'TRADING', currentRound: 1 })
  assert.equal((await database.query('SELECT mode FROM event_schedule_states')).rows[0].mode, 'RANDOM')
  assert.equal(assigned.length, 3)
  assert.equal(new Set(assigned.map(({ eventId }) => eventId)).size, 3)
  assert.deepEqual(assigned.map(({ round }) => round), [1, 2, 3])
  assert.deepEqual(await getGameSchedule(database), assigned)

  const emitted = []
  const coordinator = createEventCoordinator(database, { emit: (name, payload) => emitted.push({ name, payload }) })
  game.status = 'RUNNING'
  game.phase = 'TRADING'
  game.currentRound = 1
  await coordinator.handleGameEvent({ name: 'round:start', payload: game.getSnapshot() })
  assert.equal(emitted[0].name, 'news:publish')
  assert.equal(emitted[0].payload.round, 1)
  assert.equal('result' in emitted[0].payload, false)
  assert.equal('changes' in emitted[0].payload, false)

  const [firstApply, duplicateApply] = await Promise.all([applyRoundEvent(database, 1), applyRoundEvent(database, 1)])
  assert.deepEqual(duplicateApply.changes, firstApply.changes)
  assert.equal(firstApply.changes.length, 1)
  const priceChanges = await database.query('SELECT COUNT(*)::int AS count FROM stock_price_changes WHERE round_number = 1')
  assert.equal(priceChanges.rows[0].count, 1)
  const changedCompany = await database.query('SELECT current_price FROM companies WHERE id = $1', [firstApply.changes[0].companyId])
  assert.equal(Number(changedCompany.rows[0].current_price), firstApply.changes[0].newPrice)

  await coordinator.handleGameEvent({ name: 'trading:close', payload: game.getSnapshot() })
  assert.deepEqual(emitted.slice(-2).map(({ name }) => name), ['event:result', 'stock:update'])
  const current = await fetch(`${base}/current`, { headers: { Origin: clientUrl } })
  const currentBody = await current.json()
  assert.equal(currentBody.event.applied, true)
  assert.equal(currentBody.event.changes.length, 1)

  const closed = await request('/admin', { method: 'POST', body: JSON.stringify(eventBody(5, 'E', 5)) })
  assert.equal(closed.status, 409)
  assert.equal((await closed.json()).error, 'EVENT_MANAGEMENT_CLOSED')
})
