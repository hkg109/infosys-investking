import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { createUserRouter } from '../src/users.js'
import { createTradingRouter } from '../src/trading.js'
import { GameEngine } from '../src/game-engine.js'
import { getTrading, sendOrder } from '../../client/src/trading/api.js'

test('real DB and frontend API: join, trade, lost response, recover and retry after close', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run PostgreSQL tests',
}, async (t) => {
  const schema = `test_flow_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  let database, server, created = false
  const originalFetch = globalThis.fetch
  const game = new GameEngine()
  t.after(async () => {
    globalThis.fetch = originalFetch
    game.shutdown()
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
    await database?.end()
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.end()
  })
  await admin.query(`CREATE SCHEMA "${schema}"`)
  created = true
  database = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  await database.query(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'))
  const app = express()
  app.use(express.json())
  const clientUrl = 'http://localhost:5173'
  app.use('/api/users', createUserRouter(database, { clientUrl }))
  app.use('/api/trading', createTradingRouter(database, game, { clientUrl }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  let cookie = '', loseResponse = false
  // Node has no browser cookie jar. Preserve real Set-Cookie values, never fabricate sessions.
  globalThis.fetch = async (path, options = {}) => {
    const response = await originalFetch(`${base}${path}`, {
      ...options, headers: { Origin: clientUrl, Cookie: cookie, ...options.headers },
    })
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0]
    if (loseResponse && path === '/api/trading/orders') {
      loseResponse = false
      await response.arrayBuffer() // The real server committed before the simulated response loss.
      throw new TypeError('Simulated connection loss after commit')
    }
    return response
  }
  const credentials = { nickname: '통합 검증', pin: '0123' }
  const auth = (action) => fetch(`/api/users/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
  })
  const joined = await auth('join')
  assert.equal(joined.status, 201)
  const userId = (await joined.json()).user.userId
  assert.equal((await getTrading()).account.cash, 1_000_000)
  game.start()
  const bought = await sendOrder({ orderId: randomUUID(), companyId: 'A', type: 'BUY', quantity: 2 })
  assert.equal(bought.account.cash, 980_000)
  const sale = { orderId: randomUUID(), companyId: 'A', type: 'SELL', quantity: 1 }
  loseResponse = true
  await assert.rejects(sendOrder(sale), error => error.uncertain === true)
  game.pause()
  assert.equal((await auth('logout')).status, 204)
  await assert.rejects(getTrading(), /AUTH_REQUIRED/)
  await assert.rejects(sendOrder(sale), error => error.message === 'AUTH_REQUIRED' && error.uncertain)
  const recovered = await auth('recover')
  assert.equal((await recovered.json()).user.userId, userId)
  const confirmed = await sendOrder(sale)
  assert.equal(confirmed.duplicate, true)
  assert.equal(confirmed.account.cash, 990_000)
  assert.equal(confirmed.account.holdings.find(h => h.companyId === 'A').quantity, 1)
  await assert.rejects(sendOrder({ ...sale, orderId: randomUUID() }), /GAME_NOT_RUNNING/)
  const count = await database.query('SELECT COUNT(*)::int AS n FROM transactions WHERE user_id = $1', [userId])
  assert.equal(count.rows[0].n, 2)
})
