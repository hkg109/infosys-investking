import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { createAdminRouter } from '../src/admin-routes.js'
import { applyScheduledEvent, createEvent, saveGameSchedule } from '../src/events.js'
import { ACTIVE_GAME_ID, loadGameState } from '../src/game-store.js'
import { getCompanyPriceHistory, getTradeHistory, recordRoundClose, recordRoundOpen } from '../src/market-history.js'
import { digestSessionToken, SESSION_COOKIE_NAME } from '../src/session-auth.js'
import { createTradingRouter } from '../src/trading.js'

const clientUrl = 'http://localhost:5173'

test('PostgreSQL market history: private monthly trades, admin access, FIFO profit and price snapshots', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30_000,
}, async (t) => {
  const schema = `test_history_${randomUUID().replaceAll('-', '')}`
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

  async function createUser(nickname) {
    const userId = randomUUID()
    const token = randomBytes(32).toString('hex')
    await database.query("INSERT INTO users (id, nickname, pin_hash) VALUES ($1,$2,'test-only')", [userId, nickname])
    await database.query(`INSERT INTO user_sessions (token_hash, user_id, expires_at)
      VALUES ($1,$2,NOW() + INTERVAL '1 hour')`, [digestSessionToken(token), userId])
    return { userId, cookie: `${SESSION_COOKIE_NAME}=${token}` }
  }
  const user = await createUser('분석 참가자')
  const other = await createUser('다른 참가자')
  const addTrade = (userId, round, type, quantity, price, seconds) => database.query(`INSERT INTO transactions
    (id, order_id, game_id, user_id, round_number, company_id, type, quantity, price, total_price, created_at)
    VALUES ($1,$2,$3,$4,$5,'A',$6,$7,$8,$9,NOW() + $10 * INTERVAL '1 second')`, [
    randomUUID(), randomUUID(), ACTIVE_GAME_ID, userId, round, type, quantity, price, quantity * price, seconds,
  ])
  await addTrade(user.userId, 1, 'BUY', 10, 100, 1)
  await addTrade(user.userId, 1, 'BUY', 5, 200, 2)
  await addTrade(user.userId, 1, 'SELL', 12, 300, 3)
  await addTrade(user.userId, 2, 'SELL', 3, 400, 4)
  await addTrade(other.userId, 1, 'BUY', 1, 100, 5)

  const firstMonth = await getTradeHistory(database, user.userId, { round: 1 })
  assert.equal(firstMonth.trades.length, 3)
  assert.equal(firstMonth.trades[2].realizedProfit, 2200)
  assert.deepEqual(firstMonth.summary, {
    tradeCount: 3, buyQuantity: 15, sellQuantity: 12,
    buyAmount: 2000, sellAmount: 3600, netCashFlow: 1600, realizedProfit: 2200,
  })
  const secondMonth = await getTradeHistory(database, user.userId, { round: 2 })
  assert.equal(secondMonth.trades[0].realizedProfit, 600)

  const snapshot = {
    status: 'RUNNING', phase: 'TRADING', phaseBeforePause: null, currentRound: 1, totalRounds: 2,
    tradingEnabled: true, tradingDurationSeconds: 60, roundDurationSeconds: 70,
  }
  const app = express()
  app.use('/api/trading', createTradingRouter(database, { getSnapshot: () => snapshot }, { clientUrl }))
  app.use('/api/admin', createAdminRouter(database, {
    adminPassword: 'history-admin', clientUrl, initialCash: 1_000_000,
    presence: { isOnline: () => false, onlineCount: () => 0 },
  }))
  app.use((_error, _request, response, _next) => response.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(`${base}/api/trading/history?round=1`)).status, 401)
  const own = await fetch(`${base}/api/trading/history?round=1`, { headers: { Cookie: user.cookie, Origin: clientUrl } })
  assert.equal(own.status, 200)
  assert.equal((await own.json()).trades.length, 3)
  assert.equal((await fetch(`${base}/api/trading/history?round=3`, { headers: { Cookie: user.cookie } })).status, 400)
  const adminUrl = `${base}/api/admin/participants/${user.userId}/trades?round=2`
  assert.equal((await fetch(adminUrl)).status, 401)
  const adminHistory = await fetch(adminUrl, { headers: { Authorization: 'Bearer history-admin' } })
  assert.equal(adminHistory.status, 200)
  assert.equal((await adminHistory.json()).trades.length, 1)

  await recordRoundOpen(database, 1)
  const event = await createEvent(database, {
    title: 'A사 호재', news: '장중 호재 발생', result: 'A사 주가 상승',
    effects: [{ companyId: 'A', changeRate: 10 }],
  })
  const schedule = await saveGameSchedule(database, { rounds: [{ round: 1, events: [{
    eventId: event.eventId, triggerPhase: 'INTRADAY', triggerOffsetSeconds: 10,
  }] }] }, { totalRounds: 2, tradingDurationMs: 60_000, haltDurationMs: 3_000 })
  await applyScheduledEvent(database, schedule[0].gameEventId)
  await applyScheduledEvent(database, schedule[0].gameEventId)
  await recordRoundClose(database, 1)
  await recordRoundClose(database, 1)

  const aHistory = await getCompanyPriceHistory(database, 'A')
  assert.deepEqual(aHistory.history[0].snapshots.map(({ snapshotType }) => snapshotType), ['OPEN', 'INTRADAY_EVENT', 'CLOSE'])
  assert.equal(aHistory.history[0].openingPrice, 10_000)
  assert.equal(aHistory.history[0].closingPrice, 11_000)
  assert.equal(aHistory.history[0].changeRate, 10)
  assert.equal(aHistory.history[0].snapshots[1].event.title, 'A사 호재')
  const bHistory = await getCompanyPriceHistory(database, 'B')
  assert.equal(bHistory.history[0].snapshots[1].price, 10_000)
  assert.equal(bHistory.history[0].snapshots.length, 3)
  const count = await database.query('SELECT COUNT(*)::int AS count FROM stock_price_history WHERE round_number = 1')
  assert.equal(count.rows[0].count, 21)

  const chart = await fetch(`${base}/api/trading/companies/A/history`, { headers: { Cookie: user.cookie } })
  assert.equal(chart.status, 200)
  assert.equal((await chart.json()).history[0].snapshots.length, 3)
})
