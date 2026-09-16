import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { ACTIVE_GAME_ID, saveGameState } from './game-store.js'
import { MarketHaltedError } from './market-gate.js'
import { getCompanyPriceHistory, getTradeHistory, MarketHistoryError, parseRound } from './market-history.js'
import { requireSessionUser } from './session-auth.js'

const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

class TradingError extends Error {
  constructor(status, code, details = {}) {
    super(code)
    this.status = status
    this.code = code
    this.details = details
  }
}

function number(value) {
  return value === null ? null : Number(value)
}

function transactionJson(row) {
  return {
    transactionId: row.id,
    orderId: row.order_id,
    round: number(row.round_number),
    companyId: row.company_id,
    type: row.type,
    quantity: number(row.quantity),
    price: number(row.price),
    totalPrice: number(row.total_price),
    createdAt: row.created_at,
  }
}

function validateOrder(body) {
  const orderId = typeof body?.orderId === 'string' ? body.orderId.toLowerCase() : ''
  const companyId = typeof body?.companyId === 'string' ? body.companyId.trim().toUpperCase() : ''
  const type = typeof body?.type === 'string' ? body.type.toUpperCase() : ''
  const quantity = body?.quantity
  if (!orderIdPattern.test(orderId) || !companyId || companyId.length > 20 || !['BUY', 'SELL'].includes(type) ||
      !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
    throw new TradingError(400, 'INVALID_INPUT')
  }
  return { orderId, companyId, type, quantity }
}

async function ensureWallet(client, userId, initialCash) {
  await client.query(`INSERT INTO wallets (game_id, user_id, cash) VALUES ($1, $2, $3)
    ON CONFLICT (game_id, user_id) DO NOTHING`, [ACTIVE_GAME_ID, userId, initialCash])
}

async function accountJson(client, userId) {
  const wallet = await client.query('SELECT cash FROM wallets WHERE game_id = $1 AND user_id = $2', [ACTIVE_GAME_ID, userId])
  const holdings = await client.query(`SELECT c.id, c.name, c.description, c.current_price,
      COALESCE(p.quantity, 0) AS quantity
    FROM companies c
    LEFT JOIN portfolios p ON p.game_id = $1 AND p.user_id = $2 AND p.company_id = c.id
    WHERE c.is_active OR COALESCE(p.quantity, 0) > 0
    ORDER BY c.id`, [ACTIVE_GAME_ID, userId])
  const cash = number(wallet.rows[0]?.cash)
  const stockValue = holdings.rows.reduce((sum, row) => sum + number(row.current_price) * number(row.quantity), 0)
  return {
    cash, stockValue, totalAssets: cash + stockValue,
    holdings: holdings.rows.map((row) => ({
      companyId: row.id,
      name: row.name,
      description: row.description,
      currentPrice: number(row.current_price),
      quantity: number(row.quantity),
      marketValue: number(row.current_price) * number(row.quantity),
    })),
  }
}


async function lockUser(client, userId) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`order-user:${userId}`])
}
function intentJson(row) {
  return row ? { orderId: row.order_id, companyId: row.company_id, type: row.type, quantity: number(row.quantity) } : null
}
function sameIntent(row, order, userId) {
  return row.user_id === userId && row.company_id === order.companyId && row.type === order.type && number(row.quantity) === order.quantity
}

function setCors(router, clientUrl, engine, database) {
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    request.gameAtReceipt = engine.getSnapshot()
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
}

export function createTradingRouter(database, engine, {
  clientUrl,
  initialCash = 1_000_000,
  onTradeCommitted = async () => {},
  marketGate = null,
}) {
  const router = Router()
  setCors(router, clientUrl, engine, database)

  router.get('/market', async (_request, response, next) => {
    try {
      const result = await database.query(`SELECT id, name, description, current_price, initial_price
        FROM companies WHERE is_active = TRUE ORDER BY id`)
      response.json({ companies: result.rows.map((row) => ({
        companyId: row.id,
        name: row.name,
        description: row.description,
        currentPrice: number(row.current_price),
        initialPrice: number(row.initial_price),
        changeRate: Math.round((number(row.current_price) / number(row.initial_price) - 1) * 10000) / 100,
      })) })
    } catch (error) {
      next(error)
    }
  })

  const requireUser = requireSessionUser(database)

  const admitMarketOrder = (request, response, next) => {
    try {
      const release = marketGate?.admit() || (() => {})
      let released = false
      request.marketOrderStarted = false
      request.releaseMarketAdmission = () => {
        if (released) return
        released = true
        release()
      }
      response.once('finish', request.releaseMarketAdmission)
      response.once('close', () => {
        if (!request.marketOrderStarted) request.releaseMarketAdmission()
      })
      next()
    } catch (error) {
      if (error instanceof MarketHaltedError) return response.status(409).json({ error: error.code })
      next(error)
    }
  }

  router.get('/orders/recovery', requireUser, async (request, response, next) => {
    let client
    try {
      client = await database.connect()
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      const pending = await client.query("SELECT * FROM order_intents WHERE user_id = $1 AND status = 'PENDING'", [request.user.id])
      const history = await client.query('SELECT * FROM transactions WHERE user_id = $1 AND game_id = $2 ORDER BY created_at DESC, id DESC LIMIT 20', [request.user.id, ACTIVE_GAME_ID])
      await client.query('COMMIT')
      response.json({ pending: intentJson(pending.rows[0]), history: history.rows.map(transactionJson) })
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      next(error)
    } finally { client?.release() }
  })

  router.get('/history', requireUser, async (request, response, next) => {
    try {
      const round = parseRound(request.query.round, request.gameAtReceipt.totalRounds)
      response.json(await getTradeHistory(database, request.user.id, { round }))
    } catch (error) {
      if (error instanceof MarketHistoryError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  router.get('/companies/:companyId/history', requireUser, async (request, response, next) => {
    try {
      response.json(await getCompanyPriceHistory(database, request.params.companyId))
    } catch (error) {
      if (error instanceof MarketHistoryError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  // Preparing stores an intent only. It never reserves money or guarantees a fill price.
  router.post('/orders/prepare', requireUser, async (request, response, next) => {
    let client
    try {
      const order = validateOrder(request.body)
      client = await database.connect()
      await client.query('BEGIN')
      await lockUser(client, request.user.id)
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [order.orderId])
      const existing = (await client.query('SELECT * FROM order_intents WHERE order_id = $1', [order.orderId])).rows[0]
      if (existing) {
        if (!sameIntent(existing, order, request.user.id)) throw new TradingError(409, 'ORDER_ID_CONFLICT')
        if (existing.status === 'CANCELLED') throw new TradingError(409, 'ORDER_CANCELLED')
      } else {
        const pending = await client.query("SELECT order_id FROM order_intents WHERE user_id = $1 AND status = 'PENDING'", [request.user.id])
        if (pending.rowCount) throw new TradingError(409, 'PENDING_ORDER_EXISTS')
        const filled = (await client.query('SELECT * FROM transactions WHERE order_id = $1', [order.orderId])).rows[0]
        if (filled && !sameIntent(filled, order, request.user.id)) throw new TradingError(409, 'ORDER_ID_CONFLICT')
        const company = await client.query('SELECT id, is_active FROM companies WHERE id = $1', [order.companyId])
        if (!company.rowCount) throw new TradingError(404, 'COMPANY_NOT_FOUND')
        if (!company.rows[0].is_active) throw new TradingError(409, 'COMPANY_INACTIVE')
        await client.query('INSERT INTO order_intents (order_id,user_id,company_id,type,quantity,status) VALUES ($1,$2,$3,$4,$5,$6)',
          [order.orderId, request.user.id, order.companyId, order.type, order.quantity, filled ? 'FILLED' : 'PENDING'])
      }
      await client.query('COMMIT')
      response.json({ order })
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      if (error instanceof TradingError) return response.status(error.status).json({ error: error.code })
      if (error.code === '23505') return response.status(409).json({ error: 'ORDER_ID_CONFLICT' })
      next(error)
    } finally { client?.release() }
  })

  router.post('/orders/cancel', requireUser, async (request, response, next) => {
    let client
    try {
      const order = validateOrder(request.body)
      client = await database.connect()
      await client.query('BEGIN')
      await lockUser(client, request.user.id)
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [order.orderId])
      const existing = (await client.query('SELECT * FROM order_intents WHERE order_id = $1', [order.orderId])).rows[0]
      const filled = (await client.query('SELECT * FROM transactions WHERE order_id = $1', [order.orderId])).rows[0]
      if ((existing && !sameIntent(existing, order, request.user.id)) || (filled && !sameIntent(filled, order, request.user.id))) throw new TradingError(409, 'ORDER_ID_CONFLICT')
      if (filled) {
        await client.query('COMMIT')
        return response.json({ cancelled: false, transaction: transactionJson(filled) })
      }
      // Tombstone also blocks an in-flight prepare/execute arriving after cancellation.
      await client.query(`INSERT INTO order_intents (order_id,user_id,company_id,type,quantity,status)
        VALUES ($1,$2,$3,$4,$5,'CANCELLED') ON CONFLICT (order_id) DO UPDATE SET status = 'CANCELLED'`,
      [order.orderId, request.user.id, order.companyId, order.type, order.quantity])
      await client.query('COMMIT')
      response.json({ cancelled: true })
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      if (error instanceof TradingError) return response.status(error.status).json({ error: error.code })
      next(error)
    } finally { client?.release() }
  })

  router.get('/portfolio', requireUser, async (request, response, next) => {
    let client
    try {
      client = await database.connect()
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      await saveGameState(client, request.gameAtReceipt)
      await ensureWallet(client, request.user.id, initialCash)
      const account = await accountJson(client, request.user.id)
      await client.query('COMMIT')
      response.json({ account })
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      next(error)
    } finally {
      client?.release()
    }
  })

  router.post('/orders', admitMarketOrder, requireUser, async (request, response, next) => {
    let client
    request.marketOrderStarted = true
    try {
      const order = validateOrder(request.body)
      const game = request.gameAtReceipt

      client = await database.connect()
      await client.query('BEGIN')
      await lockUser(client, request.user.id)
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [order.orderId])

      const existing = await client.query('SELECT * FROM transactions WHERE order_id = $1', [order.orderId])
      if (existing.rows[0]) {
        const row = existing.rows[0]
        const sameOrder = row.user_id === request.user.id && row.company_id === order.companyId &&
          row.type === order.type && number(row.quantity) === order.quantity
        if (!sameOrder) throw new TradingError(409, 'ORDER_ID_CONFLICT')
        const account = await accountJson(client, request.user.id)
        await client.query('COMMIT')
        return response.json({ duplicate: true, transaction: transactionJson(row), account })
      }

      const intent = (await client.query('SELECT * FROM order_intents WHERE order_id = $1', [order.orderId])).rows[0]
      if (intent && !sameIntent(intent, order, request.user.id)) throw new TradingError(409, 'ORDER_ID_CONFLICT')
      if (intent?.status === 'CANCELLED') throw new TradingError(409, 'ORDER_CANCELLED')
      const other = await client.query("SELECT order_id FROM order_intents WHERE user_id = $1 AND status = 'PENDING' AND order_id <> $2", [request.user.id, order.orderId])
      if (other.rowCount) throw new TradingError(409, 'PENDING_ORDER_EXISTS')

      if (game.status !== 'RUNNING') throw new TradingError(409, 'GAME_NOT_RUNNING', { status: game.status })
      if (!game.tradingEnabled) throw new TradingError(409, 'TRADING_CLOSED', { phase: game.phase })

      await saveGameState(client, game)
      await ensureWallet(client, request.user.id, initialCash)
      const walletResult = await client.query(`SELECT cash FROM wallets
        WHERE game_id = $1 AND user_id = $2 FOR UPDATE`, [ACTIVE_GAME_ID, request.user.id])
      const companyResult = await client.query('SELECT id, current_price, is_active FROM companies WHERE id = $1', [order.companyId])
      const company = companyResult.rows[0]
      if (!company) throw new TradingError(404, 'COMPANY_NOT_FOUND')
      if (!company.is_active) throw new TradingError(409, 'COMPANY_INACTIVE')

      const cash = BigInt(walletResult.rows[0].cash)
      const price = BigInt(company.current_price)
      const quantity = BigInt(order.quantity)
      const totalPrice = price * quantity

      if (order.type === 'BUY') {
        if (cash < totalPrice) throw new TradingError(409, 'INSUFFICIENT_CASH', { availableCash: number(cash) })
        await client.query(`UPDATE wallets SET cash = cash - $3, updated_at = NOW()
          WHERE game_id = $1 AND user_id = $2`, [ACTIVE_GAME_ID, request.user.id, totalPrice.toString()])
        await client.query(`INSERT INTO portfolios (game_id, user_id, company_id, quantity)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (game_id, user_id, company_id) DO UPDATE
          SET quantity = portfolios.quantity + EXCLUDED.quantity, updated_at = NOW()`,
        [ACTIVE_GAME_ID, request.user.id, order.companyId, order.quantity])
      } else {
        const sold = await client.query(`UPDATE portfolios SET quantity = quantity - $4, updated_at = NOW()
          WHERE game_id = $1 AND user_id = $2 AND company_id = $3 AND quantity >= $4
          RETURNING quantity`, [ACTIVE_GAME_ID, request.user.id, order.companyId, order.quantity])
        if (!sold.rows[0]) throw new TradingError(409, 'INSUFFICIENT_SHARES')
        await client.query(`UPDATE wallets SET cash = cash + $3, updated_at = NOW()
          WHERE game_id = $1 AND user_id = $2`, [ACTIVE_GAME_ID, request.user.id, totalPrice.toString()])
      }

      const inserted = await client.query(`INSERT INTO transactions
        (id, order_id, game_id, user_id, round_number, company_id, type, quantity, price, total_price)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [
        randomUUID(), order.orderId, ACTIVE_GAME_ID, request.user.id, game.currentRound,
        order.companyId, order.type, order.quantity, price.toString(), totalPrice.toString(),
      ])
      await client.query("UPDATE order_intents SET status = 'FILLED' WHERE order_id = $1 AND user_id = $2", [order.orderId, request.user.id])
      const account = await accountJson(client, request.user.id)
      await client.query('COMMIT')
      await onTradeCommitted().catch(() => console.error('Failed to refresh rankings after trade'))
      response.status(201).json({ duplicate: false, transaction: transactionJson(inserted.rows[0]), account })
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {})
      if (error instanceof TradingError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    } finally {
      client?.release()
      request.releaseMarketAdmission()
    }
  })

  return router
}
