import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { GameStateError } from './game-engine.js'

function matchesSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function createGameRouter(engine, { adminPassword, clientUrl }) {
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

  router.use('/admin', (request, response, next) => {
    if (!adminPassword) return response.status(503).json({ error: 'ADMIN_AUTH_UNAVAILABLE' })
    const authorization = request.get('Authorization') || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!matchesSecret(token, adminPassword)) return response.status(401).json({ error: 'ADMIN_AUTH_REQUIRED' })
    next()
  })

  for (const action of ['start', 'pause', 'resume', 'end']) {
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

  return router
}
