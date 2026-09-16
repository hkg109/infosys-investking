import { ACTIVE_GAME_ID } from './game-store.js'

const snapshotOrder = { OPEN: 0, INTRADAY_EVENT: 1, CLOSE: 2 }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class MarketHistoryError extends Error {
  constructor(status, code, details = {}) {
    super(code)
    this.name = 'MarketHistoryError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const number = (value) => value === null || value === undefined ? null : Number(value)
const rate = (opening, current) => Math.round((current / opening - 1) * 1_000_000) / 10_000

export function parseRound(value, totalRounds) {
  if (value === undefined) return null
  if (!/^\d+$/.test(String(value))) throw new MarketHistoryError(400, 'INVALID_ROUND')
  const round = Number(value)
  if (!Number.isSafeInteger(round) || round < 1 || round > totalRounds) {
    throw new MarketHistoryError(400, 'INVALID_ROUND')
  }
  return round
}

export function validateUserId(value) {
  if (!uuidPattern.test(value || '')) throw new MarketHistoryError(400, 'INVALID_USER_ID')
  return value.toLowerCase()
}

function calculateTrades(rows, selectedRound) {
  const lots = new Map()
  const trades = []
  for (const row of rows) {
    const companyLots = lots.get(row.company_id) || []
    let realizedProfit = null
    if (row.type === 'BUY') {
      companyLots.push({ quantity: number(row.quantity), price: number(row.price) })
    } else {
      let remaining = number(row.quantity)
      let cost = 0
      while (remaining > 0 && companyLots.length) {
        const lot = companyLots[0]
        const consumed = Math.min(remaining, lot.quantity)
        cost += consumed * lot.price
        remaining -= consumed
        lot.quantity -= consumed
        if (lot.quantity === 0) companyLots.shift()
      }
      realizedProfit = number(row.total_price) - cost
    }
    lots.set(row.company_id, companyLots)
    if (selectedRound !== null && number(row.round_number) !== selectedRound) continue
    trades.push({
      transactionId: row.id,
      orderId: row.order_id,
      round: number(row.round_number),
      companyId: row.company_id,
      companyName: row.company_name,
      type: row.type,
      quantity: number(row.quantity),
      price: number(row.price),
      totalPrice: number(row.total_price),
      realizedProfit,
      createdAt: row.created_at,
    })
  }
  return trades
}

export async function getTradeHistory(database, userId, { round = null, gameId = ACTIVE_GAME_ID } = {}) {
  const result = await database.query(`SELECT t.*, c.name AS company_name
    FROM transactions t JOIN companies c ON c.id = t.company_id
    WHERE t.game_id = $1 AND t.user_id = $2
    ORDER BY t.created_at, t.id`, [gameId, userId])
  const trades = calculateTrades(result.rows, round)
  const summary = trades.reduce((output, trade) => {
    output.tradeCount += 1
    if (trade.type === 'BUY') {
      output.buyQuantity += trade.quantity
      output.buyAmount += trade.totalPrice
    } else {
      output.sellQuantity += trade.quantity
      output.sellAmount += trade.totalPrice
      output.realizedProfit += trade.realizedProfit
    }
    output.netCashFlow = output.sellAmount - output.buyAmount
    return output
  }, { tradeCount: 0, buyQuantity: 0, sellQuantity: 0, buyAmount: 0, sellAmount: 0, netCashFlow: 0, realizedProfit: 0 })
  return { round, trades, summary }
}

export async function getCompanyPriceHistory(database, companyId, gameId = ACTIVE_GAME_ID) {
  const normalized = typeof companyId === 'string' ? companyId.trim().toUpperCase() : ''
  if (!normalized || normalized.length > 20) throw new MarketHistoryError(400, 'INVALID_COMPANY_ID')
  const company = (await database.query('SELECT id, name, description, is_active FROM companies WHERE id = $1', [normalized])).rows[0]
  if (!company) throw new MarketHistoryError(404, 'COMPANY_NOT_FOUND')
  const result = await database.query(`SELECT h.*, e.title AS event_title, e.result AS event_result
    FROM stock_price_history h
    LEFT JOIN events e ON e.id = h.source_event_id
    WHERE h.game_id = $1 AND h.company_id = $2
    ORDER BY h.round_number, h.recorded_at, h.id`, [gameId, normalized])
  const rounds = new Map()
  for (const row of result.rows) {
    let item = rounds.get(row.round_number)
    if (!item) {
      item = { round: number(row.round_number), openingPrice: number(row.opening_price), closingPrice: null, changeRate: 0, snapshots: [] }
      rounds.set(row.round_number, item)
    }
    const snapshot = {
      snapshotType: row.snapshot_type,
      price: number(row.price),
      changeRate: number(row.change_rate),
      recordedAt: row.recorded_at,
    }
    if (row.source_event_id) snapshot.event = {
      gameEventId: row.game_event_id,
      eventId: row.source_event_id,
      title: row.event_title,
      result: row.event_result,
    }
    item.snapshots.push(snapshot)
    if (row.snapshot_type === 'CLOSE') item.closingPrice = number(row.closing_price)
    item.changeRate = number(row.change_rate)
  }
  for (const item of rounds.values()) {
    item.snapshots.sort((a, b) => snapshotOrder[a.snapshotType] - snapshotOrder[b.snapshotType] || new Date(a.recordedAt) - new Date(b.recordedAt))
  }
  return {
    company: { companyId: company.id, name: company.name, description: company.description, active: company.is_active },
    history: [...rounds.values()],
  }
}

async function activeCompanies(client) {
  return (await client.query('SELECT id, current_price FROM companies WHERE is_active = TRUE ORDER BY id')).rows
}

async function insertBoundary(client, type, round, gameId = ACTIVE_GAME_ID) {
  const companies = await activeCompanies(client)
  for (const company of companies) {
    const opening = type === 'OPEN' ? number(company.current_price) : number((await client.query(`SELECT opening_price FROM stock_price_history
      WHERE game_id = $1 AND round_number = $2 AND company_id = $3 AND snapshot_type = 'OPEN'`, [gameId, round, company.id])).rows[0]?.opening_price || company.current_price)
    const current = number(company.current_price)
    await client.query(`INSERT INTO stock_price_history
      (game_id, round_number, company_id, snapshot_type, price, opening_price, closing_price, change_rate)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (game_id, round_number, company_id, snapshot_type)
      WHERE snapshot_type IN ('OPEN', 'CLOSE') DO NOTHING`, [
      gameId, round, company.id, type, current, opening, type === 'CLOSE' ? current : null,
      type === 'CLOSE' ? rate(opening, current) : 0,
    ])
  }
}

export const recordRoundOpen = (database, round, gameId = ACTIVE_GAME_ID) => insertBoundary(database, 'OPEN', round, gameId)
export const recordRoundClose = (database, round, gameId = ACTIVE_GAME_ID) => insertBoundary(database, 'CLOSE', round, gameId)

export async function recordIntradayEventSnapshot(client, event, gameId = ACTIVE_GAME_ID) {
  const companies = await activeCompanies(client)
  for (const company of companies) {
    const opening = number((await client.query(`SELECT opening_price FROM stock_price_history
      WHERE game_id = $1 AND round_number = $2 AND company_id = $3 AND snapshot_type = 'OPEN'`,
    [gameId, event.round_number, company.id])).rows[0]?.opening_price || company.current_price)
    const current = number(company.current_price)
    await client.query(`INSERT INTO stock_price_history
      (game_id, round_number, company_id, snapshot_type, price, opening_price, change_rate, source_event_id, game_event_id, recorded_at)
      VALUES ($1,$2,$3,'INTRADAY_EVENT',$4,$5,$6,$7,$8,COALESCE($9, NOW()))
      ON CONFLICT (game_event_id, company_id) WHERE snapshot_type = 'INTRADAY_EVENT' DO NOTHING`, [
      gameId, event.round_number, company.id, current, opening, rate(opening, current),
      event.event_id, event.game_event_id, event.applied_at || null,
    ])
  }
}

export function createMarketHistoryCoordinator(database) {
  return {
    async beforeGameEvent({ name, payload }) {
      if (database && name === 'round:start') await recordRoundOpen(database, payload.currentRound)
    },
    async afterGameEvent({ name, payload }) {
      if (database && name === 'trading:close') await recordRoundClose(database, payload.currentRound)
    },
    async reconcileBeforeEvents(game) {
      if (!database || game.status === 'WAITING' || game.currentRound < 1) return
      await recordRoundOpen(database, game.currentRound)
    },
    async reconcileAfterEvents(game) {
      if (!database || game.status === 'WAITING' || game.currentRound < 1) return
      if (game.phase === 'RESULT' || game.status === 'FINISHED') await recordRoundClose(database, game.currentRound)
    },
  }
}
