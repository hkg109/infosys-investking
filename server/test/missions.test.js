import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { ACTIVE_GAME_ID, loadGameState } from '../src/game-store.js'
import { createMissionRouter } from '../src/mission-routes.js'
import { createMission, createMissionCoordinator, getMyMission, MISSION_TYPES } from '../src/missions.js'
import { digestSessionToken, SESSION_COOKIE_NAME } from '../src/session-auth.js'

const clientUrl = 'http://localhost:5173'

async function createDatabase(t, prefix) {
  const schema = `${prefix}_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  await admin.query(`CREATE SCHEMA "${schema}"`)
  const database = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  t.after(async () => {
    await database.end()
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.end()
  })
  const sql = await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8')
  await database.query(sql)
  await database.query(sql)
  await loadGameState(database, { totalRounds: 4, roundDurationMs: 70_000, tradingDurationMs: 60_000 })
  return database
}

async function createUser(database, nickname) {
  const userId = randomUUID()
  const token = randomBytes(32).toString('hex')
  await database.query("INSERT INTO users (id, nickname, pin_hash) VALUES ($1,$2,'test-only')", [userId, nickname])
  await database.query(`INSERT INTO user_sessions (token_hash, user_id, expires_at)
    VALUES ($1,$2,NOW() + INTERVAL '1 hour')`, [digestSessionToken(token), userId])
  return { userId, cookie: `${SESSION_COOKIE_NAME}=${token}` }
}

test('PostgreSQL missions: admin management, private assignment and exactly-once trade reward', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30_000,
}, async (t) => {
  const database = await createDatabase(t, 'test_mission_api')
  const user = await createUser(database, '비밀 참가자')
  const other = await createUser(database, '다른 참가자')
  let gameStatus = 'WAITING'
  const app = express()
  app.use(express.json())
  app.use('/api/missions', createMissionRouter(database, { getSnapshot: () => ({ status: gameStatus }) }, {
    adminPassword: 'mission-admin', clientUrl,
  }))
  app.use((_error, _request, response, _next) => response.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}/api/missions`
  const adminHeaders = { Authorization: 'Bearer mission-admin', 'Content-Type': 'application/json' }
  const missionInput = {
    title: '분산 투자자', description: '서로 다른 종목 두 개를 동시에 보유하세요.',
    missionType: MISSION_TYPES.DIVERSIFIED_HOLDINGS, targetValue: 2, rewardPoints: 30, isActive: true,
  }
  assert.equal((await fetch(`${base}/admin`)).status, 401)
  const created = await fetch(`${base}/admin`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(missionInput) })
  assert.equal(created.status, 201)
  const createdBody = await created.json()
  assert.equal(createdBody.mission.rewardPoints, 30)
  const updated = await fetch(`${base}/admin/${createdBody.mission.missionId}`, {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify({ ...missionInput, description: '두 종목을 보유하세요.' }),
  })
  assert.equal(updated.status, 200)
  assert.equal((await updated.json()).mission.description, '두 종목을 보유하세요.')
  const disposable = await fetch(`${base}/admin`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ ...missionInput, title: '비활성화 테스트' }),
  })
  const disposableId = (await disposable.json()).mission.missionId
  assert.equal((await fetch(`${base}/admin/${disposableId}`, { method: 'DELETE', headers: adminHeaders })).status, 204)
  const invalid = await fetch(`${base}/admin`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({
    ...missionInput, missionType: MISSION_TYPES.TRADE_BOTH_SIDES, targetValue: 1,
  }) })
  assert.equal(invalid.status, 400)

  const emitted = []
  const io = { to: (room) => ({ emit: (name, payload) => emitted.push({ room, name, payload }) }) }
  const coordinator = createMissionCoordinator(database, io)
  const assigned = await coordinator.prepareGameStart()
  assert.equal(assigned.length, 2)
  assert.equal(emitted.filter(({ name }) => name === 'mission:assigned').length, 2)
  assert.equal((await fetch(`${base}/me`)).status, 401)
  const mine = await fetch(`${base}/me`, { headers: { Cookie: user.cookie, Origin: clientUrl } })
  const mineBody = await mine.json()
  assert.equal(mineBody.points, 0)
  assert.equal(mineBody.mission.title, '분산 투자자')
  assert.equal(JSON.stringify(mineBody).includes(other.userId), false)

  await database.query(`INSERT INTO portfolios (game_id, user_id, company_id, quantity)
    VALUES ($1,$2,'A',1),($1,$2,'B',1)`, [ACTIVE_GAME_ID, user.userId])
  const results = await Promise.all([
    coordinator.handleTrade({ userId: user.userId, round: 1 }),
    coordinator.handleTrade({ userId: user.userId, round: 1 }),
  ])
  assert.equal(results.filter(Boolean).length, 1)
  assert.equal((await getMyMission(database, user.userId)).points, 30)
  assert.equal((await getMyMission(database, user.userId)).mission.status, 'COMPLETED')
  assert.equal(numberOfCompleted(emitted, user.userId), 1)

  const adminList = await fetch(`${base}/admin`, { headers: { Authorization: 'Bearer mission-admin' } })
  const adminBody = await adminList.json()
  assert.equal(adminBody.assignments.length, 2)
  assert.equal(adminBody.assignments.find(({ userId }) => userId === user.userId).status, 'COMPLETED')
  gameStatus = 'RUNNING'
  assert.equal((await fetch(`${base}/admin`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(missionInput) })).status, 409)
})

test('PostgreSQL mission engine evaluates round conditions and never rewards twice', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run real PostgreSQL integration tests',
  timeout: 30_000,
}, async (t) => {
  const database = await createDatabase(t, 'test_mission_engine')
  const users = {
    cash: await createUser(database, '현금왕'),
    holding: await createUser(database, '장기보유'),
    trade: await createUser(database, '매매경험'),
    contrarian: await createUser(database, '역발상'),
  }
  const definitions = [
    [users.cash, MISSION_TYPES.CASH_RATIO, 40, 20],
    [users.holding, MISSION_TYPES.CONSECUTIVE_HOLDING, 2, 40],
    [users.trade, MISSION_TYPES.TRADE_BOTH_SIDES, 2, 25],
    [users.contrarian, MISSION_TYPES.CONTRARIAN_PROFIT, 1, 50],
  ]
  for (const [user, type, target, reward] of definitions) {
    const mission = await createMission(database, {
      title: type, description: `${type} 조건`, missionType: type,
      targetValue: target, rewardPoints: reward, isActive: true,
    })
    await database.query('INSERT INTO game_missions (game_id, user_id, mission_id) VALUES ($1,$2,$3)',
      [ACTIVE_GAME_ID, user.userId, mission.missionId])
  }
  await database.query(`INSERT INTO portfolios (game_id, user_id, company_id, quantity)
    VALUES ($1,$2,'A',1)`, [ACTIVE_GAME_ID, users.holding.userId])
  const addTrade = (userId, round, type, quantity, price, offset) => database.query(`INSERT INTO transactions
    (id, order_id, game_id, user_id, round_number, company_id, type, quantity, price, total_price, created_at)
    VALUES ($1,$2,$3,$4,$5,'A',$6,$7,$8,$9,NOW() + $10 * INTERVAL '1 second')`, [
    randomUUID(), randomUUID(), ACTIVE_GAME_ID, userId, round, type, quantity, price, quantity * price, offset,
  ])
  await addTrade(users.trade.userId, 1, 'BUY', 1, 100, 1)
  await addTrade(users.trade.userId, 1, 'SELL', 1, 110, 2)
  await addTrade(users.contrarian.userId, 1, 'BUY', 1, 100, 3)
  await addTrade(users.contrarian.userId, 2, 'SELL', 1, 200, 4)
  await database.query(`INSERT INTO stock_price_history
    (game_id, round_number, company_id, snapshot_type, price, opening_price, closing_price, change_rate)
    VALUES ($1,1,'A','CLOSE',9000,10000,9000,-10)`, [ACTIVE_GAME_ID])

  const emitted = []
  const coordinator = createMissionCoordinator(database, {
    to: (room) => ({ emit: (name, payload) => emitted.push({ room, name, payload }) }),
  })
  await coordinator.handleTrade({ userId: users.trade.userId, round: 1 })
  await coordinator.handleTrade({ userId: users.contrarian.userId, round: 2 })
  await coordinator.handleGameEvent({ name: 'trading:close', payload: { currentRound: 1 } })
  assert.equal((await getMyMission(database, users.cash.userId)).points, 20)
  assert.equal((await getMyMission(database, users.holding.userId)).mission.progress, 1)
  await coordinator.handleGameEvent({ name: 'trading:close', payload: { currentRound: 2 } })
  await coordinator.handleGameEvent({ name: 'trading:close', payload: { currentRound: 2 } })

  assert.equal((await getMyMission(database, users.holding.userId)).points, 40)
  assert.equal((await getMyMission(database, users.trade.userId)).points, 25)
  assert.equal((await getMyMission(database, users.contrarian.userId)).points, 50)
  assert.equal(numberOfCompleted(emitted, users.holding.userId), 1)
  const wallets = await database.query('SELECT SUM(points)::int AS points FROM user_reward_wallets')
  assert.equal(wallets.rows[0].points, 135)
})

function numberOfCompleted(events, userId) {
  return events.filter(({ room, name }) => room === `user:${userId}` && name === 'mission:completed').length
}
