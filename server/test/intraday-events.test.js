import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { createEventRouter } from '../src/event-routes.js'
import { createMarketGate, MarketHaltedError } from '../src/market-gate.js'
import {
  applyScheduledEvent,
  createEvent,
  createEventCoordinator,
  getGameSchedule,
  getRoundEvents,
  saveGameSchedule,
} from '../src/events.js'
import { loadGameState } from '../src/game-store.js'

test('market gate drains admitted orders and rejects new orders during a halt', async () => {
  const gate = createMarketGate()
  const release = gate.admit()
  let drained = false
  const halt = gate.halt().then(() => { drained = true })
  assert.equal(gate.isHalted(), true)
  assert.throws(() => gate.admit(), MarketHaltedError)
  await Promise.resolve()
  assert.equal(drained, false)
  release()
  await halt
  assert.equal(drained, true)
  gate.resume()
  gate.admit()()
})

test('PostgreSQL multi-event schedule supports empty rounds, intraday execution and exactly-once changes', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30_000,
}, async (t) => {
  const schema = `test_intraday_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  let database
  let server
  t.after(async () => {
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections() })
    await database?.end()
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.end()
  })
  await admin.query(`CREATE SCHEMA "${schema}"`)
  database = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  const schemaSql = await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8')
  await database.query(schemaSql)
  await database.query(schemaSql)
  await loadGameState(database, { totalRounds: 2, roundDurationMs: 70_000, tradingDurationMs: 60_000 })

  const makeEvent = (title, rate) => createEvent(database, {
    title, news: `${title} 속보`, result: `${title} 결과`, effects: [{ companyId: 'A', changeRate: rate }],
  })
  const [first, second, closing] = await Promise.all([
    makeEvent('장중 상승', 10), makeEvent('장중 하락', -10), makeEvent('마감 상승', 5),
  ])
  const scheduleInput = { rounds: [
    { round: 1, events: [
      { eventId: first.eventId, triggerPhase: 'INTRADAY', triggerOffsetSeconds: 10, preannounceSeconds: 2 },
      { eventId: second.eventId, triggerPhase: 'INTRADAY', triggerOffsetSeconds: 20 },
      { eventId: closing.eventId, triggerPhase: 'CLOSE' },
    ] },
    { round: 2, events: [] },
  ] }
  const options = { totalRounds: 2, tradingDurationMs: 60_000, haltDurationMs: 3_000 }
  const saved = await saveGameSchedule(database, scheduleInput, options)
  assert.equal(saved.length, 3)
  assert.deepEqual(saved.map(({ triggerPhase }) => triggerPhase), ['INTRADAY', 'INTRADAY', 'CLOSE'])
  assert.deepEqual(await getRoundEvents(database, 2), [])

  const game = { getSnapshot: () => ({ status: 'WAITING', currentRound: 0, totalRounds: 2, tradingDurationSeconds: 60 }) }
  const app = express()
  app.use(express.json())
  app.use('/api/events', createEventRouter(database, game, { adminPassword: 'intraday-admin', clientUrl: 'http://localhost:5173' }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/events/admin/schedule`
  const headers = { Authorization: 'Bearer intraday-admin', 'Content-Type': 'application/json' }
  assert.equal((await fetch(base)).status, 401)
  const scheduleResponse = await fetch(base, { headers })
  assert.equal(scheduleResponse.status, 200)
  const schedulePayload = await scheduleResponse.json()
  assert.equal(schedulePayload.rounds[1].events.length, 0)
  assert.deepEqual(schedulePayload.constraints, options)
  assert.equal((await fetch(base, { method: 'PUT', headers, body: JSON.stringify(scheduleInput) })).status, 200)
  await assert.rejects(saveGameSchedule(database, { rounds: [{ round: 1, events: [
    { eventId: first.eventId, triggerPhase: 'INTRADAY', triggerOffsetSeconds: 10 },
    { eventId: first.eventId, triggerPhase: 'CLOSE' },
  ] }] }, options), { code: 'DUPLICATE_EVENT_ASSIGNMENT' })
  assert.equal((await getGameSchedule(database)).length, 3)

  const startedAt = Date.now()
  const scheduledTimers = []
  const emitted = []
  const gate = createMarketGate()
  const coordinator = createEventCoordinator(database, { emit: (name, payload) => emitted.push({ name, payload }) }, {
    marketGate: gate,
    getGameSnapshot: () => ({ tradingEnabled: true }),
    onPricesChanged: async () => emitted.push({ name: 'ranking:update' }),
    now: () => startedAt,
    setTimer: (callback, delay) => { const timer = { callback, delay, unref() {} }; scheduledTimers.push(timer); return timer },
    clearTimer: () => {},
    wait: async () => {},
  })
  await coordinator.handleGameEvent({ name: 'round:start', payload: {
    status: 'RUNNING', phase: 'TRADING', currentRound: 1, totalRounds: 2,
    tradingDurationSeconds: 60, roundStartedAt: new Date(startedAt).toISOString(),
  } })
  assert.equal(scheduledTimers.length, 4)
  scheduledTimers.sort((a, b) => a.delay - b.delay)[1].callback()
  await coordinator.waitForIdle()
  assert.deepEqual(emitted.slice(-6).map(({ name }) => name), [
    'trading:halt', 'market:event:breaking', 'event:result', 'stock:update', 'ranking:update', 'trading:resume',
  ])
  assert.equal(gate.isHalted(), false)

  const applied = await getRoundEvents(database, 1)
  assert.equal(applied[0].applied, true)
  const [sameA, sameB] = await Promise.all([
    applyScheduledEvent(database, applied[0].gameEventId),
    applyScheduledEvent(database, applied[0].gameEventId),
  ])
  assert.deepEqual(sameA.changes, sameB.changes)
  const count = await database.query('SELECT COUNT(*)::int AS count FROM stock_price_changes WHERE game_event_id = $1', [applied[0].gameEventId])
  assert.equal(count.rows[0].count, 1)
  const beforeRetiredRequest = await getGameSchedule(database)
  const randomized = await fetch(`${base}/randomize`, {
    method: 'POST', headers, body: JSON.stringify({ intradayEventsPerRound: 0, closingEventsPerRound: 1 }),
  })
  assert.equal(randomized.status, 410)
  assert.deepEqual(await randomized.json(), { error: 'MANUAL_SCHEDULE_ONLY' })
  assert.deepEqual(await getGameSchedule(database), beforeRetiredRequest)
})
