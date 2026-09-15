import { validAccount } from './model.js'
const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
export class TradingError extends Error {
  constructor(code, uncertain = false) { super(code); this.uncertain = uncertain }
}
async function request(path, order) {
  let response
  try {
    response = await fetch(`${base}/api/trading${path}`, {
      credentials: 'include', signal: AbortSignal.timeout(8000),
      ...(order ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) } : {}),
    })
  } catch { throw new TradingError('NETWORK_ERROR', Boolean(order)) }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new TradingError(data?.error || 'REQUEST_FAILED', Boolean(order) && response.status >= 500)
  return data
}
export async function getTrading() {
  const [market, portfolio] = await Promise.all([request('/market'), request('/portfolio')])
  if (!Array.isArray(market?.companies) || !market.companies.every((c) => typeof c.companyId === 'string' && typeof c.name === 'string' && Number.isSafeInteger(c.currentPrice) && c.currentPrice > 0) || !validAccount(portfolio?.account)) throw new TradingError('INVALID_RESPONSE')
  return { companies: market.companies, account: portfolio.account }
}
export async function sendOrder(order) {
  const data = await request('/orders', order)
  const tx = data?.transaction
  if (!tx || tx.orderId !== order.orderId || tx.companyId !== order.companyId || tx.type !== order.type || tx.quantity !== order.quantity || !Number.isSafeInteger(tx.price) || tx.price <= 0 || !Number.isSafeInteger(tx.totalPrice) || tx.totalPrice < 0 || !validAccount(data.account)) throw new TradingError('INVALID_RESPONSE', true)
  return data
}
export function tradingError(error) {
  return ({ AUTH_REQUIRED: '로그인이 만료되었습니다. 다시 참가하거나 계정을 복구해 주세요.', INVALID_INPUT: '주문 내용을 확인해 주세요.', GAME_NOT_RUNNING: '현재 게임 상태에서는 주문할 수 없습니다.', TRADING_CLOSED: '거래가 마감되었습니다.', COMPANY_NOT_FOUND: '해당 종목을 찾을 수 없습니다.', INSUFFICIENT_CASH: '보유 현금이 부족합니다.', INSUFFICIENT_SHARES: '보유 주식 수량이 부족합니다.', ORDER_ID_CONFLICT: '주문 번호가 다른 주문과 충돌했습니다. 운영자에게 문의해 주세요.', DATABASE_UNAVAILABLE: '거래 서버가 아직 준비되지 않았습니다.', ORIGIN_NOT_ALLOWED: '접속 주소를 확인해 주세요.', INVALID_RESPONSE: '거래 응답을 확인하지 못했습니다.' })[error.message] || '서버와 통신하지 못했습니다. 잠시 후 다시 확인해 주세요.'
}
