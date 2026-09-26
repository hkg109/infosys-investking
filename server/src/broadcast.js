import { Router } from 'express'
import { ACTIVE_GAME_ID } from './game-store.js'

// Explicit public projections: never serialize account rows or admin schedules.
export async function readBroadcast(database, { now = Date.now, isHalted = () => false } = {}) {
  const client = await database.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const { rows: [row] } = await client.query('SELECT * FROM games WHERE id=$1', [ACTIVE_GAME_ID])
    if (!row) throw new Error('GAME_UNAVAILABLE')
    const time = now()
    const remainingSeconds = row.status === 'PAUSED'
      ? Math.ceil((row.paused_remaining_ms ?? 0) / 1000)
      : row.status === 'RUNNING' && row.phase_ends_at
        ? Math.max(0, Math.ceil((new Date(row.phase_ends_at).getTime() - time) / 1000)) : null
    const halted = isHalted()
    const game = {
      status: row.status, phase: row.phase, phaseBeforePause: row.phase_before_pause,
      currentRound: row.current_round, totalRounds: row.total_rounds,
      remainingSeconds, phaseEndsAt: row.phase_ends_at, startedAt: row.started_at,
      finishedAt: row.finished_at, tradingHalted: halted,
      tradingEnabled: row.status === 'RUNNING' && row.phase === 'TRADING' && remainingSeconds > 0 && !halted,
    }
    const { rows: companies } = await client.query(`SELECT c.id, c.name, c.current_price,
      COALESCE(h.opening_price, c.initial_price) AS opening_price
      FROM companies c LEFT JOIN stock_price_history h ON h.company_id=c.id
        AND h.game_id=$1 AND h.round_number=$2 AND h.snapshot_type='OPEN'
      WHERE c.is_active=TRUE ORDER BY c.id`, [ACTIVE_GAME_ID, row.current_round])
    const market = companies.map(c => ({ companyId: c.id, name: c.name,
      currentPrice: Number(c.current_price), openingPrice: Number(c.opening_price),
      changeRate: Math.round((Number(c.current_price) / Number(c.opening_price) - 1) * 1e6) / 1e4 }))
    const { rows: [state] } = await client.query('SELECT is_final, calculated_at FROM ranking_states WHERE game_id=$1', [ACTIVE_GAME_ID])
    const rankingFinal = row.status === 'FINISHED' && state?.is_final === true
    const rankingQuery = rankingFinal
      ? `SELECT rs.rank, rs.total_assets, u.nickname FROM ranking_snapshots rs
        JOIN users u ON u.id=rs.user_id
        WHERE rs.game_id=$1 ORDER BY rs.rank, rs.total_assets DESC, u.nickname`
      : `SELECT rank, total_assets FROM ranking_snapshots
        WHERE game_id=$1 ORDER BY rank, total_assets DESC`
    const { rows: entries } = await client.query(rankingQuery, [ACTIVE_GAME_ID])
    const rankings = entries.map(r => ({ rank: Number(r.rank), totalAssets: Number(r.total_assets),
      ...(rankingFinal ? { nickname: r.nickname } : {}) }))
    const ranking = { final: rankingFinal,
      calculatedAt: state?.calculated_at ?? null, totalParticipants: rankings.length,
      top3: rankings.filter(r => r.rank <= 3), rankings }
    const { rows: events } = await client.query(`SELECT ge.id, ge.round_number, ge.trigger_phase,
      ge.applied_at, ge.warning_sent_at, ge.scheduled_at, e.title, e.news,
      CASE WHEN ge.applied_at IS NOT NULL THEN e.result END AS result
      FROM game_events ge JOIN events e ON e.id=ge.event_id
      WHERE ge.game_id=$1 AND ge.round_number=$2 AND $2>0
        AND (ge.trigger_phase='CLOSE' OR ge.applied_at IS NOT NULL OR ge.warning_sent_at IS NOT NULL)
      ORDER BY ge.display_order`, [ACTIVE_GAME_ID, row.current_round])
    const news = [], warnings = [], results = []
    for (const event of events) {
      if (event.trigger_phase === 'INTRADAY' && !event.applied_at) {
        warnings.push({ gameEventId: event.id, scheduledAt: event.scheduled_at })
        continue
      }
      news.push({ gameEventId: event.id, title: event.title, news: event.news, triggerPhase: event.trigger_phase })
      if (!event.applied_at) continue
      const { rows: changes } = await client.query(`SELECT company_id, previous_price, new_price, change_rate
        FROM stock_price_changes WHERE game_event_id=$1 ORDER BY company_id`, [event.id])
      results.push({ gameEventId: event.id, title: event.title, result: event.result,
        triggerPhase: event.trigger_phase, appliedAt: event.applied_at,
        changes: changes.map(c => ({ companyId: c.company_id, previousPrice: Number(c.previous_price),
          newPrice: Number(c.new_price), changeRate: Number(c.change_rate) })) })
    }
    await client.query('COMMIT')
    return { version: 1, serverTime: new Date(time).toISOString(), pollAfterMs: 1000, game, market, ranking, news, warnings, results }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

export function createBroadcastRouter(database, { clientUrl, beforeRead = async () => {}, isHalted, now } = {}) {
  const router = Router()
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    res.vary('Origin')
    if (req.headers.origin && req.headers.origin !== clientUrl) return res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' })
    if (req.headers.origin) res.set('Access-Control-Allow-Origin', clientUrl)
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      return res.sendStatus(204)
    }
    if (!database) return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' })
    next()
  })
  router.get('/', async (_req, res, next) => {
    try {
      await beforeRead()
      res.json(await readBroadcast(database, { isHalted, now }))
    } catch (error) { next(error) }
  })
  return router
}
