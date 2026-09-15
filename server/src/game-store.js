export const ACTIVE_GAME_ID = '00000000-0000-0000-0000-000000000001'

function toMillis(value) {
  return value === null || value === undefined ? null : new Date(value).getTime()
}

export async function loadGameState(database, defaults) {
  if (!database) return null
  await database.query(`INSERT INTO games (
    id, status, phase, current_round, total_rounds, round_duration_ms, trading_duration_ms
  ) VALUES ($1, 'WAITING', 'WAITING', 0, $2, $3, $4)
  ON CONFLICT (id) DO NOTHING`, [ACTIVE_GAME_ID, defaults.totalRounds, defaults.roundDurationMs, defaults.tradingDurationMs])
  const result = await database.query('SELECT * FROM games WHERE id = $1', [ACTIVE_GAME_ID])
  const row = result.rows[0]
  if (!row) return null
  return {
    status: row.status,
    phase: row.phase,
    phaseBeforePause: row.phase_before_pause,
    currentRound: row.current_round,
    totalRounds: row.total_rounds,
    roundDurationMs: row.round_duration_ms,
    tradingDurationMs: row.trading_duration_ms,
    startedAt: toMillis(row.started_at),
    roundStartedAt: toMillis(row.round_started_at),
    deadlineAt: toMillis(row.phase_ends_at),
    pausedAt: toMillis(row.paused_at),
    pausedRemainingMs: row.paused_remaining_ms,
    finishedAt: toMillis(row.finished_at),
  }
}

export async function saveGameState(database, snapshot) {
  if (!database) return
  const pausedRemainingMs = snapshot.status === 'PAUSED' && snapshot.remainingSeconds !== null
    ? snapshot.remainingSeconds * 1000
    : null
  await database.query(`INSERT INTO games (
    id, status, phase, phase_before_pause, current_round, total_rounds,
    round_duration_ms, trading_duration_ms, started_at, round_started_at,
    phase_ends_at, paused_at, paused_remaining_ms, finished_at, updated_at
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
  ON CONFLICT (id) DO UPDATE SET
    status=EXCLUDED.status, phase=EXCLUDED.phase, phase_before_pause=EXCLUDED.phase_before_pause,
    current_round=EXCLUDED.current_round, total_rounds=EXCLUDED.total_rounds,
    round_duration_ms=EXCLUDED.round_duration_ms, trading_duration_ms=EXCLUDED.trading_duration_ms,
    started_at=EXCLUDED.started_at, round_started_at=EXCLUDED.round_started_at,
    phase_ends_at=EXCLUDED.phase_ends_at, paused_at=EXCLUDED.paused_at,
    paused_remaining_ms=EXCLUDED.paused_remaining_ms, finished_at=EXCLUDED.finished_at,
    updated_at=NOW()`, [
    ACTIVE_GAME_ID,
    snapshot.status,
    snapshot.phase,
    snapshot.phaseBeforePause,
    snapshot.currentRound,
    snapshot.totalRounds,
    snapshot.roundDurationSeconds * 1000,
    snapshot.tradingDurationSeconds * 1000,
    snapshot.startedAt,
    snapshot.roundStartedAt,
    snapshot.phaseEndsAt,
    snapshot.pausedAt,
    pausedRemainingMs,
    snapshot.finishedAt,
  ])
}
