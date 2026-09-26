import { ACTIVE_GAME_ID } from './game-store.js'

export class AssetAdjustmentError extends Error {
  constructor(status, code, details = {}) { super(code); this.status = status; this.code = code; this.details = details }
}
const fail = (status, code, details) => { throw new AssetAdjustmentError(status, code, details) }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function adjustmentInput(userId, body) {
  if (!uuid.test(userId || '') || !uuid.test(body?.requestId || '')) fail(400, 'INVALID_INPUT')
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const cash = body.cash, expectedCash = body.expectedCash
  const stock = body.companyId !== undefined
  if (!reason || reason.length > 300 || !Number.isSafeInteger(cash) || cash < 0 || cash > 1_000_000_000_000 ||
      !Number.isSafeInteger(expectedCash) || expectedCash < 0 || (stock && (
        typeof body.companyId !== 'string' || !/^[A-Z0-9_-]{1,20}$/.test(body.companyId) ||
        !Number.isSafeInteger(body.quantity) || body.quantity < 0 || body.quantity > 1_000_000 ||
        !Number.isSafeInteger(body.expectedQuantity) || body.expectedQuantity < 0))) fail(400, 'INVALID_INPUT')
  if (!stock && (body.quantity !== undefined || body.expectedQuantity !== undefined)) fail(400, 'INVALID_INPUT')
  return { userId: userId.toLowerCase(), requestId: body.requestId.toLowerCase(), reason, cash, expectedCash,
    ...(stock ? { companyId: body.companyId, quantity: body.quantity, expectedQuantity: body.expectedQuantity } : {}) }
}

export async function adjustAssets(database, engine, userId, body, initialCash = 1_000_000) {
  const input = adjustmentInput(userId, body)
  const client = await database.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))', [`game-reset:${ACTIVE_GAME_ID}`])
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`asset-request:${input.requestId}`])
    const previous = (await client.query('SELECT input, result FROM asset_adjustments WHERE request_id=$1', [input.requestId])).rows[0]
    if (previous) {
      if (Object.keys(input).length !== Object.keys(previous.input).length || Object.keys(input).some(key => input[key] !== previous.input[key])) fail(409, 'ADJUSTMENT_ID_CONFLICT')
      await client.query('COMMIT')
      return { ...previous.result, duplicate: true }
    }
    const game = (await client.query('SELECT status FROM games WHERE id=$1 FOR SHARE', [ACTIVE_GAME_ID])).rows[0]
    const allowed = () => game && ['WAITING', 'PAUSED'].includes(game.status) && engine?.getSnapshot().status === game.status
    if (!allowed()) fail(409, 'ASSET_ADJUSTMENT_CLOSED')
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`order-user:${input.userId}`])
    if (!(await client.query("SELECT id FROM users WHERE id=$1 AND role='USER' FOR KEY SHARE", [input.userId])).rowCount) fail(404, 'PARTICIPANT_NOT_FOUND')
    await client.query('INSERT INTO wallets (game_id,user_id,cash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [ACTIVE_GAME_ID,input.userId,initialCash])
    const cash = Number((await client.query('SELECT cash FROM wallets WHERE game_id=$1 AND user_id=$2 FOR UPDATE', [ACTIVE_GAME_ID,input.userId])).rows[0].cash)
    let quantity = null
    if (input.companyId) {
      const company = (await client.query('SELECT id,is_active FROM companies WHERE id=$1 FOR SHARE', [input.companyId])).rows[0]
      if (!company) fail(404, 'COMPANY_NOT_FOUND')
      quantity = Number((await client.query('SELECT quantity FROM portfolios WHERE game_id=$1 AND user_id=$2 AND company_id=$3 FOR UPDATE', [ACTIVE_GAME_ID,input.userId,input.companyId])).rows[0]?.quantity || 0)
      if (!company.is_active && input.quantity > quantity) fail(409, 'COMPANY_INACTIVE')
    }
    if (cash !== input.expectedCash || (input.companyId && quantity !== input.expectedQuantity)) {
      fail(409, 'ASSET_CONFLICT', { current: { cash, quantity } })
    }
    if (cash === input.cash && (!input.companyId || quantity === input.quantity)) fail(400, 'NO_ASSET_CHANGE')
    await client.query('UPDATE wallets SET cash=$3,updated_at=NOW() WHERE game_id=$1 AND user_id=$2', [ACTIVE_GAME_ID,input.userId,input.cash])
    if (input.companyId) await client.query(`INSERT INTO portfolios (game_id,user_id,company_id,quantity) VALUES ($1,$2,$3,$4)
      ON CONFLICT (game_id,user_id,company_id) DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=NOW()`, [ACTIVE_GAME_ID,input.userId,input.companyId,input.quantity])
    const value = (await client.query('SELECT COALESCE(SUM(p.quantity::numeric*c.current_price),0) AS value FROM portfolios p JOIN companies c ON c.id=p.company_id WHERE p.game_id=$1 AND p.user_id=$2', [ACTIVE_GAME_ID,input.userId])).rows[0].value
    if (BigInt(value) + BigInt(input.cash) > BigInt(Number.MAX_SAFE_INTEGER)) fail(400, 'ASSET_LIMIT_EXCEEDED')
    const result = { requestId: input.requestId, userId: input.userId, companyId: input.companyId || null, reason: input.reason,
      before: { cash, quantity }, after: { cash: input.cash, quantity: input.companyId ? input.quantity : null }, duplicate: false }
    await client.query('INSERT INTO asset_adjustments (request_id,game_id,user_id,input,result) VALUES ($1,$2,$3,$4,$5)', [input.requestId,ACTIVE_GAME_ID,input.userId,input,result])
    if (!allowed()) fail(409, 'ASSET_ADJUSTMENT_CLOSED')
    await client.query('COMMIT')
    return result
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { client.release() }
}
