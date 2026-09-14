import { Router } from 'express'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { hashPin, verifyPin } from './pin.js'

const cookieName = 'investking_session'
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000
const digestToken = (token) => createHash('sha256').update(token).digest('hex')

function readToken(request) {
  const cookie = request.headers.cookie?.split(';').map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
  const token = cookie?.slice(cookieName.length + 1)
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null
}

function publicUser(row) {
  return { userId: row.id, nickname: row.nickname, role: row.role, createdAt: row.created_at }
}

export function createUserRouter(database, { clientUrl, secureCookies = false }) {
  const router = Router()
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: secureCookies, path: '/api/users' }

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
    const previous = readToken(request)
    if (previous) await client.query('DELETE FROM user_sessions WHERE token_hash = $1', [digestToken(previous)])
    await client.query('DELETE FROM user_sessions WHERE expires_at <= NOW()')
    await client.query('INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [digestToken(token), userId, new Date(Date.now() + sessionDurationMs)])
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
      response.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDurationMs })
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
      response.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDurationMs })
      response.json({ user: publicUser(user) })
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      next(error)
    } finally { client?.release() }
  })

  router.get('/me', async (request, response) => {
    const token = readToken(request)
    if (!token) return response.status(401).json({ error: 'AUTH_REQUIRED' })
    const result = await database.query(`SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [digestToken(token)])
    if (!result.rows[0]) return response.status(401).json({ error: 'AUTH_REQUIRED' })
    response.json({ user: publicUser(result.rows[0]) })
  })

  router.post('/logout', async (request, response) => {
    const token = readToken(request)
    if (token) await database.query('DELETE FROM user_sessions WHERE token_hash = $1', [digestToken(token)])
    response.clearCookie(cookieName, cookieOptions)
    response.sendStatus(204)
  })

  return router
}
