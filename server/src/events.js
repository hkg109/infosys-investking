import { randomUUID } from 'node:crypto'
import { ACTIVE_GAME_ID } from './game-store.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class EventError extends Error {
  constructor(status, code, details = {}) {
    super(code)
    this.name = 'EventError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function number(value) {
  return value === null || value === undefined ? null : Number(value)
}

function eventJson(row, effects = []) {
  return {
    eventId: row.id,
    title: row.title,
    news: row.news,
    result: row.result,
    effects,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function changeJson(row) {
  return {
    companyId: row.company_id,
    name: row.company_name,
    changeRate: number(row.change_rate),
    previousPrice: number(row.previous_price),
    newPrice: number(row.new_price),
  }
}

export function validateEventId(value) {
  if (!uuidPattern.test(value || '')) throw new EventError(400, 'INVALID_EVENT_ID')
  return value.toLowerCase()
}

export function validateEventInput(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const news = typeof body?.news === 'string' ? body.news.trim() : ''
  const result = typeof body?.result === 'string' ? body.result.trim() : ''
  if (!title || title.length > 100 || !news || news.length > 2_000 || !result || result.length > 2_000 ||
      !Array.isArray(body?.effects) || body.effects.length < 1 || body.effects.length > 50) {
    throw new EventError(400, 'INVALID_EVENT')
  }

  const seen = new Set()
  const effects = body.effects.map((effect) => {
    const companyId = typeof effect?.companyId === 'string' ? effect.companyId.trim().toUpperCase() : ''
    const changeRate = effect?.changeRate
    if (!companyId || companyId.length > 20 || !Number.isSafeInteger(changeRate) || changeRate < -99 || changeRate > 1_000 || seen.has(companyId)) {
      throw new EventError(400, 'INVALID_EVENT_EFFECT')
    }
    seen.add(companyId)
    return { companyId, changeRate }
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
  } finally {
    client.release()
  }
}

async function ensureCompanies(client, effects) {
  const companyIds = effects.map(({ companyId }) => companyId)
  const result = await client.query('SELECT id, is_active FROM companies WHERE id = ANY($1::varchar[])', [companyIds])
  const existing = new Set(result.rows.map(({ id }) => id))
  const missing = companyIds.filter((id) => !existing.has(id))
  if (missing.length) throw new EventError(400, 'COMPANY_NOT_FOUND', { companyIds: missing })
  const inactive = result.rows.filter(({ is_active: isActive }) => !isActive).map(({ id }) => id).sort()
  if (inactive.length) throw new EventError(409, 'COMPANY_INACTIVE', { companyIds: inactive })
}

async function replaceEffects(client, eventId, effects) {
  await ensureCompanies(client, effects)
  await client.query('DELETE FROM event_effects WHERE event_id = $1', [eventId])
  for (const effect of effects) {
    await client.query(`INSERT INTO event_effects (event_id, company_id, change_rate)
      VALUES ($1, $2, $3)`, [eventId, effect.companyId, effect.changeRate])
  }
}

export async function listEvents(database) {
  const result = await database.query(`SELECT e.*, COALESCE(
      json_agg(json_build_object('companyId', ee.company_id, 'changeRate', ee.change_rate)
        ORDER BY ee.company_id) FILTER (WHERE ee.company_id IS NOT NULL), '[]'
    ) AS effects
    FROM events e LEFT JOIN event_effects ee ON ee.event_id = e.id
    GROUP BY e.id ORDER BY e.created_at, e.id`)
  return result.rows.map((row) => eventJson(row, row.effects))
}

export async function createEvent(database, input) {
  const event = validateEventInput(input)
  return withTransaction(database, async (client) => {
    const id = randomUUID()
    await client.query(`INSERT INTO events (id, title, news, result) VALUES ($1, $2, $3, $4)`,
      [id, event.title, event.news, event.result])
    await replaceEffects(client, id, event.effects)
    const row = (await client.query('SELECT * FROM events WHERE id = $1', [id])).rows[0]
    return eventJson(row, event.effects)
  })
}

export async function updateEvent(database, eventId, input) {
  const id = validateEventId(eventId)
  const event = validateEventInput(input)
  return withTransaction(database, async (client) => {
    const updated = await client.query(`UPDATE events SET title = $2, news = $3, result = $4, updated_at = NOW()
      WHERE id = $1 RETURNING *`, [id, event.title, event.news, event.result])
    if (!updated.rows[0]) throw new EventError(404, 'EVENT_NOT_FOUND')
    await replaceEffects(client, id, event.effects)
    return eventJson(updated.rows[0], event.effects)
  })
}

export async function deleteEvent(database, eventId) {
  const id = validateEventId(eventId)
  try {
    const deleted = await database.query('DELETE FROM events WHERE id = $1 RETURNING id', [id])
    if (!deleted.rows[0]) throw new EventError(404, 'EVENT_NOT_FOUND')
  } catch (error) {
    if (error.code === '23503') throw new EventError(409, 'EVENT_IN_USE')
    throw error
  }
}

export async function assignEvents(database, totalRounds, gameId = ACTIVE_GAME_ID) {
  if (!Number.isInteger(totalRounds) || totalRounds < 1) throw new TypeError('totalRounds must be a positive integer')
  return withTransaction(database, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`event-schedule:${gameId}`])
    const existing = await client.query(`SELECT round_number FROM game_events WHERE game_id = $1 ORDER BY round_number`, [gameId])
    if (existing.rowCount === totalRounds && existing.rows.every((row, index) => row.round_number === index + 1)) {
      return getGameSchedule(client, gameId)
    }
    if (existing.rowCount) await client.query('DELETE FROM game_events WHERE game_id = $1', [gameId])

    const candidates = await client.query(`SELECT e.id FROM events e
      WHERE NOT EXISTS (
        SELECT 1 FROM event_effects ee JOIN companies c ON c.id = ee.company_id
        WHERE ee.event_id = e.id AND c.is_active = FALSE
      )
      ORDER BY random() LIMIT $1`, [totalRounds])
    if (candidates.rowCount < totalRounds) {
      throw new EventError(409, 'EVENT_POOL_TOO_SMALL', { required: totalRounds, available: candidates.rowCount })
    }
    for (let index = 0; index < candidates.rows.length; index += 1) {
      await client.query(`INSERT INTO game_events (game_id, event_id, round_number) VALUES ($1, $2, $3)`,
        [gameId, candidates.rows[index].id, index + 1])
    }
    return getGameSchedule(client, gameId)
  })
}

export async function getGameSchedule(database, gameId = ACTIVE_GAME_ID) {
  const result = await database.query(`SELECT ge.round_number, ge.applied_at, e.id, e.title, e.news, e.result
    FROM game_events ge JOIN events e ON e.id = ge.event_id
    WHERE ge.game_id = $1 ORDER BY ge.round_number`, [gameId])
  return result.rows.map((row) => ({
    round: row.round_number,
    eventId: row.id,
    title: row.title,
    news: row.news,
    result: row.result,
    appliedAt: row.applied_at,
  }))
}

export async function getRoundEvent(database, round, gameId = ACTIVE_GAME_ID) {
  if (!Number.isInteger(round) || round < 1) return null
  const eventResult = await database.query(`SELECT ge.round_number, ge.applied_at, e.id, e.title, e.news, e.result
    FROM game_events ge JOIN events e ON e.id = ge.event_id
    WHERE ge.game_id = $1 AND ge.round_number = $2`, [gameId, round])
  const row = eventResult.rows[0]
  if (!row) return null
  const event = {
    round: row.round_number,
    eventId: row.id,
    title: row.title,
    news: row.news,
    applied: Boolean(row.applied_at),
    appliedAt: row.applied_at,
  }
  if (!event.applied) return event
  const changes = await database.query(`SELECT spc.*, c.name AS company_name
    FROM stock_price_changes spc JOIN companies c ON c.id = spc.company_id
    WHERE spc.game_id = $1 AND spc.round_number = $2 ORDER BY spc.company_id`, [gameId, round])
  return { ...event, result: row.result, changes: changes.rows.map(changeJson) }
}

export async function applyRoundEvent(database, round, gameId = ACTIVE_GAME_ID) {
  if (!Number.isInteger(round) || round < 1) throw new EventError(400, 'INVALID_ROUND')
  return withTransaction(database, async (client) => {
    const eventResult = await client.query(`SELECT ge.event_id, ge.applied_at, e.title, e.news, e.result
      FROM game_events ge JOIN events e ON e.id = ge.event_id
      WHERE ge.game_id = $1 AND ge.round_number = $2 FOR UPDATE OF ge`, [gameId, round])
    const event = eventResult.rows[0]
    if (!event) throw new EventError(409, 'EVENT_NOT_ASSIGNED', { round })

    if (!event.applied_at) {
      const effects = await client.query(`SELECT ee.company_id, ee.change_rate, c.current_price
        FROM event_effects ee JOIN companies c ON c.id = ee.company_id
        WHERE ee.event_id = $1 AND c.is_active = TRUE
        ORDER BY ee.company_id FOR UPDATE OF c`, [event.event_id])
      for (const effect of effects.rows) {
        const changed = await client.query(`UPDATE companies
          SET current_price = GREATEST(1, ROUND(current_price * (100 + $2) / 100.0)::bigint)
          WHERE id = $1 RETURNING current_price`, [effect.company_id, effect.change_rate])
        await client.query(`INSERT INTO stock_price_changes
          (game_id, round_number, event_id, company_id, previous_price, new_price, change_rate)
          VALUES ($1, $2, $3, $4, $5, $6, $7)`, [gameId, round, event.event_id, effect.company_id,
          effect.current_price, changed.rows[0].current_price, effect.change_rate])
      }
      await client.query(`UPDATE game_events SET applied_at = NOW() WHERE game_id = $1 AND round_number = $2`, [gameId, round])
    }

    const changes = await client.query(`SELECT spc.*, c.name AS company_name
      FROM stock_price_changes spc JOIN companies c ON c.id = spc.company_id
      WHERE spc.game_id = $1 AND spc.round_number = $2 ORDER BY spc.company_id`, [gameId, round])
    const appliedAt = await client.query(`SELECT applied_at FROM game_events WHERE game_id = $1 AND round_number = $2`, [gameId, round])
    return {
      round,
      eventId: event.event_id,
      title: event.title,
      news: event.news,
      result: event.result,
      applied: true,
      appliedAt: appliedAt.rows[0].applied_at,
      changes: changes.rows.map(changeJson),
    }
  })
}

export function createEventCoordinator(database, io) {
  return {
    async prepareGameStart(game) {
      if (!database) return
      await assignEvents(database, game.totalRounds)
    },

    async handleGameEvent({ name, payload }) {
      if (!database) return
      if (name === 'round:start') {
        const event = await getRoundEvent(database, payload.currentRound)
        if (event) io.emit('news:publish', event)
      }
      if (name === 'trading:close') {
        const event = await applyRoundEvent(database, payload.currentRound)
        io.emit('event:result', event)
        io.emit('stock:update', { round: event.round, changes: event.changes })
      }
    },

    async reconcile(game) {
      if (!database || game.status === 'WAITING') return
      await assignEvents(database, game.totalRounds)
      const lastRound = game.status === 'FINISHED' || game.phase === 'RESULT'
        ? game.currentRound
        : game.currentRound - 1
      for (let round = 1; round <= lastRound; round += 1) await applyRoundEvent(database, round)
    },
  }
}
