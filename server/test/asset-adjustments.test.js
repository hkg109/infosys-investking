import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { adjustAssets } from '../src/asset-adjustments.js'
import { createAdminRouter } from '../src/admin-routes.js'
import { ACTIVE_GAME_ID, loadGameState } from '../src/game-store.js'

test('stage 18: atomic corrections, concurrent edits, retry, audit and admin boundary', { skip: !process.env.TEST_DATABASE_URL, timeout: 30000 }, async t => {
  const schema = `assets_${randomUUID().replaceAll('-', '')}`
  const root = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  await root.query(`CREATE SCHEMA "${schema}"`)
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  let server
  t.after(async () => {
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
    await db.end(); await root.query(`DROP SCHEMA "${schema}" CASCADE`); await root.end()
  })
  await db.query(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'))
  await loadGameState(db, { totalRounds: 12, roundDurationMs: 60000, tradingDurationMs: 50000 })
  let status = 'WAITING'
  const engine = { getSnapshot: () => ({ status }) }
  const userId = randomUUID()
  await db.query("INSERT INTO users(id,nickname,pin_hash,role) VALUES ($1,'정정대상','hash','USER')", [userId])
  const body = (changes = {}) => ({ requestId: randomUUID(), cash: 900000, expectedCash: 1000000, reason: '운영 정정', ...changes })
  const change = data => adjustAssets(db, engine, userId, data)
  const cash = async () => Number((await db.query('SELECT cash FROM wallets WHERE user_id=$1', [userId])).rows[0]?.cash)
  const qty = async () => Number((await db.query("SELECT quantity FROM portfolios WHERE user_id=$1 AND company_id='A'", [userId])).rows[0]?.quantity || 0)
  const reject = (data, code) => assert.rejects(change(data), e => e.code === code)
  await t.test('validation, missing participant and company roll back', async () => {
    for (const patch of [{ cash: -1 }, { cash: 1.5 }, { cash: 1e12 + 1 }, { expectedCash: -1 }, { reason: ' ' }, { requestId: 'bad' }, { companyId: 'A', quantity: -1, expectedQuantity: 0 }]) await reject(body(patch), 'INVALID_INPUT')
    await assert.rejects(adjustAssets(db, engine, randomUUID(), body()), e => e.code === 'PARTICIPANT_NOT_FOUND')
    await reject(body({ companyId: 'MISSING', quantity: 1, expectedQuantity: 0 }), 'COMPANY_NOT_FOUND')
    assert.equal((await db.query('SELECT * FROM wallets WHERE user_id=$1', [userId])).rowCount, 0)
  })
  const first = body({ companyId: 'A', quantity: 5, expectedQuantity: 0 })
  await t.test('cash and stock commit together with one audit row; same request cannot repeat', async () => {
    const replies = await Promise.all([change(first), change(first)])
    assert.deepEqual(replies.map(r => r.duplicate).sort(), [false, true])
    assert.equal(await cash(), 900000); assert.equal(await qty(), 5)
    assert.equal((await db.query('SELECT * FROM asset_adjustments')).rowCount, 1)
    assert.equal((await db.query('SELECT * FROM transactions')).rowCount, 0)
    await reject({ ...first, cash: 800000 }, 'ADJUSTMENT_ID_CONFLICT')
  })
  await t.test('stale cash or holding cannot overwrite another correction', async () => {
    await assert.rejects(change(body({ companyId: 'A', quantity: 8, expectedQuantity: 5 })), error => {
      assert.equal(error.code, 'ASSET_CONFLICT')
      assert.deepEqual(error.details.current, { cash: 900000, quantity: 5 })
      return true
    })
    await reject(body({ expectedCash: 900000, cash: 800000, companyId: 'A', quantity: 8, expectedQuantity: 0 }), 'ASSET_CONFLICT')
    const results = await Promise.allSettled([change(body({ expectedCash: 900000, cash: 800000 })), change(body({ expectedCash: 900000, cash: 700000 }))])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'ASSET_CONFLICT')
  })
  await t.test('paused supported; inactive stock can be removed but not granted', async () => {
    status = 'PAUSED'; await db.query("UPDATE games SET status='PAUSED'")
    await db.query("UPDATE companies SET is_active=FALSE WHERE id='A'")
    const current = await cash()
    await reject(body({ expectedCash: current, cash: current, companyId: 'A', quantity: 6, expectedQuantity: 5 }), 'COMPANY_INACTIVE')
    await change(body({ expectedCash: current, cash: 0, companyId: 'A', quantity: 0, expectedQuantity: 5 }))
    assert.equal(await cash(), 0); assert.equal(await qty(), 0)
    await reject(body({ expectedCash: 0, cash: 0 }), 'NO_ASSET_CHANGE')
  })
  await t.test('overflow rolls back both changes and audit', async () => {
    await db.query("UPDATE companies SET is_active=TRUE,current_price=9007199254740991 WHERE id='A'")
    const count = (await db.query('SELECT * FROM asset_adjustments')).rowCount
    await reject(body({ expectedCash: 0, cash: 1, companyId: 'A', quantity: 2, expectedQuantity: 0 }), 'ASSET_LIMIT_EXCEEDED')
    assert.equal(await cash(), 0); assert.equal(await qty(), 0)
    assert.equal((await db.query('SELECT * FROM asset_adjustments')).rowCount, count)
    await db.query("UPDATE companies SET current_price=10000 WHERE id='A'")
  })
  await t.test('running and finished reject new edits but permit committed retry', async () => {
    for (const state of ['RUNNING', 'FINISHED']) {
      status = state; await db.query('UPDATE games SET status=$1', [state])
      await reject(body({ expectedCash: 0 }), 'ASSET_ADJUSTMENT_CLOSED')
      assert.equal((await change(first)).duplicate, true)
    }
    status = 'PAUSED'; await db.query("UPDATE games SET status='PAUSED'")
  })
  await t.test('resume while waiting on the user lock prevents commit', async () => {
    const holder = await db.connect()
    await holder.query('BEGIN'); await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`order-user:${userId}`])
    let reached
    const locked = new Promise(resolve => { reached = resolve })
    const wrapped = { connect: async () => {
      const client = await db.connect()
      return { query: async (sql, values) => { if (values?.[0] === `order-user:${userId}`) reached(); return client.query(sql, values) }, release: () => client.release() }
    } }
    const operation = adjustAssets(wrapped, engine, userId, body({ expectedCash: 0 }))
    const rejected = assert.rejects(operation, e => e.code === 'ASSET_ADJUSTMENT_CLOSED')
    await locked; status = 'RUNNING'; await holder.query('COMMIT'); holder.release()
    await rejected; assert.equal(await cash(), 0); status = 'PAUSED'
  })
  await t.test('HTTP authentication, origin, audit privacy and post-commit retry', async () => {
    let callbacks = 0
    const app = express(); app.use(express.json())
    app.use('/api/admin', createAdminRouter(db, { adminPassword: 'test-only', clientUrl: 'http://localhost:5173', engine,
      presence: { isOnline: () => false, onlineCount: () => 0 }, onAssetsAdjusted: async () => { if (++callbacks === 1) throw new Error('lost refresh') } }))
    app.use((_e, _q, res, _n) => res.status(500).json({ error: 'INTERNAL_ERROR' }))
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    const url = `http://127.0.0.1:${server.address().port}/api/admin/participants/${userId}`
    const headers = { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' }
    assert.equal((await fetch(`${url}/adjustments`)).status, 401)
    assert.equal((await fetch(`${url}/assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) })).status, 401)
    assert.equal((await fetch(`${url}/assets`, { method: 'POST', headers: { ...headers, Origin: 'http://evil.invalid' }, body: JSON.stringify(body()) })).status, 403)
    const payload = body({ expectedCash: 0, cash: 123 })
    const request = () => fetch(`${url}/assets`, { method: 'POST', headers, body: JSON.stringify(payload) })
    assert.equal((await request()).status, 500)
    assert.equal(await cash(), 123)
    const retry = await request(); assert.equal(retry.status, 200); assert.equal((await retry.json()).duplicate, true)
    const history = await (await fetch(`${url}/adjustments`, { headers })).json()
    assert.equal(history.adjustments.filter(r => r.requestId === payload.requestId).length, 1)
    assert.equal(history.adjustments[0].reason, '운영 정정')
  })
})
