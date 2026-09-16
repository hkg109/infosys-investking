import { ACTIVE_GAME_ID } from './game-store.js'

export class GameResetError extends Error {
  constructor(status, code, details = {}) {
    super(code)
    this.name = 'GameResetError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function resetDatabase(database) {
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`game-reset:${ACTIVE_GAME_ID}`])
    await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE')
    const game = await client.query('SELECT status FROM games WHERE id = $1 FOR UPDATE', [ACTIVE_GAME_ID])
    if (game.rows[0]?.status !== 'FINISHED') {
      throw new GameResetError(409, 'GAME_RESET_NOT_ALLOWED', { status: game.rows[0]?.status || null })
    }

    await client.query("DELETE FROM users WHERE role = 'USER'")
    await client.query('DELETE FROM game_events WHERE game_id = $1', [ACTIVE_GAME_ID])
    await client.query('DELETE FROM ranking_states WHERE game_id = $1', [ACTIVE_GAME_ID])
    await client.query('UPDATE companies SET current_price = initial_price')
    await client.query(`UPDATE games SET
      status = 'WAITING', phase = 'WAITING', phase_before_pause = NULL,
      current_round = 0, started_at = NULL, round_started_at = NULL,
      phase_ends_at = NULL, paused_at = NULL, paused_remaining_ms = NULL,
      finished_at = NULL, updated_at = NOW()
      WHERE id = $1`, [ACTIVE_GAME_ID])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export function createGameResetCoordinator(database, engine, { onReset = () => {} } = {}) {
  let resetting = false

  return {
    isResetting: () => resetting,

    blockMutations(request, response, next) {
      if (!resetting || ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
          request.path === '/api/game/admin/reset' || request.path === '/api/admin/auth/verify') {
        return next()
      }
      return response.status(409).json({ error: 'GAME_RESET_IN_PROGRESS' })
    },

    async reset() {
      if (!database) throw new GameResetError(503, 'DATABASE_UNAVAILABLE')
      if (resetting) throw new GameResetError(409, 'GAME_RESET_IN_PROGRESS')
      const snapshot = engine.getSnapshot()
      if (snapshot.status !== 'FINISHED') {
        throw new GameResetError(409, 'GAME_RESET_NOT_ALLOWED', { status: snapshot.status })
      }

      resetting = true
      try {
        await resetDatabase(database)
        const game = engine.reset()
        await onReset()
        return game
      } finally {
        resetting = false
      }
    },
  }
}
