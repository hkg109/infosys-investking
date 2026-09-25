import { Router } from 'express'
import { randomBytes, randomUUID } from 'node:crypto'
import { hashPin, verifyPin } from './pin.js'
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  digestSessionToken,
  findSessionUser,
  publicUser,
  readSessionTokens,
} from './session-auth.js'

const sessionDurationMs = 7 * 24 * 60 * 60 * 1000

export function createUserRouter(database, {
  clientUrl,
  secureCookies = false,
  onUserCreated = async () => {},
  onUserLogout = async () => {},
}) {
  const router = Router()
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: secureCookies, path: SESSION_COOKIE_PATH }

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    // Browser origin check protects cookie-authenticated mutations; CORS alone does not.
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
      response.set('Access-Control-Allow-Headers', 'Content-Type')
      return response.sendStatus(204)
    }
    if (!database) return response.status(503).json({ error: 'DATABASE_UNAVAILABLE' })
    next()
  })

  function validateEntry(request, response, next) {
    const { nickname, pin } = request.body || {}
    if (typeof nickname !== 'string' || typeof pin !== 'string') {
      return response.status(400).json({ error: 'INVALID_INPUT' })
    }
    const normalized = nickname.trim().normalize('NFC')
    if (!normalized || [...normalized].length > 30 || /[\p{Cc}\p{Cf}]/u.test(normalized) || !/^[0-9]{4}$/.test(pin)) {
      return response.status(400).json({ error: 'INVALID_INPUT' })
    }
    request.entry = { nickname: normalized, pin }
    next()
  }

  async function insertSession(client, userId, request) {
    const token = randomBytes(32).toString('hex')
    const previousHashes = readSessionTokens(request).map(digestSessionToken)
    if (previousHashes.length) await client.query('DELETE FROM user_sessions WHERE token_hash = ANY($1::text[])', [previousHashes])
    await client.query('DELETE FROM user_sessions WHERE expires_at <= NOW()')
    await client.query('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [digestSessionToken(token), userId, new Date(Date.now() + sessionDurationMs)])
    return token
  }

  router.post('/join', validateEntry, async (request, response, next) => {
    let client
    try {
      const { nickname, pin } = request.entry
      const encoded = await hashPin(pin)
      client = await database.connect()
      await client.query('BEGIN')
      const result = await client.query("INSERT INTO users (id, nickname, pin_hash, role) VALUES ($1, $2, $3, 'USER') RETURNING *",
        [randomUUID(), nickname, encoded])
      const token = await insertSession(client, result.rows[0].id, request)
      await client.query('COMMIT')
      // Ranking hooks use the pool again, so do not retain this connection.
      client.release()
      client = null
      await onUserCreated(publicUser(result.rows[0])).catch(() => console.error('Failed to process user join hooks'))
      response.cookie(SESSION_COOKIE_NAME, token, { ...cookieOptions, maxAge: sessionDurationMs })
      response.status(201).json({ user: publicUser(result.rows[0]) })
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      if (error.code === '23505') return response.status(409).json({ error: 'NICKNAME_TAKEN' })
      next(error)
    } finally { client?.release() }
  })

  router.post('/recover', validateEntry, async (request, response, next) => {
    let client
    try {
      const { nickname, pin } = request.entry
      const result = await database.query('SELECT * FROM users WHERE nickname = $1', [nickname])
      const user = result.rows[0]
      if (!user || !(await verifyPin(pin, user.pin_hash))) {
        return response.status(401).json({ error: 'INVALID_CREDENTIALS' })
      }
      client = await database.connect()
      await client.query('BEGIN')
      const token = await insertSession(client, user.id, request)
      await client.query('COMMIT')
      response.cookie(SESSION_COOKIE_NAME, token, { ...cookieOptions, maxAge: sessionDurationMs })
      response.json({ user: publicUser(user) })
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      next(error)
    } finally { client?.release() }
  })

  router.get('/me', async (request, response) => {
    const user = await findSessionUser(database, request)
    if (!user) return response.status(401).json({ error: 'AUTH_REQUIRED' })
    response.json({ user: publicUser(user) })
  })

  router.post('/logout', async (request, response) => {
    const hashes = readSessionTokens(request).map(digestSessionToken)
    let userIds = []
    if (hashes.length) {
      const sessions = await database.query('DELETE FROM user_sessions WHERE token_hash = ANY($1::text[]) RETURNING user_id', [hashes])
      userIds = [...new Set(sessions.rows.map(({ user_id: userId }) => userId))]
    }
    await onUserLogout(userIds)
    response.clearCookie(SESSION_COOKIE_NAME, cookieOptions)
    response.sendStatus(204)
  })

  return router
}
