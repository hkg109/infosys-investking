import { Router } from 'express'
import { createRequireAdmin } from './admin-auth.js'
import { ACTIVE_GAME_ID } from './game-store.js'
import { getTradeHistory, MarketHistoryError, parseRound, validateUserId } from './market-history.js'

function number(value) {
  return value === null || value === undefined ? null : Number(value)
}

export async function listParticipants(database, presence, initialCash = 1_000_000) {
  const result = await database.query(`SELECT u.id AS user_id, u.nickname, u.created_at,
      COALESCE(w.cash, $2)::numeric AS cash,
      p.company_id, c.name AS company_name, p.quantity, c.current_price
    FROM users u
    LEFT JOIN wallets w ON w.game_id = $1 AND w.user_id = u.id
    LEFT JOIN portfolios p ON p.game_id = $1 AND p.user_id = u.id AND p.quantity > 0
    LEFT JOIN companies c ON c.id = p.company_id
    WHERE u.role = 'USER'
    ORDER BY u.nickname, u.id, p.company_id`, [ACTIVE_GAME_ID, initialCash])

  const participants = new Map()
  for (const row of result.rows) {
    let participant = participants.get(row.user_id)
    if (!participant) {
      participant = {
        userId: row.user_id,
        nickname: row.nickname,
        online: presence.isOnline(row.user_id),
        cash: number(row.cash),
        stockValue: 0,
        totalAssets: number(row.cash),
        holdings: [],
        joinedAt: row.created_at,
      }
      participants.set(row.user_id, participant)
    }
    if (!row.company_id) continue
    const marketValue = number(row.quantity) * number(row.current_price)
    participant.stockValue += marketValue
    participant.totalAssets += marketValue
    participant.holdings.push({
      companyId: row.company_id,
      name: row.company_name,
      quantity: number(row.quantity),
      currentPrice: number(row.current_price),
      marketValue,
    })
  }
  return [...participants.values()]
}

export function createAdminRouter(database, {
  adminPassword,
  clientUrl,
  presence,
  initialCash = 1_000_000,
}) {
  const router = Router()

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (request.headers.origin && request.headers.origin !== clientUrl) {
      return response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' })
    }
    if (request.headers.origin === clientUrl) {
      response.set('Access-Control-Allow-Origin', clientUrl)
      response.set('Access-Control-Allow-Credentials', 'true')
      response.vary('Origin')
    }
    if (request.method === 'OPTIONS') {
      response.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
      response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      return response.sendStatus(204)
    }
    next()
  })

  router.get('/participants', createRequireAdmin(adminPassword), async (_request, response, next) => {
    if (!database) return response.status(503).json({ error: 'DATABASE_UNAVAILABLE' })
    try {
      const participants = await listParticipants(database, presence, initialCash)
      response.json({ participants, onlineParticipants: presence.onlineCount() })
    } catch (error) {
      next(error)
    }
  })

  router.get('/participants/:userId/trades', createRequireAdmin(adminPassword), async (request, response, next) => {
    if (!database) return response.status(503).json({ error: 'DATABASE_UNAVAILABLE' })
    try {
      const userId = validateUserId(request.params.userId)
      const game = (await database.query('SELECT total_rounds FROM games WHERE id = $1', [ACTIVE_GAME_ID])).rows[0]
      const round = parseRound(request.query.round, game?.total_rounds || 12)
      const participant = (await database.query("SELECT id, nickname FROM users WHERE id = $1 AND role = 'USER'", [userId])).rows[0]
      if (!participant) throw new MarketHistoryError(404, 'PARTICIPANT_NOT_FOUND')
      response.json({
        participant: { userId: participant.id, nickname: participant.nickname },
        ...(await getTradeHistory(database, userId, { round })),
      })
    } catch (error) {
      if (error instanceof MarketHistoryError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  return router
}
