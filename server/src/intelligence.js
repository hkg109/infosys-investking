import { ACTIVE_GAME_ID } from './game-store.js'

export class IntelligenceError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}
const fail = (status, code) => { throw new IntelligenceError(status, code) }
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max
function clueId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail(400, 'INVALID_CLUE_ID')
  return value.toLowerCase()
}
export function validateClue(input, totalRounds) {
  const clean = value => typeof value === 'string' ? value.trim().normalize('NFC') : ''
  const title = clean(input?.title), summary = clean(input?.summary), content = clean(input?.content)
  const price = input?.price, availableRound = input?.availableRound, isActive = input?.isActive
  if (!title || title.length > 100 || !summary || summary.length > 500 || !content || content.length > 5000 ||
      /[\p{Cc}\p{Cf}]/u.test(title + summary + content.replace(/\n/g, '')) ||
      !integer(price, 1, 1000000) || !integer(availableRound, 1, Math.min(totalRounds, 1000)) || typeof isActive !== 'boolean') fail(400, 'INVALID_CLUE')
  return { title, summary, content, price, availableRound, isActive }
}
function metadata(row) {
  const price = Number(row.price), availableRound = Number(row.available_round)
  if (!integer(price, 1, 1000000) || !integer(availableRound, 1, 1000)) fail(503, 'INTELLIGENCE_DATA_OUT_OF_RANGE')
  return { clueId: row.clue_id || row.id, title: row.title, summary: row.summary, price, availableRound }
}
const adminClue = row => ({ ...metadata(row), content: row.content, isActive: row.is_active })
async function transaction(database, work, { readOnly = false } = {}) {
  const client = await database.connect()
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN')
    // Same key as resetDatabase: purchases and administration cannot cross a reset.
    await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))', [`game-reset:${ACTIVE_GAME_ID}`])
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { client.release() }
}
async function lockedGame(client, engine, exclusive = false) {
  const result = await client.query(`SELECT status, current_round, total_rounds FROM games WHERE id=$1 FOR ${exclusive ? 'UPDATE' : 'SHARE'}`, [ACTIVE_GAME_ID])
  if (!result.rows[0]) fail(503, 'GAME_UNAVAILABLE')
  return { row: result.rows[0], live: engine.getSnapshot() }
}
function requireWaiting(game) {
  if (game.row.status !== 'WAITING' || game.live.status !== 'WAITING') fail(409, 'CLUE_MANAGEMENT_CLOSED')
}
function requireRunning(game) {
  if (game.row.status !== 'RUNNING' || game.live.status !== 'RUNNING') fail(409, 'PURCHASE_CLOSED')
}
export async function listClues(database) {
  return { clues: (await database.query('SELECT * FROM intelligence_clues ORDER BY created_at, id')).rows.map(adminClue) }
}
export async function saveClue(database, engine, id, input) {
  const selectedId = id === null ? null : clueId(id)
  return transaction(database, async client => {
    const game = await lockedGame(client, engine, true)
    requireWaiting(game)
    const clue = validateClue(input, Math.min(game.row.total_rounds, game.live.totalRounds))
    const values = [clue.title, clue.summary, clue.content, clue.price, clue.availableRound, clue.isActive]
    const result = selectedId === null
      ? await client.query(`INSERT INTO intelligence_clues(title,summary,content,price,available_round,is_active)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, values)
      : await client.query(`UPDATE intelligence_clues SET title=$1,summary=$2,content=$3,price=$4,available_round=$5,is_active=$6,updated_at=NOW()
          WHERE id=$7 RETURNING *`, [...values, selectedId])
    if (!result.rowCount) fail(404, 'CLUE_NOT_FOUND')
    requireWaiting({ ...game, live: engine.getSnapshot() })
    return { clue: adminClue(result.rows[0]) }
  })
}
export async function deactivateClue(database, engine, id) {
  const selectedId = clueId(id)
  return transaction(database, async client => {
    const game = await lockedGame(client, engine, true)
    requireWaiting(game)
    const result = await client.query('UPDATE intelligence_clues SET is_active=FALSE,updated_at=NOW() WHERE id=$1', [selectedId])
    if (!result.rowCount) fail(404, 'CLUE_NOT_FOUND')
    requireWaiting({ ...game, live: engine.getSnapshot() })
  })
}
async function readStore(client, userId, engine, initialCash = 1_000_000) {
  // All queries share one snapshot (GET) or the purchase transaction and wallet lock (POST).
  const game = (await client.query('SELECT status,current_round FROM games WHERE id=$1', [ACTIVE_GAME_ID])).rows[0]
  if (!game) fail(503, 'GAME_UNAVAILABLE')
  const wallet = (await client.query('SELECT cash FROM wallets WHERE game_id=$1 AND user_id=$2', [ACTIVE_GAME_ID, userId])).rows[0]
  const purchases = (await client.query(`SELECT * FROM intelligence_purchases WHERE game_id=$1 AND user_id=$2 ORDER BY purchased_at,clue_id`, [ACTIVE_GAME_ID, userId])).rows.map(row => ({
    ...metadata(row), content: row.content, paidCash: Number(row.paid_cash), purchasedAt: new Date(row.purchased_at).toISOString(),
  }))
  if (purchases.some(item => !integer(item.paidCash, 1, 1000000))) fail(503, 'INTELLIGENCE_DATA_OUT_OF_RANGE')
  const live = engine.getSnapshot(), round = Math.min(game.current_round, live.currentRound)
  const purchaseOpen = game.status === 'RUNNING' && live.status === 'RUNNING'
  // Query only public fields: unpurchased content is never loaded into catalog rows.
  const rows = (await client.query(`SELECT id,title,summary,price,available_round FROM intelligence_clues
    WHERE is_active AND available_round <= $1 ORDER BY available_round,created_at,id`, [round])).rows
  const owned = new Set(purchases.map(p => p.clueId))
  const cash = Number(wallet?.cash ?? initialCash)
  if (!Number.isSafeInteger(cash) || cash < 0) fail(503, 'CASH_OUT_OF_RANGE')
  return {
    cash,
    purchaseOpen,
    currentRound: Number(round),
    items: rows.map(row => ({ ...metadata(row), canPurchase: purchaseOpen && !owned.has(row.id) })),
    purchases,
  }
}
export async function getIntelligence(database, engine, userId, initialCash = 1_000_000) {
  return transaction(database, client => readStore(client, userId, engine, initialCash), { readOnly: true })
}
export async function purchaseClue(database, engine, userId, input, initialCash = 1_000_000) {
  const id = clueId(input?.clueId)
  if (!integer(input?.expectedPrice, 1, 1000000)) fail(400, 'INVALID_PRICE')
  return transaction(database, async client => {
    // Ensure a session resolved just before reset cannot recreate an obsolete user's wallet.
    if (!(await client.query('SELECT id FROM users WHERE id=$1', [userId])).rowCount) fail(401, 'AUTH_REQUIRED')
    // Use the same per-user lock as stock orders so a purchase and an order
    // cannot both spend the same cash balance concurrently.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`order-user:${userId}`])
    // Match stock-order lock ordering (user before game state) to avoid a
    // purchase/order deadlock while both operations serialize the same wallet.
    const game = await lockedGame(client, engine)
    await client.query(`INSERT INTO wallets(game_id,user_id,cash) VALUES($1,$2,$3)
      ON CONFLICT (game_id,user_id) DO NOTHING`, [ACTIVE_GAME_ID, userId, initialCash])
    const wallet = (await client.query(`SELECT cash FROM wallets WHERE game_id=$1 AND user_id=$2 FOR UPDATE`, [ACTIVE_GAME_ID, userId])).rows[0]
    // The wallet row serializes different information purchases.
    const existing = await client.query('SELECT clue_id FROM intelligence_purchases WHERE game_id=$1 AND user_id=$2 AND clue_id=$3', [ACTIVE_GAME_ID,userId,id])
    if (existing.rowCount) return readStore(client, userId, engine, initialCash)
    requireRunning({ ...game, live: engine.getSnapshot() })
    const clue = (await client.query('SELECT * FROM intelligence_clues WHERE id=$1 FOR SHARE', [id])).rows[0]
    if (!clue || !clue.is_active || clue.available_round > Math.min(game.row.current_round, engine.getSnapshot().currentRound)) fail(409, 'CLUE_UNAVAILABLE')
    if (Number(clue.price) !== input.expectedPrice) fail(409, 'PRICE_CHANGED')
    if (BigInt(wallet.cash) < BigInt(clue.price)) fail(409, 'INSUFFICIENT_CASH')
    await client.query('UPDATE wallets SET cash=cash-$3,updated_at=NOW() WHERE game_id=$1 AND user_id=$2', [ACTIVE_GAME_ID,userId,clue.price])
    await client.query(`INSERT INTO intelligence_purchases(game_id,user_id,clue_id,title,summary,content,price,available_round,paid_cash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [ACTIVE_GAME_ID,userId,id,clue.title,clue.summary,clue.content,clue.price,clue.available_round,clue.price])
    const result = await readStore(client, userId, engine, initialCash)
    // Roll back if pause/end arrived during the asynchronous database work.
    requireRunning({ ...game, live: engine.getSnapshot() })
    return result
  })
}
