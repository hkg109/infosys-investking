import { ACTIVE_GAME_ID } from './game-store.js'

function number(value) {
  return value === null || value === undefined ? null : Number(value)
}

function rankingJson(row) {
  return {
    userId: row.user_id,
    nickname: row.nickname,
    rank: number(row.rank),
    cash: number(row.cash),
    stockValue: number(row.stock_value),
    totalAssets: number(row.total_assets),
  }
}

async function withTransaction(database, callback) {
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function readSnapshot(database, gameId = ACTIVE_GAME_ID) {
  const [stateResult, rankingResult] = await Promise.all([
    database.query('SELECT is_final, calculated_at FROM ranking_states WHERE game_id = $1', [gameId]),
    database.query(`SELECT rs.*, u.nickname
      FROM ranking_snapshots rs
      JOIN users u ON u.id = rs.user_id
      WHERE rs.game_id = $1
      ORDER BY rs.rank, u.nickname, rs.user_id`, [gameId]),
  ])
  const state = stateResult.rows[0]
  return {
    final: state?.is_final ?? false,
    calculatedAt: state?.calculated_at ?? null,
    rankings: rankingResult.rows.map(rankingJson),
  }
}

function publicEntry(entry) {
  return {
    nickname: entry.nickname,
    rank: entry.rank,
    totalAssets: entry.totalAssets,
  }
}

function accountEntry(entry) {
  const { userId: _userId, ...accountRanking } = entry
  return accountRanking
}

export function publicRankingPayload(snapshot) {
  const rankings = snapshot.rankings.map(publicEntry)
  return {
    final: snapshot.final,
    calculatedAt: snapshot.calculatedAt,
    totalParticipants: rankings.length,
    top3: rankings.filter(({ rank }) => rank <= 3),
    rankings,
  }
}

export function viewerRankingPayload(snapshot, userId) {
  const payload = publicRankingPayload(snapshot)
  const mine = snapshot.rankings.find((entry) => entry.userId === userId)
  return { ...payload, me: mine ? accountEntry(mine) : null }
}

export function adminRankingPayload(snapshot) {
  return {
    ...publicRankingPayload(snapshot),
    rankings: snapshot.rankings.map(accountEntry),
  }
}

export async function refreshRankings(database, {
  initialCash = 1_000_000,
  final = false,
  gameId = ACTIVE_GAME_ID,
} = {}) {
  return withTransaction(database, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`ranking:${gameId}`])
    const existingState = await client.query('SELECT is_final FROM ranking_states WHERE game_id = $1', [gameId])
    if (existingState.rows[0]?.is_final) return readSnapshot(client, gameId)

    await client.query(`INSERT INTO wallets (game_id, user_id, cash)
      SELECT $1, id, $2 FROM users WHERE role = 'USER'
      ON CONFLICT (game_id, user_id) DO NOTHING`, [gameId, initialCash])

    const calculated = await client.query(`WITH asset_totals AS (
        SELECT u.id AS user_id, u.nickname, w.cash::numeric AS cash,
          COALESCE(SUM(p.quantity::numeric * c.current_price::numeric), 0) AS stock_value
        FROM users u
        JOIN wallets w ON w.game_id = $1 AND w.user_id = u.id
        LEFT JOIN portfolios p ON p.game_id = $1 AND p.user_id = u.id
        LEFT JOIN companies c ON c.id = p.company_id
        WHERE u.role = 'USER'
        GROUP BY u.id, u.nickname, w.cash
      ), totals AS (
        SELECT *, cash + stock_value AS total_assets FROM asset_totals
      )
      SELECT *, RANK() OVER (ORDER BY total_assets DESC) AS rank
      FROM totals ORDER BY rank, nickname, user_id`, [gameId])

    await client.query('DELETE FROM ranking_snapshots WHERE game_id = $1', [gameId])
    for (const row of calculated.rows) {
      await client.query(`INSERT INTO ranking_snapshots
        (game_id, user_id, rank, cash, stock_value, total_assets, is_final)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        gameId, row.user_id, row.rank, row.cash, row.stock_value, row.total_assets, final,
      ])
    }
    await client.query(`INSERT INTO ranking_states (game_id, is_final, calculated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (game_id) DO UPDATE SET is_final = EXCLUDED.is_final, calculated_at = NOW()`, [gameId, final])
    return readSnapshot(client, gameId)
  })
}

export function createRankingCoordinator(database, io, { initialCash = 1_000_000 } = {}) {
  async function refreshAndEmit({ final = false } = {}) {
    if (!database) return null
    const snapshot = await refreshRankings(database, { initialCash, final })
    io.emit('ranking:update', publicRankingPayload(snapshot))
    return snapshot
  }

  return {
    refreshAndEmit,

    async handleGameEvent({ name }) {
      if (!database || !['game:start', 'trading:close', 'game:end'].includes(name)) return null
      return refreshAndEmit({ final: name === 'game:end' })
    },

    async reconcile(game) {
      if (!database) return null
      return refreshRankings(database, { initialCash, final: game.status === 'FINISHED' })
    },
  }
}
