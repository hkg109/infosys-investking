import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { requireSessionUser } from './session-auth.js'
import { adminRankingPayload, refreshRankings, viewerRankingPayload } from './rankings.js'

function matchesSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function createRankingRouter(database, engine, { clientUrl, adminPassword, initialCash = 1_000_000, beforeRefresh = async () => {} }) {
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

  router.get('/admin', async (request, response, next) => {
    try {
      if (!adminPassword) return response.status(503).json({ error: 'ADMIN_AUTH_UNAVAILABLE' })
      const authorization = request.get('Authorization') || ''
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
      if (!matchesSecret(token, adminPassword)) return response.status(401).json({ error: 'ADMIN_AUTH_REQUIRED' })
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
