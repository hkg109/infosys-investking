import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { afterEach, test } from 'node:test'
import express from 'express'
import { createAdminAuthRouter } from '../src/admin-auth.js'

const servers = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))))
})

async function startAuthServer(adminPassword) {
  const app = express()
  app.use('/api/admin/auth', createAdminAuthRouter({
    adminPassword,
    clientUrl: 'http://localhost:5173',
  }))
  const server = createServer(app)
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}/api/admin/auth`
}

test('verifies the configured administrator password', async () => {
  const baseUrl = await startAuthServer('correct-password')
  const response = await fetch(`${baseUrl}/verify`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer correct-password',
      Origin: 'http://localhost:5173',
    },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { authenticated: true })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('rejects missing, malformed, and incorrect credentials without echoing them', async () => {
  const baseUrl = await startAuthServer('correct-password')
  for (const authorization of [undefined, 'correct-password', 'Basic correct-password', 'Bearer wrong-password']) {
    const headers = authorization ? { Authorization: authorization } : {}
    const response = await fetch(`${baseUrl}/verify`, { method: 'POST', headers })
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'ADMIN_AUTH_REQUIRED' })
  }
})

test('reports unavailable authentication when the password is not configured', async () => {
  const baseUrl = await startAuthServer('')
  const response = await fetch(`${baseUrl}/verify`, {
    method: 'POST',
    headers: { Authorization: 'Bearer any-password' },
  })

  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'ADMIN_AUTH_UNAVAILABLE' })
})

test('supports authorization preflight and rejects untrusted browser origins', async () => {
  const baseUrl = await startAuthServer('correct-password')
  const preflight = await fetch(`${baseUrl}/verify`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173' },
  })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/)

  const rejected = await fetch(`${baseUrl}/verify`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer correct-password',
      Origin: 'https://example.com',
    },
  })
  assert.equal(rejected.status, 403)
  assert.deepEqual(await rejected.json(), { error: 'ORIGIN_NOT_ALLOWED' })
})
