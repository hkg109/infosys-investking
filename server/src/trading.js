import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { ACTIVE_GAME_ID, saveGameState } from './game-store.js'
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
    ORDER BY c.id`, [ACTIVE_GAME_ID, userId])
  return {
    cash: number(wallet.rows[0]?.cash),
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
}) {
  const router = Router()
  setCors(router, clientUrl, engine, database)

  router.get('/market', async (_request, response, next) => {
    try {
      const result = await database.query(`SELECT id, name, description, current_price
        FROM companies ORDER BY id`)
      response.json({ companies: result.rows.map((row) => ({
        companyId: row.id,
        name: row.name,
        description: row.description,
        currentPrice: number(row.current_price),
      })) })
    } catch (error) {
      next(error)
    }
  })

  const requireUser = requireSessionUser(database)

  router.get('/portfolio', requireUser, async (request, response, next) => {
    let client
    try {
      client = await database.connect()
      await client.query('BEGIN')
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

  router.post('/orders', requireUser, async (request, response, next) => {
    let client
    try {
      const order = validateOrder(request.body)
      const game = request.gameAtReceipt

      client = await database.connect()
      await client.query('BEGIN')
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

      if (game.status !== 'RUNNING') throw new TradingError(409, 'GAME_NOT_RUNNING', { status: game.status })
      if (!game.tradingEnabled) throw new TradingError(409, 'TRADING_CLOSED', { phase: game.phase })

      await saveGameState(client, game)
      await ensureWallet(client, request.user.id, initialCash)
      const walletResult = await client.query(`SELECT cash FROM wallets
        WHERE game_id = $1 AND user_id = $2 FOR UPDATE`, [ACTIVE_GAME_ID, request.user.id])
      const companyResult = await client.query('SELECT id, current_price FROM companies WHERE id = $1', [order.companyId])
      const company = companyResult.rows[0]
      if (!company) throw new TradingError(404, 'COMPANY_NOT_FOUND')

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
        (id, order_id, game_id, user_id, company_id, type, quantity, price, total_price)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [
        randomUUID(), order.orderId, ACTIVE_GAME_ID, request.user.id, order.companyId,
        order.type, order.quantity, price.toString(), totalPrice.toString(),
      ])
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
    }
  })

  return router
}
