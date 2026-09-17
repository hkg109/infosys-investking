import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { io } from 'socket.io-client'

test('health check, authenticated game controls, concurrent delivery and reconnect state', { timeout: 15000 }, async (t) => {
  const server = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], {
    env: {
      ...process.env,
      PORT: '0',
      CLIENT_URL: 'http://localhost:5173',
      ADMIN_PASSWORD: 'test-admin-password',
      DATABASE_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const clients = []
  let logs = ''
  let errors = ''
  server.stderr.on('data', (chunk) => { errors += chunk })
  t.after(async () => {
    clients.forEach((client) => client.disconnect())
    if (server.exitCode === null) {
      const exited = once(server, 'exit')
      server.kill()
      await exited
    }
  })

  const port = await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.once('exit', (code) => reject(new Error(`Server exited ${code}: ${errors}`)))
    server.stdout.on('data', (chunk) => {
      logs += chunk
      const match = logs.match(/running on port (\d+)/)
      if (match) resolve(Number(match[1]))
    })
  })
  const url = `http://127.0.0.1:${port}`
  const health = await fetch(`${url}/api/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok' })

  const adminAuth = await fetch(`${url}/api/admin/auth/verify`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-admin-password' },
  })
  assert.equal(adminAuth.status, 200)
  assert.deepEqual(await adminAuth.json(), { authenticated: true })

  const handshake = await fetch(`${url}/api/socket.io/?EIO=4&transport=polling`, {
    headers: { Origin: 'http://localhost:5173' },
  })
  assert.equal(handshake.headers.get('access-control-allow-origin'), 'http://localhost:5173')

  const initialStates = []
  for (let index = 0; index < 4; index += 1) {
    const client = io(url, { path: '/api/socket.io', autoConnect: false, reconnection: false, timeout: 3000 })
    clients.push(client)
    const initialState = once(client, 'game:state')
    const connected = Promise.race([
      once(client, 'connect'),
      once(client, 'connect_error').then(([error]) => { throw error }),
    ])
    client.connect()
    await connected
    initialStates.push((await initialState)[0])
  }
  assert.ok(initialStates.every((game) => game.status === 'WAITING'))

  clients[0].emit('game:start')
  await new Promise((resolve) => setTimeout(resolve, 30))
  const unchanged = await fetch(`${url}/api/game`)
  assert.equal((await unchanged.json()).game.status, 'WAITING')

  const rejectedOrigin = await fetch(`${url}/api/game`, { headers: { Origin: 'https://example.com' } })
  assert.equal(rejectedOrigin.status, 403)

  const preflight = await fetch(`${url}/api/game/admin/start`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173' },
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/)

  const unauthorized = await fetch(`${url}/api/game/admin/start`, { method: 'POST' })
  assert.equal(unauthorized.status, 401)
  assert.deepEqual(await unauthorized.json(), { error: 'ADMIN_AUTH_REQUIRED' })

  const received = clients.map((client) => once(client, 'game:start'))
  const startResponse = await fetch(`${url}/api/game/admin/start`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-admin-password' },
  })
  assert.equal(startResponse.status, 200)
  assert.equal((await startResponse.json()).game.status, 'RUNNING')
  const startEvents = await Promise.all(received)
  assert.ok(startEvents.every(([game]) => game.status === 'RUNNING' && game.currentRound === 1))

  const reconnecting = clients[3]
  const oldId = reconnecting.id
  reconnecting.disconnect()
  const connectedAgain = once(reconnecting, 'connect')
  const restoredState = once(reconnecting, 'game:state')
  reconnecting.connect()
  await connectedAgain
  assert.notEqual(reconnecting.id, oldId)
  assert.equal((await restoredState)[0].status, 'RUNNING')

  const pausedEvent = once(clients[0], 'game:pause')
  const pauseResponse = await fetch(`${url}/api/game/admin/pause`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-admin-password' },
  })
  assert.equal(pauseResponse.status, 200)
  assert.equal((await pausedEvent)[0].status, 'PAUSED')

  const conflict = await fetch(`${url}/api/game/admin/pause`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-admin-password' },
  })
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).error, 'INVALID_GAME_STATE')

  const resumedEvent = once(clients[0], 'game:resume')
  await fetch(`${url}/api/game/admin/resume`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-admin-password' },
  })
  assert.equal((await resumedEvent)[0].status, 'RUNNING')

  const endedEvent = once(clients[0], 'game:end')
  await fetch(`${url}/api/game/admin/end`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test-admin-password' },
  })
  assert.equal((await endedEvent)[0].status, 'FINISHED')
  assert.match(logs, /Socket connected:/)
  assert.match(logs, /Socket disconnected:/)
  assert.equal(errors, '')
})
