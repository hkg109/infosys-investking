import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import { Server } from 'socket.io'
import { io as createClient } from 'socket.io-client'
import '../src/config.js'
import { createAdminRouter } from '../src/admin-routes.js'
import { GameEngine } from '../src/game-engine.js'
import { createGameResetCoordinator } from '../src/game-reset.js'
import { createGameRouter } from '../src/game-routes.js'
import { ACTIVE_GAME_ID, saveGameState } from '../src/game-store.js'
import { digestSessionToken, SESSION_COOKIE_NAME } from '../src/session-auth.js'
import { createPresenceTracker, createSocketSessionMiddleware } from '../src/socket-presence.js'

const clientUrl = 'http://localhost:5173'
const adminPassword = 'stage2-admin'

async function waitFor(check, message) {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.fail(message)
}

test('PostgreSQL stage 2: participant assets, multi-tab presence, reconnect, and finished-game reset', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30000,
}, async (t) => {
  const schema = `test_stage2_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  let database
  let server
  let io
  let schemaCreated = false
  const sockets = []
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect())
    io?.close()
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections() })
    await database?.end()
    if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.end()
  })

  await admin.query(`CREATE SCHEMA "${schema}"`)
  schemaCreated = true
  database = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  await database.query(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'))

  const engine = new GameEngine({
    totalRounds: 1,
    roundDurationMs: 1_000,
    tradingDurationMs: 900,
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
  })
  engine.start()
  engine.end()
  await saveGameState(database, engine.getSnapshot())

  const aliceId = randomUUID()
  const bobId = randomUUID()
  const aliceToken = 'a'.repeat(64)
  const bobToken = 'b'.repeat(64)
  await database.query(`INSERT INTO users (id, nickname, pin_hash, role) VALUES
    ($1, '앨리스', 'hash', 'USER'), ($2, '밥', 'hash', 'USER')`, [aliceId, bobId])
  await database.query(`INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES
    ($1, $2, NOW() + INTERVAL '1 hour'), ($3, $4, NOW() + INTERVAL '1 hour')`,
  [digestSessionToken(aliceToken), aliceId, digestSessionToken(bobToken), bobId])
  await database.query('INSERT INTO wallets (game_id, user_id, cash) VALUES ($1, $2, 700000)', [ACTIVE_GAME_ID, aliceId])
  await database.query(`INSERT INTO portfolios (game_id, user_id, company_id, quantity)
    VALUES ($1, $2, 'A', 5)`, [ACTIVE_GAME_ID, aliceId])

  const app = express()
  app.use(express.json())
  const httpServer = createServer(app)
  server = httpServer
  io = new Server(httpServer)
  io.use(createSocketSessionMiddleware(database))
  const presence = createPresenceTracker(io)
  io.on('connection', (socket) => presence.connect(socket))

  let unlockReset
  let resetLockReached
  const lockReached = new Promise((resolve) => { resetLockReached = resolve })
  const resetDatabase = {
    async connect() {
      const client = await database.connect()
      return {
        async query(sql, values) {
          if (typeof sql === 'string' && sql.startsWith('LOCK TABLE users')) {
            resetLockReached()
            await new Promise((resolve) => { unlockReset = resolve })
          }
          return client.query(sql, values)
        },
        release: () => client.release(),
      }
    },
  }
  const resetCoordinator = createGameResetCoordinator(resetDatabase, engine, {
    onReset: () => presence.disconnectAll(),
  })
  app.use(resetCoordinator.blockMutations)
  app.use('/api/admin', createAdminRouter(database, { adminPassword, clientUrl, presence, initialCash: 1_000_000 }))
  app.use('/api/game', createGameRouter(engine, {
    adminPassword,
    clientUrl,
    resetGame: () => resetCoordinator.reset(),
  }))
  app.post('/api/users/join', (_request, response) => response.sendStatus(201))
  app.use((_error, _request, response, _next) => response.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`
  const adminHeaders = { Authorization: `Bearer ${adminPassword}` }

  async function connect(token) {
    const socket = createClient(baseUrl, {
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      extraHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
    })
    sockets.push(socket)
    const ready = once(socket, 'session:ready')
    socket.connect()
    await once(socket, 'connect')
    return { socket, user: (await ready)[0].user }
  }

  const aliceOne = await connect(aliceToken)
  const aliceTwo = await connect(aliceToken)
  const bob = await connect(bobToken)
  assert.equal(aliceOne.user.userId, aliceId)
  assert.equal(aliceTwo.user.userId, aliceId)
  assert.equal(bob.user.userId, bobId)

  async function participants() {
    const response = await fetch(`${baseUrl}/api/admin/participants`, { headers: adminHeaders })
    assert.equal(response.status, 200)
    return response.json()
  }
  let payload = await participants()
  assert.equal(payload.onlineParticipants, 2)
  const alice = payload.participants.find(({ userId }) => userId === aliceId)
  const bobAccount = payload.participants.find(({ userId }) => userId === bobId)
  assert.deepEqual({ online: alice.online, cash: alice.cash, stockValue: alice.stockValue, totalAssets: alice.totalAssets },
    { online: true, cash: 700000, stockValue: 50000, totalAssets: 750000 })
  assert.deepEqual(alice.holdings.map(({ companyId, quantity }) => ({ companyId, quantity })), [{ companyId: 'A', quantity: 5 }])
  assert.deepEqual({ online: bobAccount.online, cash: bobAccount.cash, totalAssets: bobAccount.totalAssets },
    { online: true, cash: 1000000, totalAssets: 1000000 })

  aliceOne.socket.disconnect()
  await waitFor(async () => (await participants()).participants.find(({ userId }) => userId === aliceId).online,
    'one remaining tab should keep the participant online')
  aliceTwo.socket.disconnect()
  await waitFor(async () => !(await participants()).participants.find(({ userId }) => userId === aliceId).online,
    'last disconnected tab should mark the participant offline')
  const aliceReconnected = await connect(aliceToken)
  assert.equal(aliceReconnected.user.userId, aliceId)

  const eventId = randomUUID()
  const orderId = randomUUID()
  const missionId = randomUUID()
  await database.query("UPDATE companies SET current_price = 12000 WHERE id = 'A'")
  await database.query(`INSERT INTO events (id, title, news, result) VALUES ($1, '사건', '뉴스', '결과')`, [eventId])
  await database.query(`INSERT INTO game_events (game_id, event_id, round_number, applied_at)
    VALUES ($1, $2, 1, NOW())`, [ACTIVE_GAME_ID, eventId])
  await database.query(`INSERT INTO stock_price_changes
    (game_id, round_number, event_id, company_id, previous_price, new_price, change_rate)
    VALUES ($1, 1, $2, 'A', 10000, 12000, 20)`, [ACTIVE_GAME_ID, eventId])
  await database.query(`INSERT INTO order_intents (order_id, user_id, company_id, type, quantity, status)
    VALUES ($1, $2, 'A', 'BUY', 1, 'FILLED')`, [orderId, aliceId])
  await database.query(`INSERT INTO transactions
    (id, order_id, game_id, user_id, company_id, type, quantity, price, total_price)
    VALUES ($1, $2, $3, $4, 'A', 'BUY', 1, 10000, 10000)`, [randomUUID(), orderId, ACTIVE_GAME_ID, aliceId])
  await database.query(`INSERT INTO stock_price_history
    (game_id, round_number, company_id, snapshot_type, price, opening_price)
    VALUES ($1, 1, 'A', 'OPEN', 10000, 10000)`, [ACTIVE_GAME_ID])
  await database.query('INSERT INTO ranking_states (game_id, is_final) VALUES ($1, TRUE)', [ACTIVE_GAME_ID])
  await database.query(`INSERT INTO ranking_snapshots
    (game_id, user_id, rank, cash, stock_value, total_assets, is_final)
    VALUES ($1, $2, 1, 700000, 60000, 760000, TRUE)`, [ACTIVE_GAME_ID, aliceId])
  await database.query(`INSERT INTO missions
    (id, title, description, mission_type, target_value, reward_points)
    VALUES ($1, '테스트 미션', '초기화 검증', 'TRADE_BOTH_SIDES', 2, 20)`, [missionId])
  await database.query(`INSERT INTO game_missions (game_id, user_id, mission_id)
    VALUES ($1,$2,$3)`, [ACTIVE_GAME_ID, aliceId, missionId])
  await database.query(`INSERT INTO user_reward_wallets (game_id, user_id, points)
    VALUES ($1,$2,20)`, [ACTIVE_GAME_ID, aliceId])

  const resetRequest = fetch(`${baseUrl}/api/game/admin/reset`, { method: 'POST', headers: adminHeaders })
  await lockReached
  const blockedJoin = await fetch(`${baseUrl}/api/users/join`, { method: 'POST' })
  assert.equal(blockedJoin.status, 409)
  assert.deepEqual(await blockedJoin.json(), { error: 'GAME_RESET_IN_PROGRESS' })
  unlockReset()
  const resetResponse = await resetRequest
  assert.equal(resetResponse.status, 200)
  assert.equal((await resetResponse.json()).game.status, 'WAITING')
  await waitFor(() => !aliceReconnected.socket.connected && !bob.socket.connected,
    'game reset should disconnect authenticated participant sockets')

  for (const table of ['user_sessions', 'wallets', 'portfolios', 'transactions', 'order_intents',
    'game_events', 'stock_price_changes', 'stock_price_history', 'ranking_states', 'ranking_snapshots',
    'game_missions', 'user_reward_wallets']) {
    assert.equal(Number((await database.query(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count), 0, table)
  }
  assert.equal(Number((await database.query("SELECT COUNT(*) AS count FROM users WHERE role = 'USER'")).rows[0].count), 0)
  assert.equal(Number((await database.query('SELECT COUNT(*) AS count FROM events')).rows[0].count), 1)
  assert.equal(Number((await database.query('SELECT COUNT(*) AS count FROM missions')).rows[0].count), 1)
  assert.equal(Number((await database.query("SELECT current_price FROM companies WHERE id = 'A'")).rows[0].current_price), 10000)
  assert.equal((await database.query('SELECT status FROM games WHERE id = $1', [ACTIVE_GAME_ID])).rows[0].status, 'WAITING')
  payload = await participants()
  assert.deepEqual(payload, { participants: [], onlineParticipants: 0 })

  const duplicateReset = await fetch(`${baseUrl}/api/game/admin/reset`, { method: 'POST', headers: adminHeaders })
  assert.equal(duplicateReset.status, 409)
  assert.deepEqual(await duplicateReset.json(), { error: 'GAME_RESET_NOT_ALLOWED', status: 'WAITING' })
})
