import { Router } from 'express'
import { createRequireAdmin } from './admin-auth.js'
import { GameStateError } from './game-engine.js'

export function createGameRouter(engine, { adminPassword, clientUrl, beforeStart = async () => {}, resetGame = null }) {
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
      response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      return response.sendStatus(204)
    }
    next()
  })

  router.get('/', (_request, response) => {
    response.json({ game: engine.getSnapshot() })
  })

  router.use('/admin', createRequireAdmin(adminPassword))

  router.post('/admin/start', async (_request, response, next) => {
    try {
      const snapshot = engine.getSnapshot()
      if (snapshot.status !== 'WAITING') throw new GameStateError('start', snapshot.status)
      await beforeStart(snapshot)
      response.json({ game: engine.start() })
    } catch (error) {
      if (error instanceof GameStateError) {
        return response.status(409).json({ error: error.code, action: error.action, status: error.status })
      }
      if (Number.isInteger(error.status) && error.code) {
        return response.status(error.status).json({ error: error.code, ...error.details })
      }
      next(error)
    }
  })

  for (const action of ['pause', 'resume', 'end']) {
    router.post(`/admin/${action}`, (_request, response) => {
      try {
        response.json({ game: engine[action]() })
      } catch (error) {
        if (error instanceof GameStateError) {
          return response.status(409).json({
            error: error.code,
            action: error.action,
            status: error.status,
          })
        }
        throw error
      }
    })
  }

  router.post('/admin/reset', async (_request, response, next) => {
    if (!resetGame) return response.status(503).json({ error: 'DATABASE_UNAVAILABLE' })
    try {
      response.json({ game: await resetGame() })
    } catch (error) {
      if (Number.isInteger(error.status) && error.code) {
        return response.status(error.status).json({ error: error.code, ...error.details })
      }
      next(error)
    }
  })

  return router
}
