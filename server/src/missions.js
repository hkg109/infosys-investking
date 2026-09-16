import { randomUUID } from 'node:crypto'
import { ACTIVE_GAME_ID } from './game-store.js'
import { getTradeHistory } from './market-history.js'

export const MISSION_TYPES = Object.freeze({
  DIVERSIFIED_HOLDINGS: 'DIVERSIFIED_HOLDINGS',
  CASH_RATIO: 'CASH_RATIO',
  CONSECUTIVE_HOLDING: 'CONSECUTIVE_HOLDING',
  CONTRARIAN_PROFIT: 'CONTRARIAN_PROFIT',
  TRADE_BOTH_SIDES: 'TRADE_BOTH_SIDES',
})

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tradeMissionTypes = new Set([
  MISSION_TYPES.DIVERSIFIED_HOLDINGS,
  MISSION_TYPES.CONTRARIAN_PROFIT,
  MISSION_TYPES.TRADE_BOTH_SIDES,
])

export class MissionError extends Error {
  constructor(status, code, details = {}) {
    super(code)
    this.name = 'MissionError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const number = (value) => value === null || value === undefined ? null : Number(value)
const date = (value) => value ? new Date(value).toISOString() : null

function validateMissionId(value) {
  if (!uuidPattern.test(value || '')) throw new MissionError(400, 'INVALID_MISSION_ID')
  return value.toLowerCase()
}

function validateMissionInput(body) {
  const title = typeof body?.title === 'string' ? body.title.trim().normalize('NFC') : ''
  const description = typeof body?.description === 'string' ? body.description.trim().normalize('NFC') : ''
  const missionType = typeof body?.missionType === 'string' ? body.missionType.trim().toUpperCase() : ''
  const targetValue = body?.targetValue
  const rewardPoints = body?.rewardPoints
  const isActive = body?.isActive ?? true
  if (!title || [...title].length > 100 || /[\p{Cc}\p{Cf}]/u.test(title) || !description || description.length > 2_000 ||
      /[\p{Cc}\p{Cf}]/u.test(description) || !Object.values(MISSION_TYPES).includes(missionType) ||
      !Number.isSafeInteger(targetValue) || targetValue < 1 || targetValue > 1_000 ||
      !Number.isSafeInteger(rewardPoints) || rewardPoints < 1 || rewardPoints > 1_000_000 || typeof isActive !== 'boolean') {
    throw new MissionError(400, 'INVALID_MISSION')
  }
  if (missionType === MISSION_TYPES.CASH_RATIO && targetValue > 100) throw new MissionError(400, 'INVALID_MISSION_TARGET')
  if (missionType === MISSION_TYPES.TRADE_BOTH_SIDES && targetValue !== 2) throw new MissionError(400, 'INVALID_MISSION_TARGET')
  return { title, description, missionType, targetValue, rewardPoints, isActive }
}

function missionJson(row) {
  const mission = {
    missionId: row.id || row.mission_id,
    title: row.title,
    description: row.description,
    missionType: row.mission_type,
    targetValue: number(row.target_value),
    rewardPoints: number(row.reward_points),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (row.assignment_count !== undefined) mission.assignmentCount = number(row.assignment_count) || 0
  return mission
}

function assignmentJson(row) {
  if (!row) return null
  return {
    ...missionJson(row),
    progress: number(row.progress),
    status: row.status,
    assignedAt: date(row.assigned_at),
    completedAt: date(row.completed_at),
    rewardedAt: date(row.rewarded_at),
  }
}

async function withTransaction(database, work) {
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

const missionSelect = `SELECT m.*,
  (SELECT COUNT(*) FROM game_missions gm WHERE gm.mission_id = m.id) AS assignment_count
  FROM missions m`

export async function listMissions(database) {
  const [missions, assignments] = await Promise.all([
    database.query(`${missionSelect} ORDER BY m.created_at, m.id`),
    database.query(`SELECT gm.*, u.nickname, m.title, m.mission_type, m.target_value, m.reward_points
      FROM game_missions gm JOIN users u ON u.id = gm.user_id JOIN missions m ON m.id = gm.mission_id
      WHERE gm.game_id = $1 ORDER BY u.nickname, u.id`, [ACTIVE_GAME_ID]),
  ])
  return {
    missions: missions.rows.map(missionJson),
    assignments: assignments.rows.map((row) => ({
      userId: row.user_id,
      nickname: row.nickname,
      missionId: row.mission_id,
      title: row.title,
      missionType: row.mission_type,
      targetValue: number(row.target_value),
      rewardPoints: number(row.reward_points),
      progress: number(row.progress),
      status: row.status,
      assignedAt: date(row.assigned_at),
      completedAt: date(row.completed_at),
      rewardedAt: date(row.rewarded_at),
    })),
  }
}

export async function createMission(database, input) {
  const mission = validateMissionInput(input)
  const id = randomUUID()
  await database.query(`INSERT INTO missions
    (id, title, description, mission_type, target_value, reward_points, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
    id, mission.title, mission.description, mission.missionType,
    mission.targetValue, mission.rewardPoints, mission.isActive,
  ])
  return missionJson((await database.query(`${missionSelect} WHERE m.id = $1`, [id])).rows[0])
}

export async function updateMission(database, missionId, input) {
  const id = validateMissionId(missionId)
  const mission = validateMissionInput(input)
  const updated = await database.query(`UPDATE missions SET title = $2, description = $3,
    mission_type = $4, target_value = $5, reward_points = $6, is_active = $7, updated_at = NOW()
    WHERE id = $1 RETURNING id`, [id, mission.title, mission.description, mission.missionType,
    mission.targetValue, mission.rewardPoints, mission.isActive])
  if (!updated.rowCount) throw new MissionError(404, 'MISSION_NOT_FOUND')
  return missionJson((await database.query(`${missionSelect} WHERE m.id = $1`, [id])).rows[0])
}

export async function deactivateMission(database, missionId) {
  const result = await database.query('UPDATE missions SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id', [validateMissionId(missionId)])
  if (!result.rowCount) throw new MissionError(404, 'MISSION_NOT_FOUND')
}

async function readUserState(database, userId, gameId = ACTIVE_GAME_ID) {
  const [assignment, wallet] = await Promise.all([
    database.query(`SELECT gm.*, m.* FROM game_missions gm JOIN missions m ON m.id = gm.mission_id
      WHERE gm.game_id = $1 AND gm.user_id = $2`, [gameId, userId]),
    database.query('SELECT points FROM user_reward_wallets WHERE game_id = $1 AND user_id = $2', [gameId, userId]),
  ])
  return { points: number(wallet.rows[0]?.points) || 0, mission: assignmentJson(assignment.rows[0]) }
}

export const getMyMission = (database, userId, gameId = ACTIVE_GAME_ID) => readUserState(database, userId, gameId)

async function insertAssignment(client, userId, missionId, gameId = ACTIVE_GAME_ID) {
  const inserted = await client.query(`INSERT INTO game_missions (game_id, user_id, mission_id)
    VALUES ($1,$2,$3) ON CONFLICT (game_id, user_id) DO NOTHING RETURNING user_id`, [gameId, userId, missionId])
  await client.query(`INSERT INTO user_reward_wallets (game_id, user_id, points)
    VALUES ($1,$2,0) ON CONFLICT (game_id, user_id) DO NOTHING`, [gameId, userId])
  return inserted.rowCount > 0
}

export async function assignMissions(database, gameId = ACTIVE_GAME_ID) {
  return withTransaction(database, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`mission-assignment:${gameId}`])
    const missions = (await client.query('SELECT id FROM missions WHERE is_active = TRUE ORDER BY created_at, id')).rows
    if (!missions.length) return []
    const users = (await client.query(`SELECT u.id FROM users u
      WHERE u.role = 'USER' AND NOT EXISTS (
        SELECT 1 FROM game_missions gm WHERE gm.game_id = $1 AND gm.user_id = u.id
      ) ORDER BY u.created_at, u.id`, [gameId])).rows
    const assignedCount = number((await client.query('SELECT COUNT(*) AS count FROM game_missions WHERE game_id = $1', [gameId])).rows[0].count)
    const assigned = []
    for (let index = 0; index < users.length; index += 1) {
      const missionId = missions[(assignedCount + index) % missions.length].id
      if (await insertAssignment(client, users[index].id, missionId, gameId)) assigned.push(users[index].id)
    }
    return assigned
  })
}

export async function assignMissionToUser(database, userId, gameId = ACTIVE_GAME_ID) {
  return withTransaction(database, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`mission-assignment:${gameId}`])
    const existing = await client.query('SELECT user_id FROM game_missions WHERE game_id = $1 AND user_id = $2', [gameId, userId])
    if (existing.rowCount) return false
    const count = number((await client.query('SELECT COUNT(*) AS count FROM game_missions WHERE game_id = $1', [gameId])).rows[0].count)
    const missions = (await client.query('SELECT id FROM missions WHERE is_active = TRUE ORDER BY created_at, id')).rows
    if (!missions.length) return false
    return insertAssignment(client, userId, missions[count % missions.length].id, gameId)
  })
}

async function calculateProgress(client, row, round, initialCash) {
  if (row.mission_type === MISSION_TYPES.DIVERSIFIED_HOLDINGS) {
    return { progress: number((await client.query(`SELECT COUNT(*) AS count FROM portfolios
      WHERE game_id = $1 AND user_id = $2 AND quantity > 0`, [row.game_id, row.user_id])).rows[0].count), state: row.progress_state }
  }
  if (row.mission_type === MISSION_TYPES.TRADE_BOTH_SIDES) {
    return { progress: number((await client.query(`SELECT COUNT(DISTINCT type) AS count FROM transactions
      WHERE game_id = $1 AND user_id = $2`, [row.game_id, row.user_id])).rows[0].count), state: row.progress_state }
  }
  if (row.mission_type === MISSION_TYPES.CASH_RATIO) {
    const assets = (await client.query(`SELECT COALESCE(w.cash, $3)::numeric AS cash,
        COALESCE(SUM(p.quantity::numeric * c.current_price::numeric), 0) AS stock_value
      FROM users u LEFT JOIN wallets w ON w.game_id = $1 AND w.user_id = u.id
      LEFT JOIN portfolios p ON p.game_id = $1 AND p.user_id = u.id AND p.quantity > 0
      LEFT JOIN companies c ON c.id = p.company_id WHERE u.id = $2 GROUP BY w.cash`,
    [row.game_id, row.user_id, initialCash])).rows[0]
    const cash = number(assets?.cash) || initialCash
    const total = cash + (number(assets?.stock_value) || 0)
    return { progress: total === 0 ? 0 : Math.round(cash / total * 10_000) / 100, state: row.progress_state }
  }
  if (row.mission_type === MISSION_TYPES.CONSECUTIVE_HOLDING) {
    const previousState = row.progress_state || {}
    if (previousState.lastRound === round) return { progress: number(row.progress), state: previousState }
    const holdings = (await client.query(`SELECT company_id FROM portfolios
      WHERE game_id = $1 AND user_id = $2 AND quantity > 0 ORDER BY company_id`, [row.game_id, row.user_id])).rows
    const consecutive = previousState.lastRound === round - 1
    const streaks = Object.fromEntries(holdings.map(({ company_id: companyId }) => [
      companyId, consecutive ? number(previousState.streaks?.[companyId] || 0) + 1 : 1,
    ]))
    return { progress: Math.max(0, ...Object.values(streaks)), state: { lastRound: round, streaks } }
  }
  if (row.mission_type === MISSION_TYPES.CONTRARIAN_PROFIT) {
    if (round < 2) return { progress: 0, state: row.progress_state }
    const declined = new Set((await client.query(`SELECT company_id FROM stock_price_history
      WHERE game_id = $1 AND round_number = $2 AND snapshot_type = 'CLOSE' AND change_rate < 0`,
    [row.game_id, round - 1])).rows.map(({ company_id: companyId }) => companyId))
    const history = await getTradeHistory(client, row.user_id, { round, gameId: row.game_id })
    return {
      progress: history.trades.filter((trade) => trade.type === 'SELL' && trade.realizedProfit > 0 && declined.has(trade.companyId)).length,
      state: row.progress_state,
    }
  }
  return { progress: number(row.progress), state: row.progress_state }
}

async function refreshUserMission(database, userId, { round, trigger, initialCash, gameId = ACTIVE_GAME_ID }) {
  return withTransaction(database, async (client) => {
    const selected = await client.query(`SELECT gm.*, m.title, m.description, m.mission_type,
        m.target_value, m.reward_points, m.is_active, m.created_at, m.updated_at
      FROM game_missions gm JOIN missions m ON m.id = gm.mission_id
      WHERE gm.game_id = $1 AND gm.user_id = $2 FOR UPDATE OF gm`, [gameId, userId])
    const row = selected.rows[0]
    if (!row || row.status === 'COMPLETED') return null
    if (trigger === 'TRADE' && !tradeMissionTypes.has(row.mission_type)) return null
    const calculated = await calculateProgress(client, row, round, initialCash)
    const progress = Math.min(number(row.target_value), calculated.progress)
    const completed = progress >= number(row.target_value)
    const updated = (await client.query(`UPDATE game_missions SET progress = $3, progress_state = $4,
        status = CASE WHEN $5 THEN 'COMPLETED' ELSE 'ASSIGNED' END,
        completed_at = CASE WHEN $5 THEN NOW() ELSE NULL END,
        rewarded_at = CASE WHEN $5 THEN NOW() ELSE NULL END
      WHERE game_id = $1 AND user_id = $2 RETURNING *`,
    [gameId, userId, progress, JSON.stringify(calculated.state || {}), completed])).rows[0]
    let points = number((await client.query('SELECT points FROM user_reward_wallets WHERE game_id = $1 AND user_id = $2', [gameId, userId])).rows[0]?.points) || 0
    if (completed) {
      points = number((await client.query(`INSERT INTO user_reward_wallets (game_id, user_id, points)
        VALUES ($1,$2,$3) ON CONFLICT (game_id, user_id) DO UPDATE
        SET points = user_reward_wallets.points + EXCLUDED.points, updated_at = NOW()
        RETURNING points`, [gameId, userId, row.reward_points])).rows[0].points)
    }
    return { userId, points, mission: assignmentJson({ ...row, ...updated }), completed }
  })
}

export function createMissionCoordinator(database, io, { initialCash = 1_000_000 } = {}) {
  const emitUpdate = (result, assigned = false) => {
    if (!result) return
    const event = assigned ? 'mission:assigned' : result.completed ? 'mission:completed' : 'mission:progress'
    io.to(`user:${result.userId}`).emit(event, { points: result.points, mission: result.mission })
  }
  return {
    async prepareGameStart() {
      if (!database) return []
      const userIds = await assignMissions(database)
      for (const userId of userIds) emitUpdate({ userId, ...(await readUserState(database, userId)) }, true)
      return userIds
    },
    async assignUserIfRunning(userId, game) {
      if (!database || !['RUNNING', 'PAUSED'].includes(game.status)) return false
      const assigned = await assignMissionToUser(database, userId)
      if (assigned) emitUpdate({ userId, ...(await readUserState(database, userId)) }, true)
      return assigned
    },
    async handleTrade({ userId, round }) {
      if (!database) return null
      const result = await refreshUserMission(database, userId, { round, trigger: 'TRADE', initialCash })
      emitUpdate(result)
      return result
    },
    async handleGameEvent({ name, payload }) {
      if (!database || name !== 'trading:close') return []
      const users = (await database.query(`SELECT user_id FROM game_missions
        WHERE game_id = $1 AND status = 'ASSIGNED' ORDER BY user_id`, [ACTIVE_GAME_ID])).rows
      const results = []
      for (const { user_id: userId } of users) {
        const result = await refreshUserMission(database, userId, {
          round: payload.currentRound, trigger: 'ROUND_CLOSE', initialCash,
        })
        if (result) { results.push(result); emitUpdate(result) }
      }
      return results
    },
    async reconcile(game) {
      if (!database || !['RUNNING', 'PAUSED'].includes(game.status)) return []
      await assignMissions(database)
      const users = (await database.query(`SELECT user_id FROM game_missions
        WHERE game_id = $1 AND status = 'ASSIGNED' ORDER BY user_id`, [ACTIVE_GAME_ID])).rows
      const results = []
      for (const { user_id: userId } of users) {
        const result = await refreshUserMission(database, userId, {
          round: game.currentRound, trigger: 'RECONCILE', initialCash,
        })
        if (result) results.push(result)
      }
      return results
    },
  }
}
