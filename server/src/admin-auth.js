import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'

function matchesSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

function bearerToken(request) {
  const authorization = request.get('Authorization') || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
}

export function createRequireAdmin(adminPassword) {
  return function requireAdmin(request, response, next) {
    if (typeof adminPassword !== 'string' || adminPassword.length === 0) {
      return response.status(503).json({ error: 'ADMIN_AUTH_UNAVAILABLE' })
    }
    if (!matchesSecret(bearerToken(request), adminPassword)) {
      return response.status(401).json({ error: 'ADMIN_AUTH_REQUIRED' })
    }
    next()
  }
}

export function createAdminAuthRouter({ adminPassword, clientUrl }) {
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
      response.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      return response.sendStatus(204)
    }
    next()
  })

  router.post('/verify', requireAdmin, (_request, response) => {
    response.status(200).json({ authenticated: true })
  })

  return router
}
