import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { once } from 'node:events'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { createUserRouter } from '../src/users.js'

const clientUrl = 'http://localhost:5173'

test('unconfigured database returns 503; unrelated browser origins are rejected', async (t) => {
  const app = express()
  app.use('/api/users', createUserRouter(null, { clientUrl }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}/api/users/me`
  assert.equal((await fetch(url)).status, 503)
  assert.equal((await fetch(url, { headers: { Origin: 'https://unrelated.example' } })).status, 403)
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: clientUrl } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
})

test('PostgreSQL: join, duplicates, recovery, persistence and session protection', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30000,
}, async (t) => {
  // A unique schema isolates this run from application tables; only this schema is removed.
  const schema = `test_users_${randomUUID().replaceAll('-', '')}`
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
  const makePool = () => new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  database = makePool()
  await database.query(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'))
  async function start() {
    const app = express()
    app.use(express.json())
    app.use('/api/users', createUserRouter(database, { clientUrl }))
    app.use((_error, _req, res, _next) => res.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
    server = app.listen(0, '127.0.0.1')
    await once(server, 'listening')
    return `http://127.0.0.1:${server.address().port}/api/users`
  }
  let base = await start()
  const post = (path, body, cookie) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: clientUrl, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  })
  const me = (cookie) => fetch(`${base}/me`, { headers: cookie ? { Cookie: cookie } : {} })
  const entry = { nickname: '테스트 참가자', pin: '0012', role: 'ADMIN' }
  for (const body of [{ nickname: ' ', pin: '1234' }, { nickname: 'A', pin: 1234 }, { nickname: 'A', pin: '12ab' }, { nickname: 'A', pin: '12345' }]) {
    assert.equal((await post('/join', body)).status, 400)
  }
  const joined = await post('/join', entry)
  assert.equal(joined.status, 201)
  const user = (await joined.json()).user
  assert.equal(user.role, 'USER')
  assert.equal('pinHash' in user, false)
  const setCookie = joined.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Strict/i)
  const cookie = setCookie.split(';')[0]
  assert.equal((await me(cookie)).status, 200)
  assert.equal((await me()).status, 401)
  assert.equal((await me(`investking_session=${user.userId}`)).status, 401)
  assert.equal((await post('/join', { ...entry, nickname: `  ${entry.nickname}  ` })).status, 409)
  const duplicate = await Promise.all([post('/join', { nickname: '동시', pin: '1234' }), post('/join', { nickname: '동시', pin: '1234' })])
  assert.deepEqual(duplicate.map((r) => r.status).sort(), [201, 409])
  assert.equal((await post('/recover', { ...entry, pin: '9999' })).status, 401)
  assert.equal((await post('/recover', { nickname: '없는 사용자', pin: '9999' })).status, 401)
  const saved = (await database.query('SELECT pin_hash FROM users WHERE id = $1', [user.userId])).rows[0]
  assert.match(saved.pin_hash, /^scrypt\$/)
  assert.notEqual(saved.pin_hash, entry.pin)
  const storedSession = (await database.query('SELECT token_hash FROM user_sessions WHERE user_id = $1', [user.userId])).rows[0]
  assert.notEqual(storedSession.token_hash, cookie.split('=')[1])

  // Recreate the HTTP application and DB pool to prove state lives in PostgreSQL.
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections() })
  await database.end()
  database = makePool()
  base = await start()
  assert.equal((await (await me(cookie)).json()).user.userId, user.userId)
  const recovered = await post('/recover', entry, cookie)
  assert.equal(recovered.status, 200)
  assert.equal((await recovered.json()).user.userId, user.userId)
  const newCookie = recovered.headers.get('set-cookie').split(';')[0]
  assert.notEqual(cookie, newCookie)
  assert.equal((await me(cookie)).status, 401)
  assert.equal((await post('/logout', {}, newCookie)).status, 204)
  assert.equal((await me(newCookie)).status, 401)
  const again = await post('/recover', entry)
  const expiryCookie = again.headers.get('set-cookie').split(';')[0]
  await database.query("UPDATE user_sessions SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1", [user.userId])
  assert.equal((await me(expiryCookie)).status, 401)
})
