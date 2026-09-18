import { TradingError } from './api.js'

const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
const integer = (value, minimum = Number.MIN_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum
const finite = (value) => Number.isFinite(value)
const text = (value) => typeof value === 'string' && value.length > 0

async function historyRequest(path, signal) {
  let response
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  if (signal?.aborted) cancel()
  else signal?.addEventListener('abort', cancel, { once: true })
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    response = await fetch(`${base}/api/trading${path}`, {
      credentials: 'include', cache: 'no-store', signal: controller.signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new TradingError('NETWORK_ERROR')
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new TradingError(data?.error || 'REQUEST_FAILED')
  return data
}

export function validateTradeHistory(data) {
  const summary = data?.summary
  const summaryKeys = ['tradeCount', 'buyQuantity', 'sellQuantity', 'buyAmount', 'sellAmount']
  if (!data || (data.round !== null && !integer(data.round, 1)) || !Array.isArray(data.trades) || !summary ||
      summaryKeys.some(key => !integer(summary[key], 0)) || !integer(summary.netCashFlow) || !integer(summary.realizedProfit)) {
    throw new TradingError('INVALID_RESPONSE')
  }
  const ids = new Set()
  for (const trade of data.trades) {
    if (!text(trade?.transactionId) || !text(trade.orderId) || ids.has(trade.transactionId) || !integer(trade.round, 1) ||
        !text(trade.companyId) || !text(trade.companyName) || !['BUY', 'SELL'].includes(trade.type) ||
        !integer(trade.quantity, 1) || !integer(trade.price, 1) || !integer(trade.totalPrice, 0) ||
        (trade.type === 'BUY' ? trade.realizedProfit !== null : !integer(trade.realizedProfit)) || !text(trade.createdAt) || Number.isNaN(Date.parse(trade.createdAt))) {
      throw new TradingError('INVALID_RESPONSE')
    }
    ids.add(trade.transactionId)
  }
  if (summary.tradeCount !== data.trades.length) throw new TradingError('INVALID_RESPONSE')
  return data
}

export function validatePriceHistory(data) {
  const company = data?.company
  if (!company || !text(company.companyId) || !text(company.name) || typeof company.description !== 'string' ||
      typeof company.active !== 'boolean' || !Array.isArray(data.history)) throw new TradingError('INVALID_RESPONSE')
  const rounds = new Set()
  for (const period of data.history) {
    if (!integer(period?.round, 1) || rounds.has(period.round) || !integer(period.openingPrice, 1) ||
        (period.closingPrice !== null && !integer(period.closingPrice, 1)) || !finite(period.changeRate) || !Array.isArray(period.snapshots)) {
      throw new TradingError('INVALID_RESPONSE')
    }
    rounds.add(period.round)
    for (const snapshot of period.snapshots) {
      if (!['OPEN', 'INTRADAY_EVENT', 'CLOSE'].includes(snapshot?.snapshotType) || !integer(snapshot.price, 1) ||
          !finite(snapshot.changeRate) || !text(snapshot.recordedAt) || Number.isNaN(Date.parse(snapshot.recordedAt)) ||
          (snapshot.event && (!text(snapshot.event.gameEventId) || !text(snapshot.event.eventId) || !text(snapshot.event.title) || typeof snapshot.event.result !== 'string'))) {
        throw new TradingError('INVALID_RESPONSE')
      }
    }
  }
  return data
}

export async function getTradeHistory(round = null, signal) {
  const query = round === null ? '' : `?round=${encodeURIComponent(round)}`
  return validateTradeHistory(await historyRequest(`/history${query}`, signal))
}

export async function getPriceHistory(companyId, signal) {
  if (typeof companyId !== 'string' || !companyId) throw new TradingError('INVALID_INPUT')
  return validatePriceHistory(await historyRequest(`/companies/${encodeURIComponent(companyId)}/history`, signal))
}

export function historyError(error) {
  return ({
    AUTH_REQUIRED: '로그인이 만료되었습니다. 같은 닉네임과 PIN으로 계정을 복구해 주세요.',
    INVALID_ROUND: '조회할 수 없는 월입니다.', COMPANY_NOT_FOUND: '종목 정보를 찾을 수 없습니다.',
    DATABASE_UNAVAILABLE: '거래 분석 서버가 아직 준비되지 않았습니다.', INVALID_RESPONSE: '거래 분석 응답을 확인하지 못했습니다.',
    NETWORK_ERROR: '거래 분석 서버에 연결할 수 없습니다.',
  })[error?.message] || '거래 분석 정보를 불러오지 못했습니다.'
}
