import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import { ACTIVE_GAME_ID, loadGameState } from '../src/game-store.js'
import { createBroadcastRouter } from '../src/broadcast.js'
import { refreshRankings } from '../src/rankings.js'
import { createGameResetCoordinator } from '../src/game-reset.js'
const options = { skip: !process.env.TEST_DATABASE_URL, timeout: 30000 }
const now = Date.parse('2026-09-20T12:00:00Z')
async function setup(t, databaseEnabled = true) {
  let database, admin, schema
  if (databaseEnabled) {
    schema = `test_broadcast_${randomUUID().replaceAll('-', '')}`
    admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
    await admin.query(`CREATE SCHEMA "${schema}"`)
    database = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
    t.after(async () => { await database.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end() })
    await database.query(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'))
    await loadGameState(database, { totalRounds: 4, roundDurationMs: 70000, tradingDurationMs: 60000 })
  }
  let halted = false
  const app = express()
  app.use('/api/broadcast', createBroadcastRouter(database, { clientUrl: 'http://localhost:5173', now: () => now, isHalted: () => halted }))
  app.use((_error, _req, res, _next) => res.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const request = (init) => fetch(`http://127.0.0.1:${server.address().port}/api/broadcast`, init)
  return { database, request, feed: async () => (await request()).json(), halt: value => { halted = value } }
}
test('broadcast HTTP is anonymous, uncached, origin restricted and read only', options, async t => {
  const c = await setup(t)
  const response = await c.request()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const feed = await response.json()
  assert.equal(feed.game.status, 'WAITING'); assert.equal(feed.game.remainingSeconds, null)
  assert.deepEqual(feed.news, []); assert.deepEqual(feed.ranking.rankings, [])
  assert.equal(feed.market.length, 7)
  assert.equal((await c.request({ headers: { Origin: 'https://evil.test' } })).status, 403)
  const cors = await c.request({ method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })
  assert.equal(cors.status, 204); assert.equal(cors.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173')
  assert.equal((await c.request({ method: 'POST' })).status, 404)
  assert.equal((await c.database.query('SELECT count(*)::int AS n FROM ranking_states')).rows[0].n, 0)
})
test('broadcast omits identities, future news, untriggered intraday content and unapplied effects', options, async t => {
  const c = await setup(t), uid = randomUUID()
  await c.database.query("INSERT INTO users(id,nickname,pin_hash) VALUES($1,'PRIVATE_NICKNAME','PRIVATE_PIN')", [uid])
  await refreshRankings(c.database)
  await c.database.query("UPDATE games SET status='RUNNING',phase='TRADING',current_round=1,phase_ends_at=$1", [new Date(now + 12500)])
  const ids = []
  for (const [round, order, trigger, title] of [[1,1,'CLOSE','PUBLIC_NEWS'],[1,2,'INTRADAY','HIDDEN_INTRADAY'],[2,1,'CLOSE','FUTURE_NEWS']]) {
    const eid = randomUUID(), gid = randomUUID(); ids.push(gid)
    await c.database.query('INSERT INTO events(id,title,news,result) VALUES($1,$2,$4,$3)', [eid,title,`SECRET_RESULT_${order}_${round}`,title])
    await c.database.query(`INSERT INTO game_events(id,game_id,event_id,round_number,display_order,trigger_phase,trigger_offset_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [gid,ACTIVE_GAME_ID,eid,round,order,trigger,trigger==='INTRADAY'?30000:null])
  }
  let feed = await c.feed(), text = JSON.stringify(feed)
  for (const secret of [uid,'PRIVATE_NICKNAME','PRIVATE_PIN','HIDDEN_INTRADAY','FUTURE_NEWS','SECRET_RESULT','userId','nickname','cash','stockValue']) assert.equal(text.includes(secret), false, secret)
  assert.equal(feed.news[0].title, 'PUBLIC_NEWS'); assert.equal(feed.game.remainingSeconds, 13)
  assert.equal(feed.ranking.rankings[0].totalAssets, 1000000)
  await c.database.query('UPDATE game_events SET warning_sent_at=NOW() WHERE id=$1', [ids[1]])
  feed = await c.feed(); assert.equal(feed.warnings.length, 1); assert.equal(JSON.stringify(feed).includes('HIDDEN_INTRADAY'), false)
  await c.database.query('UPDATE game_events SET applied_at=NOW() WHERE id=$1', [ids[1]])
  await c.database.query(`INSERT INTO stock_price_changes(game_event_id,game_id,round_number,event_id,company_id,previous_price,new_price,change_rate)
    SELECT id,game_id,round_number,event_id,'A',10000,11000,10 FROM game_events WHERE id=$1`, [ids[1]])
  feed = await c.feed(); assert.equal(feed.warnings.length, 0); assert.equal(feed.results[0].title, 'HIDDEN_INTRADAY')
  assert.equal(feed.results[0].result, 'SECRET_RESULT_2_1')
  assert.deepEqual(feed.results[0].changes, [{ companyId:'A', previousPrice:10000, newPrice:11000, changeRate:10 }])
})
test('broadcast timer, halt, refreshed prices, tied final rankings and game reset', options, async t => {
  const c = await setup(t)
  for (let i=0;i<4;i++) await c.database.query("INSERT INTO users(id,nickname,pin_hash) VALUES($1,$2,'private')", [randomUUID(),`player${i}`])
  await refreshRankings(c.database)
  await c.database.query("UPDATE games SET status='RUNNING',phase='TRADING',current_round=1,phase_ends_at=$1", [new Date(now + 10000)])
  assert.equal((await c.feed()).game.tradingEnabled, true)
  c.halt(true); assert.equal((await c.feed()).game.tradingEnabled, false); c.halt(false)
  await c.database.query("UPDATE games SET status='PAUSED',phase='PAUSED',phase_before_pause='TRADING',paused_remaining_ms=5000")
  assert.equal((await c.feed()).game.remainingSeconds, 5)
  await c.database.query("UPDATE companies SET current_price=11000 WHERE id='A'")
  assert.equal((await c.feed()).market[0].changeRate, 10)
  await c.database.query("UPDATE games SET status='FINISHED',phase='FINISHED'")
  assert.equal((await c.feed()).ranking.final, false)
  await refreshRankings(c.database, { final: true })
  const final = await c.feed(); assert.equal(final.ranking.final, true); assert.equal(final.ranking.top3.length, 4)
  assert.deepEqual(new Set(final.ranking.rankings.map(({ nickname }) => nickname)), new Set(['player0','player1','player2','player3']))
  assert.equal(final.ranking.rankings.some(entry => 'userId' in entry || 'cash' in entry || 'stockValue' in entry), false)
  await createGameResetCoordinator(c.database, { getSnapshot: () => ({status:'FINISHED'}), reset: () => ({status:'WAITING'}) }).reset()
  const reset = await c.feed(); assert.equal(reset.game.status, 'WAITING'); assert.equal(reset.ranking.final, false)
  assert.deepEqual(reset.ranking.rankings, []); assert.equal(reset.market[0].currentPrice, 10000)
})
test('broadcast without database fails safely', async t => {
  const c = await setup(t, false), response = await c.request()
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'DATABASE_UNAVAILABLE' })
})
