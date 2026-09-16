import { randomUUID } from 'node:crypto'
import { ACTIVE_GAME_ID } from './game-store.js'
import { recordIntradayEventSnapshot } from './market-history.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_HALT_MS = 3_000

export class EventError extends Error {
  constructor(status, code, details = {}) {
    super(code)
    this.name = 'EventError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const number = (value) => value === null || value === undefined ? null : Number(value)
const date = (value) => value ? new Date(value).toISOString() : null

function eventJson(row, effects = []) {
  return { eventId: row.id, title: row.title, news: row.news, result: row.result, effects, createdAt: row.created_at, updatedAt: row.updated_at }
}

function scheduleJson(row) {
  return {
    gameEventId: row.game_event_id,
    round: number(row.round_number),
    eventId: row.event_id,
    title: row.title,
    news: row.news,
    result: row.result,
    displayOrder: number(row.display_order),
    triggerPhase: row.trigger_phase,
    triggerOffsetSeconds: row.trigger_offset_ms === null ? null : number(row.trigger_offset_ms) / 1000,
    preannounceSeconds: number(row.preannounce_ms) / 1000,
    scheduledAt: date(row.scheduled_at),
    warningSentAt: date(row.warning_sent_at),
    appliedAt: date(row.applied_at),
  }
}

function changeJson(row) {
  return { companyId: row.company_id, name: row.company_name, changeRate: number(row.change_rate), previousPrice: number(row.previous_price), newPrice: number(row.new_price) }
}

export function validateEventId(value) {
  if (!uuidPattern.test(value || '')) throw new EventError(400, 'INVALID_EVENT_ID')
  return value.toLowerCase()
}

export function validateEventInput(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const news = typeof body?.news === 'string' ? body.news.trim() : ''
  const result = typeof body?.result === 'string' ? body.result.trim() : ''
  if (!title || title.length > 100 || !news || news.length > 2_000 || !result || result.length > 2_000 || !Array.isArray(body?.effects) || body.effects.length < 1 || body.effects.length > 50) throw new EventError(400, 'INVALID_EVENT')
  const seen = new Set()
  const effects = body.effects.map((effect) => {
    const companyId = typeof effect?.companyId === 'string' ? effect.companyId.trim().toUpperCase() : ''
    if (!companyId || companyId.length > 20 || !Number.isSafeInteger(effect?.changeRate) || effect.changeRate < -99 || effect.changeRate > 1_000 || seen.has(companyId)) throw new EventError(400, 'INVALID_EVENT_EFFECT')
    seen.add(companyId)
    return { companyId, changeRate: effect.changeRate }
  })
  return { title, news, result, effects }
}

async function withTransaction(database, work) {
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    const value = await work(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}

async function ensureCompanies(client, effects) {
  const companyIds = effects.map(({ companyId }) => companyId)
  const result = await client.query('SELECT id, is_active FROM companies WHERE id = ANY($1::varchar[])', [companyIds])
  const existing = new Set(result.rows.map(({ id }) => id))
  const missing = companyIds.filter((id) => !existing.has(id))
  if (missing.length) throw new EventError(400, 'COMPANY_NOT_FOUND', { companyIds: missing })
  const inactive = result.rows.filter((row) => !row.is_active).map(({ id }) => id).sort()
  if (inactive.length) throw new EventError(409, 'COMPANY_INACTIVE', { companyIds: inactive })
}

async function replaceEffects(client, eventId, effects) {
  await ensureCompanies(client, effects)
  await client.query('DELETE FROM event_effects WHERE event_id = $1', [eventId])
  for (const effect of effects) await client.query('INSERT INTO event_effects (event_id, company_id, change_rate) VALUES ($1, $2, $3)', [eventId, effect.companyId, effect.changeRate])
}

export async function listEvents(database) {
  const result = await database.query(`SELECT e.*, COALESCE(json_agg(json_build_object('companyId', ee.company_id, 'changeRate', ee.change_rate) ORDER BY ee.company_id) FILTER (WHERE ee.company_id IS NOT NULL), '[]') AS effects
    FROM events e LEFT JOIN event_effects ee ON ee.event_id = e.id GROUP BY e.id ORDER BY e.created_at, e.id`)
  return result.rows.map((row) => eventJson(row, row.effects))
}

export async function createEvent(database, input) {
  const event = validateEventInput(input)
  return withTransaction(database, async (client) => {
    const id = randomUUID()
    await client.query('INSERT INTO events (id, title, news, result) VALUES ($1, $2, $3, $4)', [id, event.title, event.news, event.result])
    await replaceEffects(client, id, event.effects)
    return eventJson((await client.query('SELECT * FROM events WHERE id = $1', [id])).rows[0], event.effects)
  })
}

export async function updateEvent(database, eventId, input) {
  const id = validateEventId(eventId)
  const event = validateEventInput(input)
  return withTransaction(database, async (client) => {
    const updated = await client.query('UPDATE events SET title = $2, news = $3, result = $4, updated_at = NOW() WHERE id = $1 RETURNING *', [id, event.title, event.news, event.result])
    if (!updated.rows[0]) throw new EventError(404, 'EVENT_NOT_FOUND')
    await replaceEffects(client, id, event.effects)
    return eventJson(updated.rows[0], event.effects)
  })
}

export async function deleteEvent(database, eventId) {
  try {
    const deleted = await database.query('DELETE FROM events WHERE id = $1 RETURNING id', [validateEventId(eventId)])
    if (!deleted.rows[0]) throw new EventError(404, 'EVENT_NOT_FOUND')
  } catch (error) {
    if (error.code === '23503') throw new EventError(409, 'EVENT_IN_USE')
    throw error
  }
}

function validateSchedule(input, { totalRounds, tradingDurationMs, haltDurationMs = DEFAULT_HALT_MS }) {
  if (!Array.isArray(input?.rounds)) throw new EventError(400, 'INVALID_EVENT_SCHEDULE')
  const rounds = new Set()
  const events = new Set()
  const rows = []
  for (const group of input.rounds) {
    if (!Number.isInteger(group?.round) || group.round < 1 || group.round > totalRounds || rounds.has(group.round) || !Array.isArray(group.events) || group.events.length > 10) throw new EventError(400, 'INVALID_EVENT_SCHEDULE')
    rounds.add(group.round)
    const orders = new Set()
    const windows = []
    for (let index = 0; index < group.events.length; index += 1) {
      const item = group.events[index]
      const eventId = validateEventId(item?.eventId)
      if (events.has(eventId)) throw new EventError(409, 'DUPLICATE_EVENT_ASSIGNMENT', { eventId })
      events.add(eventId)
      const displayOrder = item.displayOrder ?? index + 1
      const triggerPhase = item.triggerPhase || 'CLOSE'
      const offset = item.triggerOffsetSeconds
      const warning = item.preannounceSeconds ?? 0
      if (!Number.isInteger(displayOrder) || displayOrder < 1 || orders.has(displayOrder) || !Number.isInteger(warning) || warning < 0) throw new EventError(400, 'INVALID_EVENT_SCHEDULE')
      orders.add(displayOrder)
      if (triggerPhase === 'INTRADAY') {
        if (!Number.isInteger(offset) || offset < 1 || offset * 1000 + haltDurationMs >= tradingDurationMs || warning >= offset) throw new EventError(400, 'INVALID_EVENT_SCHEDULE')
        const window = { start: (offset - warning) * 1000, end: offset * 1000 + haltDurationMs }
        if (windows.some((existing) => window.start < existing.end && window.end > existing.start)) throw new EventError(409, 'EVENT_SCHEDULE_CONFLICT', { round: group.round })
        windows.push(window)
      } else if (triggerPhase !== 'CLOSE' || (offset !== undefined && offset !== null) || warning !== 0) throw new EventError(400, 'INVALID_EVENT_SCHEDULE')
      rows.push({ round: group.round, eventId, displayOrder, triggerPhase, triggerOffsetMs: triggerPhase === 'INTRADAY' ? offset * 1000 : null, preannounceMs: warning * 1000 })
    }
  }
  return rows.sort((a, b) => a.round - b.round || a.displayOrder - b.displayOrder)
}

async function replaceSchedule(client, rows, gameId, mode) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`event-schedule:${gameId}`])
  if (rows.length) {
    const ids = rows.map(({ eventId }) => eventId)
    const found = await client.query(`SELECT e.id FROM events e WHERE e.id = ANY($1::uuid[]) AND NOT EXISTS (
      SELECT 1 FROM event_effects ee JOIN companies c ON c.id = ee.company_id WHERE ee.event_id = e.id AND c.is_active = FALSE)`, [ids])
    const foundIds = new Set(found.rows.map(({ id }) => id))
    const missing = ids.filter((id) => !foundIds.has(id))
    if (missing.length) throw new EventError(400, 'EVENT_NOT_FOUND', { eventIds: missing })
  }
  await client.query('DELETE FROM game_events WHERE game_id = $1', [gameId])
  for (const row of rows) await client.query(`INSERT INTO game_events
    (id, game_id, event_id, round_number, display_order, trigger_phase, trigger_offset_ms, preannounce_ms)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [randomUUID(), gameId, row.eventId, row.round, row.displayOrder, row.triggerPhase, row.triggerOffsetMs, row.preannounceMs])
  await client.query(`INSERT INTO event_schedule_states (game_id, mode, configured_at) VALUES ($1,$2,NOW())
    ON CONFLICT (game_id) DO UPDATE SET mode = EXCLUDED.mode, configured_at = NOW()`, [gameId, mode])
}

export async function saveGameSchedule(database, input, options, gameId = ACTIVE_GAME_ID) {
  const rows = validateSchedule(input, options)
  await withTransaction(database, (client) => replaceSchedule(client, rows, gameId, 'MANUAL'))
  return getGameSchedule(database, gameId)
}

export async function randomizeEvents(database, totalRounds, options = {}, gameId = ACTIVE_GAME_ID) {
  const intraday = options.intradayEventsPerRound ?? 0
  const closing = options.closingEventsPerRound ?? 1
  const preannounce = options.preannounceSeconds ?? 0
  const tradingDurationMs = options.tradingDurationMs ?? 540_000
  const haltDurationMs = options.haltDurationMs ?? DEFAULT_HALT_MS
  if (![intraday, closing].every((value) => Number.isInteger(value) && value >= 0 && value <= 3) || !Number.isInteger(preannounce) || preannounce < 0) throw new EventError(400, 'INVALID_EVENT_SCHEDULE')
  const required = totalRounds * (intraday + closing)
  return withTransaction(database, async (client) => {
    const candidates = await client.query(`SELECT e.id FROM events e WHERE NOT EXISTS (
      SELECT 1 FROM event_effects ee JOIN companies c ON c.id = ee.company_id WHERE ee.event_id = e.id AND c.is_active = FALSE)
      ORDER BY random() LIMIT $1`, [required])
    if (candidates.rowCount < required) throw new EventError(409, 'EVENT_POOL_TOO_SMALL', { required, available: candidates.rowCount })
    let cursor = 0
    const rounds = Array.from({ length: totalRounds }, (_, roundIndex) => {
      const events = []
      for (let index = 0; index < intraday; index += 1) {
        const offsetSeconds = Math.floor((tradingDurationMs / 1000) * (index + 1) / (intraday + 1))
        events.push({ eventId: candidates.rows[cursor++].id, displayOrder: events.length + 1, triggerPhase: 'INTRADAY', triggerOffsetSeconds: offsetSeconds, preannounceSeconds: Math.min(preannounce, offsetSeconds - 1) })
      }
      for (let index = 0; index < closing; index += 1) events.push({ eventId: candidates.rows[cursor++].id, displayOrder: events.length + 1, triggerPhase: 'CLOSE' })
      return { round: roundIndex + 1, events }
    })
    const rows = validateSchedule({ rounds }, { totalRounds, tradingDurationMs, haltDurationMs })
    await replaceSchedule(client, rows, gameId, 'RANDOM')
    return getGameSchedule(client, gameId)
  })
}

export async function assignEvents(database, totalRounds, gameId = ACTIVE_GAME_ID) {
  if (!Number.isInteger(totalRounds) || totalRounds < 1) throw new TypeError('totalRounds must be a positive integer')
  const configured = await database.query('SELECT 1 FROM event_schedule_states WHERE game_id = $1', [gameId])
  if (configured.rowCount) return getGameSchedule(database, gameId)
  const existing = await database.query('SELECT 1 FROM game_events WHERE game_id = $1 LIMIT 1', [gameId])
  if (existing.rowCount) {
    await database.query(`INSERT INTO event_schedule_states (game_id, mode) VALUES ($1, 'RANDOM') ON CONFLICT (game_id) DO NOTHING`, [gameId])
    return getGameSchedule(database, gameId)
  }
  return randomizeEvents(database, totalRounds, {}, gameId)
}

export async function getGameSchedule(database, gameId = ACTIVE_GAME_ID) {
  const result = await database.query(`SELECT ge.id AS game_event_id, ge.*, e.id AS event_id, e.title, e.news, e.result
    FROM game_events ge JOIN events e ON e.id = ge.event_id WHERE ge.game_id = $1 ORDER BY ge.round_number, ge.display_order`, [gameId])
  return result.rows.map(scheduleJson)
}

export async function getRoundEvents(database, round, gameId = ACTIVE_GAME_ID) {
  if (!Number.isInteger(round) || round < 1) return []
  const schedule = await database.query(`SELECT ge.id AS game_event_id, ge.*, e.id AS event_id, e.title, e.news, e.result
    FROM game_events ge JOIN events e ON e.id = ge.event_id WHERE ge.game_id = $1 AND ge.round_number = $2 ORDER BY ge.display_order`, [gameId, round])
  const output = []
  for (const row of schedule.rows) {
    const item = { ...scheduleJson(row), applied: Boolean(row.applied_at) }
    if (!item.applied) { delete item.result; output.push(item); continue }
    const changes = await database.query(`SELECT spc.*, c.name AS company_name FROM stock_price_changes spc JOIN companies c ON c.id = spc.company_id WHERE spc.game_event_id = $1 ORDER BY spc.company_id`, [row.game_event_id])
    output.push({ ...item, changes: changes.rows.map(changeJson) })
  }
  return output
}

export async function getRoundEvent(database, round, gameId = ACTIVE_GAME_ID) {
  return (await getRoundEvents(database, round, gameId))[0] || null
}

export async function applyScheduledEvent(database, gameEventId, gameId = ACTIVE_GAME_ID) {
  return withTransaction(database, async (client) => {
    const selected = await client.query(`SELECT ge.id AS game_event_id, ge.*, e.id AS event_id, e.title, e.news, e.result
      FROM game_events ge JOIN events e ON e.id = ge.event_id WHERE ge.game_id = $1 AND ge.id = $2 FOR UPDATE OF ge`, [gameId, gameEventId])
    const event = selected.rows[0]
    if (!event) throw new EventError(409, 'EVENT_NOT_ASSIGNED')
    if (!event.applied_at) {
      const effects = await client.query(`SELECT ee.company_id, ee.change_rate, c.current_price FROM event_effects ee JOIN companies c ON c.id = ee.company_id
        WHERE ee.event_id = $1 AND c.is_active = TRUE ORDER BY ee.company_id FOR UPDATE OF c`, [event.event_id])
      for (const effect of effects.rows) {
        const changed = await client.query(`UPDATE companies SET current_price = GREATEST(1, ROUND(current_price * (100 + $2) / 100.0)::bigint) WHERE id = $1 RETURNING current_price`, [effect.company_id, effect.change_rate])
        await client.query(`INSERT INTO stock_price_changes (game_event_id, game_id, round_number, event_id, company_id, previous_price, new_price, change_rate)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (game_event_id, company_id) DO NOTHING`, [event.game_event_id, gameId, event.round_number, event.event_id, effect.company_id, effect.current_price, changed.rows[0].current_price, effect.change_rate])
      }
      event.applied_at = (await client.query('UPDATE game_events SET applied_at = NOW() WHERE id = $1 RETURNING applied_at', [event.game_event_id])).rows[0].applied_at
    }
    if (event.trigger_phase === 'INTRADAY') await recordIntradayEventSnapshot(client, event, gameId)
    const changes = await client.query(`SELECT spc.*, c.name AS company_name FROM stock_price_changes spc JOIN companies c ON c.id = spc.company_id WHERE spc.game_event_id = $1 ORDER BY spc.company_id`, [event.game_event_id])
    return { ...scheduleJson(event), applied: true, appliedAt: date(event.applied_at), changes: changes.rows.map(changeJson) }
  })
}

export async function applyRoundEvent(database, round, gameId = ACTIVE_GAME_ID) {
  if (!Number.isInteger(round) || round < 1) throw new EventError(400, 'INVALID_ROUND')
  const selected = await database.query('SELECT id FROM game_events WHERE game_id = $1 AND round_number = $2 ORDER BY display_order LIMIT 1', [gameId, round])
  if (!selected.rows[0]) throw new EventError(409, 'EVENT_NOT_ASSIGNED', { round })
  return applyScheduledEvent(database, selected.rows[0].id, gameId)
}

async function setRoundTimes(database, game, gameId = ACTIVE_GAME_ID) {
  const startedAt = new Date(game.roundStartedAt)
  if (Number.isNaN(startedAt.getTime())) return
  await database.query(`UPDATE game_events SET scheduled_at = $3::timestamptz + CASE WHEN trigger_phase = 'INTRADAY' THEN trigger_offset_ms * interval '1 millisecond' ELSE $4 * interval '1 millisecond' END
    WHERE game_id = $1 AND round_number = $2 AND applied_at IS NULL`, [gameId, game.currentRound, startedAt, game.tradingDurationSeconds * 1000])
}

export function createEventCoordinator(database, io, { marketGate = null, getGameSnapshot = null, onPricesChanged = async () => {}, haltDurationMs = DEFAULT_HALT_MS, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) } = {}) {
  const timers = new Set()
  let processing = Promise.resolve()
  const cancelTimers = () => { for (const timer of timers) clearTimer(timer); timers.clear() }
  const emitResult = async (event, intraday) => {
    io.emit(intraday ? 'market:event:breaking' : 'event:result', event)
    if (intraday) io.emit('event:result', event)
    io.emit('stock:update', { round: event.round, gameEventId: event.gameEventId, changes: event.changes })
    await onPricesChanged()
  }
  const applyIntraday = async (item) => {
    const haltedAt = now()
    const drained = marketGate?.halt()
    io.emit('trading:halt', { round: item.round, gameEventId: item.gameEventId, haltedAt: new Date(haltedAt).toISOString() })
    try {
      await drained
      const event = await applyScheduledEvent(database, item.gameEventId)
      await emitResult(event, true)
      const remaining = haltDurationMs - (now() - haltedAt)
      if (remaining > 0) await wait(remaining)
    } finally {
      marketGate?.resume()
      if (!getGameSnapshot || getGameSnapshot().tradingEnabled) io.emit('trading:resume', { round: item.round, gameEventId: item.gameEventId, serverTime: new Date(now()).toISOString() })
    }
  }
  const queue = (work) => {
    processing = processing.catch(() => {}).then(work)
    processing.catch(() => {})
    return processing
  }
  const scheduleRound = async (game) => {
    cancelTimers()
    if (game.status !== 'RUNNING' || game.phase !== 'TRADING') return
    await setRoundTimes(database, game)
    const items = (await getGameSchedule(database)).filter((item) => item.round === game.currentRound && item.triggerPhase === 'INTRADAY' && !item.appliedAt)
    for (const item of items) {
      const eventAt = new Date(item.scheduledAt).getTime()
      const warningAt = eventAt - item.preannounceSeconds * 1000
      if (!item.warningSentAt && warningAt > now()) {
        const warningTimer = setTimer(() => { timers.delete(warningTimer); queue(async () => {
          const warned = await database.query('UPDATE game_events SET warning_sent_at = NOW() WHERE id = $1 AND warning_sent_at IS NULL AND applied_at IS NULL RETURNING id', [item.gameEventId])
          if (warned.rowCount) io.emit('market:event:warning', { round: item.round, gameEventId: item.gameEventId, scheduledAt: item.scheduledAt })
        }) }, warningAt - now())
        warningTimer?.unref?.(); timers.add(warningTimer)
      } else if (!item.warningSentAt && warningAt <= now() && eventAt > now()) {
        await database.query('UPDATE game_events SET warning_sent_at = NOW() WHERE id = $1 AND warning_sent_at IS NULL', [item.gameEventId])
        io.emit('market:event:warning', { round: item.round, gameEventId: item.gameEventId, scheduledAt: item.scheduledAt })
      }
      const eventTimer = setTimer(() => { timers.delete(eventTimer); queue(() => applyIntraday(item)) }, Math.max(0, eventAt - now()))
      eventTimer?.unref?.(); timers.add(eventTimer)
    }
  }
  const applyClosing = async (round) => {
    const items = (await getGameSchedule(database)).filter((item) => item.round === round && (item.triggerPhase === 'CLOSE' || !item.appliedAt)).sort((a, b) => a.displayOrder - b.displayOrder)
    for (const item of items) await emitResult(await applyScheduledEvent(database, item.gameEventId), item.triggerPhase === 'INTRADAY')
  }
  return {
    async prepareGameStart(game) { if (database) await assignEvents(database, game.totalRounds) },
    async handleGameEvent({ name, payload }) {
      if (!database) return
      if (name === 'game:pause') cancelTimers()
      if (name === 'round:start' || name === 'game:resume') {
        for (const event of await getRoundEvents(database, payload.currentRound)) io.emit('news:publish', event)
        await scheduleRound(payload)
      }
      if (name === 'trading:close') { cancelTimers(); await processing; await applyClosing(payload.currentRound) }
    },
    async reconcile(game) {
      if (!database || game.status === 'WAITING') return
      await assignEvents(database, game.totalRounds)
      const schedule = await getGameSchedule(database)
      const lastComplete = game.status === 'FINISHED' || game.phase === 'RESULT' ? game.currentRound : game.currentRound - 1
      for (const item of schedule.filter((event) => event.round <= lastComplete && !event.appliedAt)) await emitResult(await applyScheduledEvent(database, item.gameEventId), false)
      if (game.status === 'RUNNING' && game.phase === 'TRADING') {
        await setRoundTimes(database, game)
        const refreshed = await getGameSchedule(database)
        for (const item of refreshed.filter((event) => event.round === game.currentRound && event.triggerPhase === 'INTRADAY' && !event.appliedAt && new Date(event.scheduledAt).getTime() <= now())) await applyIntraday(item)
        await scheduleRound(game)
      }
    },
    waitForIdle: () => processing,
  }
}
