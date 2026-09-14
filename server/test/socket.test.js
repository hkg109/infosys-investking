import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { io } from 'socket.io-client'

test('health check, concurrent delivery, disconnect and reconnect', { timeout: 15000 }, async (t) => {
  const server = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], {
    env: { ...process.env, PORT: '0', CLIENT_URL: 'http://localhost:5173' },
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

  const handshake = await fetch(`${url}/socket.io/?EIO=4&transport=polling`, {
    headers: { Origin: 'http://localhost:5173' },
  })
  assert.equal(handshake.headers.get('access-control-allow-origin'), 'http://localhost:5173')

  // One administrator stand-in and three user stand-ins. No frontend changes.
  for (let index = 0; index < 4; index += 1) {
    const client = io(url, { autoConnect: false, reconnection: false, timeout: 3000 })
    clients.push(client)
    const connected = Promise.race([
      once(client, 'connect'),
      once(client, 'connect_error').then(([error]) => { throw error }),
    ])
    client.connect()
    await connected
  }
  const received = clients.map((client) => once(client, 'game:start'))
  clients[0].emit('game:start', { ignoredClientPayload: true })
  assert.deepEqual(await Promise.all(received), [[], [], [], []])

  const reconnecting = clients[3]
  const oldId = reconnecting.id
  reconnecting.disconnect()
  const connectedAgain = once(reconnecting, 'connect')
  reconnecting.connect()
  await connectedAgain
  assert.notEqual(reconnecting.id, oldId)
  const receivedAgain = clients.map((client) => once(client, 'game:start'))
  clients[0].emit('game:start')
  await Promise.all(receivedAgain)
  assert.match(logs, /Socket connected:/)
  assert.match(logs, /Socket disconnected:/)
  assert.equal(errors, '')
})
