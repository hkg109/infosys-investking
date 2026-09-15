import { createHash } from 'node:crypto'

export const SESSION_COOKIE_NAME = 'investking_session'
export const SESSION_COOKIE_PATH = '/api'

export const digestSessionToken = (token) => createHash('sha256').update(token).digest('hex')

export function readSessionTokens(request) {
  return [...new Set((request.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`))
    .map((value) => value.slice(SESSION_COOKIE_NAME.length + 1))
    .filter((value) => /^[a-f0-9]{64}$/.test(value)))]
}

export function publicUser(row) {
  return { userId: row.id, nickname: row.nickname, role: row.role, createdAt: row.created_at }
}

export async function findSessionUser(database, request) {
  const hashes = readSessionTokens(request).map(digestSessionToken)
  if (hashes.length === 0) return null
  const result = await database.query(`SELECT u.* FROM user_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ANY($1::text[]) AND s.expires_at > NOW()
    ORDER BY s.created_at DESC LIMIT 1`, [hashes])
  return result.rows[0] || null
}

export function requireSessionUser(database) {
  return async (request, response, next) => {
    try {
      const user = await findSessionUser(database, request)
      if (!user) return response.status(401).json({ error: 'AUTH_REQUIRED' })
      request.user = user
      next()
    } catch (error) {
      next(error)
    }
  }
}
