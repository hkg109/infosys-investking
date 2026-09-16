import { Router } from 'express'
import { createRequireAdmin } from './admin-auth.js'
import { requireSessionUser } from './session-auth.js'
import { adminRankingPayload, refreshRankings, viewerRankingPayload } from './rankings.js'

export function createRankingRouter(database, engine, { clientUrl, adminPassword, initialCash = 1_000_000, beforeRefresh = async () => {} }) {
  const router = Router()
  const requireAdmin = createRequireAdmin(adminPassword)

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
    if (!database) return response.status(503).json({ error: 'DATABASE_UNAVAILABLE' })
    next()
  })

  router.get('/', requireSessionUser(database), async (request, response, next) => {
    try {
      await beforeRefresh()
      const game = engine.getSnapshot()
      const snapshot = await refreshRankings(database, { initialCash, final: game.status === 'FINISHED' })
      response.json({ gameStatus: game.status, ranking: viewerRankingPayload(snapshot, request.user.id) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/admin', requireAdmin, async (_request, response, next) => {
    try {
      await beforeRefresh()
      const game = engine.getSnapshot()
      const snapshot = await refreshRankings(database, { initialCash, final: game.status === 'FINISHED' })
      response.json({ gameStatus: game.status, ranking: adminRankingPayload(snapshot) })
    } catch (error) {
      next(error)
    }
  })

  return router
}
