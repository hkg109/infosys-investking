import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { GameEngine } from '../src/game-engine.js'
import { loadGameState } from '../src/game-store.js'
import { digestSessionToken, SESSION_COOKIE_NAME } from '../src/session-auth.js'
import { createTradingRouter } from '../src/trading.js'

const clientUrl = 'http://localhost:5173'

function runningGame() {
  const startedAt = new Date(Date.now() - 40_000).toISOString()
  return {
    status: 'RUNNING', phase: 'TRADING', phaseBeforePause: null,
    currentRound: 1, totalRounds: 12, roundDurationSeconds: 600,
    tradingDurationSeconds: 540, tradingEnabled: true, remainingSeconds: 500,
    startedAt, roundStartedAt: startedAt,
    phaseEndsAt: new Date(Date.now() + 500_000).toISOString(),
    pausedAt: null, finishedAt: null, serverTime: new Date().toISOString(),
  }
}

test('trading API rejects missing databases and unrelated origins', async (t) => {
  const engine = { getSnapshot: runningGame }
  const app = express()
  app.use('/api/trading', createTradingRouter(null, engine, { clientUrl }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/api/trading/market`
  assert.equal((await fetch(url)).status, 503)
  assert.equal((await fetch(url, { headers: { Origin: 'https://unrelated.example' } })).status, 403)
})

test('PostgreSQL trading: validation, buy/sell, idempotency and row locking', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30000,
}, async (t) => {
  const schema = `test_trading_${randomUUID().replaceAll('-', '')}`
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

  async function createUser(nickname) {
    const userId = randomUUID()
    const token = randomBytes(32).toString('hex')
    await database.query(`INSERT INTO users (id, nickname, pin_hash) VALUES ($1, $2, 'test-only')`, [userId, nickname])
    await database.query(`INSERT INTO user_sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '1 hour')`, [digestSessionToken(token), userId])
    return { userId, cookie: `${SESSION_COOKIE_NAME}=${token}` }
  }

  const state = runningGame()
  const engine = { getSnapshot: () => ({ ...state, serverTime: new Date().toISOString() }) }
  const app = express()
  app.use(express.json())
  app.use('/api/trading', createTradingRouter(database, engine, { clientUrl }))
  app.use((_error, _request, response, _next) => response.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/trading`
  const request = (path, options = {}) => fetch(`${base}${path}`, {
    ...options,
    headers: { Origin: clientUrl, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  const order = (cookie, body) => request('/orders', {
    method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify(body),
  })

  const user = await createUser('거래 테스트')
  const market = await request('/market')
  assert.equal(market.status, 200)
  assert.equal((await market.json()).companies.length, 7)
  assert.equal((await request('/portfolio')).status, 401)
  const initial = await request('/portfolio', { headers: { Cookie: user.cookie } })
  assert.equal((await initial.json()).account.cash, 1_000_000)

  assert.equal((await order(user.cookie, { orderId: 'bad', companyId: 'A', type: 'BUY', quantity: 1 })).status, 400)
  const buyId = randomUUID()
  const bought = await order(user.cookie, { orderId: buyId, companyId: 'A', type: 'BUY', quantity: 10 })
  assert.equal(bought.status, 201)
  const boughtBody = await bought.json()
  assert.equal(boughtBody.account.cash, 900_000)
  assert.equal(boughtBody.account.holdings.find((item) => item.companyId === 'A').quantity, 10)

  const duplicate = await order(user.cookie, { orderId: buyId, companyId: 'A', type: 'BUY', quantity: 10 })
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).duplicate, true)
  assert.equal((await order(user.cookie, { orderId: buyId, companyId: 'A', type: 'BUY', quantity: 11 })).status, 409)

  const sold = await order(user.cookie, { orderId: randomUUID(), companyId: 'A', type: 'SELL', quantity: 4 })
  assert.equal(sold.status, 201)
  const soldBody = await sold.json()
  assert.equal(soldBody.account.cash, 940_000)
  assert.equal(soldBody.account.holdings.find((item) => item.companyId === 'A').quantity, 6)
  assert.equal((await order(user.cookie, { orderId: randomUUID(), companyId: 'A', type: 'SELL', quantity: 7 })).status, 409)

  const concurrent = await createUser('동시 거래')
  const results = await Promise.all([80, 80].map(() => order(concurrent.cookie, {
    orderId: randomUUID(), companyId: 'B', type: 'BUY', quantity: 80,
  })))
  assert.deepEqual(results.map((response) => response.status).sort(), [201, 409])
  const afterConcurrent = await request('/portfolio', { headers: { Cookie: concurrent.cookie } })
  const concurrentAccount = (await afterConcurrent.json()).account
  assert.equal(concurrentAccount.cash, 200_000)
  assert.equal(concurrentAccount.holdings.find((item) => item.companyId === 'B').quantity, 80)

  const retryUser = await createUser('중복 요청')
  const retryId = randomUUID()
  const retryResults = await Promise.all([1, 2].map(() => order(retryUser.cookie, {
    orderId: retryId, companyId: 'C', type: 'BUY', quantity: 50,
  })))
  assert.deepEqual(retryResults.map((response) => response.status).sort(), [200, 201])
  const transactionCount = await database.query('SELECT COUNT(*)::int AS count FROM transactions WHERE order_id = $1', [retryId])
  assert.equal(transactionCount.rows[0].count, 1)

  const persisted = await loadGameState(database, { totalRounds: 12, roundDurationMs: 600_000, tradingDurationMs: 540_000 })
  const restored = new GameEngine({ initialState: persisted })
  t.after(() => restored.shutdown())
  assert.equal(restored.getSnapshot().status, 'RUNNING')
  assert.equal(restored.getSnapshot().currentRound, 1)

  state.tradingEnabled = false
  state.phase = 'RESULT'
  assert.equal((await order(user.cookie, { orderId: buyId, companyId: 'A', type: 'BUY', quantity: 10 })).status, 200)
  assert.equal((await order(user.cookie, { orderId: randomUUID(), companyId: 'A', type: 'BUY', quantity: 1 })).status, 409)
})
