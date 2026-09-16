import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { createCompanyRouter } from '../src/company-routes.js'
import { EventError, createEvent } from '../src/events.js'
import { GameEngine } from '../src/game-engine.js'
import { ACTIVE_GAME_ID, saveGameState } from '../src/game-store.js'
import { createTradingRouter } from '../src/trading.js'

const clientUrl = 'http://localhost:5173'
const adminPassword = 'company-admin'

function testEngine() {
  return new GameEngine({
    totalRounds: 1,
    roundDurationMs: 1_000,
    tradingDurationMs: 900,
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
  })
}

test('company API reports unavailable databases and rejects unrelated origins', async (t) => {
  const app = express()
  app.use('/api/companies', createCompanyRouter(null, testEngine(), { adminPassword, clientUrl }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/api/companies/admin`
  assert.equal((await fetch(url)).status, 503)
  assert.equal((await fetch(url, { headers: { Origin: 'https://example.com' } })).status, 403)
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: clientUrl } })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('access-control-allow-methods'), /DELETE/)
})

test('PostgreSQL companies: manage while waiting, preserve references, and hide inactive stocks', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30000,
}, async (t) => {
  const schema = `test_companies_${randomUUID().replaceAll('-', '')}`
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
  const engine = testEngine()
  await saveGameState(database, engine.getSnapshot())

  const app = express()
  app.use(express.json())
  app.use('/api/companies', createCompanyRouter(database, engine, { adminPassword, clientUrl }))
  app.use('/api/trading', createTradingRouter(database, engine, { clientUrl }))
  app.use((_error, _request, response, _next) => response.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const headers = { Authorization: `Bearer ${adminPassword}`, 'Content-Type': 'application/json' }
  const request = (path, options = {}) => fetch(`${baseUrl}/api/companies${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })

  assert.equal((await fetch(`${baseUrl}/api/companies/admin`)).status, 401)
  let response = await request('/admin')
  assert.equal(response.status, 200)
  assert.equal((await response.json()).companies.length, 7)

  for (const body of [
    { companyId: '공백 코드', name: '기업', description: '', initialPrice: 1000 },
    { companyId: 'H', name: '', description: '', initialPrice: 1000 },
    { companyId: 'H', name: '기업', description: '', initialPrice: 0 },
    { companyId: 'H', name: '기업', description: '', initialPrice: 1000, isActive: 'yes' },
  ]) {
    response = await request('/admin', { method: 'POST', body: JSON.stringify(body) })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'INVALID_COMPANY' })
  }

  response = await request('/admin', {
    method: 'POST',
    body: JSON.stringify({ companyId: 'h', name: ' H 로보틱스 ', description: '로봇 기업', initialPrice: 15000 }),
  })
  assert.equal(response.status, 201)
  let company = (await response.json()).company
  assert.deepEqual({ id: company.companyId, name: company.name, initialPrice: company.initialPrice, currentPrice: company.currentPrice, active: company.isActive },
    { id: 'H', name: 'H 로보틱스', initialPrice: 15000, currentPrice: 15000, active: true })

  response = await request('/admin', {
    method: 'POST',
    body: JSON.stringify({ companyId: 'H', name: '중복', description: '', initialPrice: 1000 }),
  })
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'COMPANY_ID_TAKEN' })

  response = await request('/admin/H', {
    method: 'PUT',
    body: JSON.stringify({ name: 'H 모빌리티', description: '수정 설명', initialPrice: 20000, isActive: true }),
  })
  assert.equal(response.status, 200)
  company = (await response.json()).company
  assert.deepEqual({ name: company.name, initialPrice: company.initialPrice, currentPrice: company.currentPrice },
    { name: 'H 모빌리티', initialPrice: 20000, currentPrice: 20000 })

  response = await request('/admin/NOPE', {
    method: 'PUT',
    body: JSON.stringify({ name: '없음', description: '', initialPrice: 1000, isActive: true }),
  })
  assert.equal(response.status, 404)

  const userId = randomUUID()
  const orderId = randomUUID()
  const eventId = randomUUID()
  await database.query("INSERT INTO users (id, nickname, pin_hash, role) VALUES ($1, '참가자', 'hash', 'USER')", [userId])
  await database.query(`INSERT INTO portfolios (game_id, user_id, company_id, quantity)
    VALUES ($1, $2, 'H', 2)`, [ACTIVE_GAME_ID, userId])
  await database.query(`INSERT INTO transactions
    (id, order_id, game_id, user_id, company_id, type, quantity, price, total_price)
    VALUES ($1, $2, $3, $4, 'H', 'BUY', 2, 20000, 40000)`, [randomUUID(), orderId, ACTIVE_GAME_ID, userId])
  await database.query("INSERT INTO events (id, title, news, result) VALUES ($1, 'H 사건', '뉴스', '결과')", [eventId])
  await database.query("INSERT INTO event_effects (event_id, company_id, change_rate) VALUES ($1, 'H', 10)", [eventId])

  response = await request('/admin')
  company = (await response.json()).companies.find(({ companyId }) => companyId === 'H')
  assert.deepEqual(company.references, { transactions: 1, holdings: 1, eventEffects: 1 })

  response = await request('/admin/H', { method: 'DELETE' })
  assert.equal(response.status, 204)
  const stored = (await database.query("SELECT is_active FROM companies WHERE id = 'H'")).rows[0]
  assert.equal(stored.is_active, false)
  assert.equal(Number((await database.query("SELECT COUNT(*) AS count FROM transactions WHERE company_id = 'H'")).rows[0].count), 1)
  assert.equal(Number((await database.query("SELECT COUNT(*) AS count FROM portfolios WHERE company_id = 'H'")).rows[0].count), 1)
  assert.equal(Number((await database.query("SELECT COUNT(*) AS count FROM event_effects WHERE company_id = 'H'")).rows[0].count), 1)

  response = await fetch(`${baseUrl}/api/trading/market`)
  assert.equal((await response.json()).companies.some(({ companyId }) => companyId === 'H'), false)
  await assert.rejects(() => createEvent(database, {
    title: '비활성 사건', news: '뉴스', result: '결과', effects: [{ companyId: 'H', changeRate: 5 }],
  }), (error) => error instanceof EventError && error.code === 'COMPANY_INACTIVE')

  response = await request('/admin/H', {
    method: 'PUT',
    body: JSON.stringify({ name: 'H 모빌리티', description: '재활성화', initialPrice: 21000, isActive: true }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).company.references, { transactions: 1, holdings: 1, eventEffects: 1 })
  response = await fetch(`${baseUrl}/api/trading/market`)
  assert.equal((await response.json()).companies.some(({ companyId }) => companyId === 'H'), true)

  engine.start()
  response = await request('/admin', {
    method: 'POST',
    body: JSON.stringify({ companyId: 'I', name: '진행 중 생성', description: '', initialPrice: 1000 }),
  })
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { error: 'COMPANY_MANAGEMENT_CLOSED', status: 'RUNNING' })
  assert.equal((await request('/admin/H', { method: 'DELETE' })).status, 409)
  assert.equal((await request('/admin')).status, 200)
})
