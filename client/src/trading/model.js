export function quantityValue(text) {
  if (!/^[0-9]+$/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number >= 1 && number <= 1_000_000 ? number : null
}
export const MAX_ORDER_QUANTITY = 1_000_000
export function orderPreview({ company, account, type, quantity }) {
  const price = company?.currentPrice
  const cash = account?.cash
  const held = account?.holdings?.find((item) => item.companyId === company?.companyId)?.quantity ?? 0
  if (!Number.isSafeInteger(price) || price < 1 || !Number.isSafeInteger(cash) || cash < 0 || !Number.isSafeInteger(held) || held < 0) {
    return { held, maxBuyQuantity: null, maxBuyTotal: null, maxSellQuantity: null, estimatedTotal: null, estimatedHolding: null }
  }
  const maxBuyQuantity = Math.min(MAX_ORDER_QUANTITY, Math.floor(cash / price))
  const maxSellQuantity = Math.min(MAX_ORDER_QUANTITY, held)
  const validQuantity = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_ORDER_QUANTITY
  const estimatedTotal = validQuantity && Number.isSafeInteger(price * quantity) ? price * quantity : null
  const estimatedHolding = validQuantity ? held + (type === 'BUY' ? quantity : -quantity) : null
  return { held, maxBuyQuantity, maxBuyTotal: maxBuyQuantity * price, maxSellQuantity, estimatedTotal, estimatedHolding }
}
export function tradingBlock(game, stale) {
  if (stale || !game) return '최신 게임·자산 정보를 확인한 후 주문할 수 있습니다.'
  if (game.status === 'PAUSED') return '일시정지 중에는 거래할 수 없습니다.'
  if (game.status === 'FINISHED') return '종료된 게임에서는 거래할 수 없습니다.'
  if (game.status !== 'RUNNING') return '게임이 시작되면 거래할 수 있습니다.'
  if (!game.tradingEnabled || game.phase !== 'TRADING') return '거래가 마감되었습니다. 다음 거래 시간을 기다려 주세요.'
  return ''
}
export function orderError({ company, quantity, type, account }) {
  if (!company) return '종목을 선택해 주세요.'
  if (quantity === null) return '수량은 1~1,000,000 사이의 정수로 입력해 주세요.'
  const totalPrice = quantity * company.currentPrice
  if (!Number.isSafeInteger(totalPrice)) return '주문 금액이 처리 가능한 범위를 초과합니다.'
  const holding = account?.holdings?.find((item) => item.companyId === company.companyId)
  if (type === 'SELL' && quantity > (holding?.quantity ?? 0)) return '보유한 수량보다 많이 매도할 수 없습니다.'
  if (type === 'BUY' && totalPrice > account?.cash) return '주문 예상 금액보다 보유 현금이 부족합니다.'
  return ''
}
export function displayAccount(account) {
  if (!account) return undefined
  const stockValue = Number.isSafeInteger(account.stockValue) ? account.stockValue : account.holdings.reduce((sum, item) => sum + item.marketValue, 0)
  return { cash: account.cash, stockValue, totalAssets: Number.isSafeInteger(account.totalAssets) ? account.totalAssets : account.cash + stockValue }
}
export function validAccount(account) {
  return Number.isSafeInteger(account?.cash) && account.cash >= 0 && Array.isArray(account.holdings) && account.holdings.every((h) => typeof h.companyId === 'string' && typeof h.name === 'string' && Number.isSafeInteger(h.quantity) && h.quantity >= 0 && Number.isSafeInteger(h.marketValue) && h.marketValue >= 0)
}

export function newOrderId(cryptoApi = globalThis.crypto) {
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  if (!cryptoApi?.getRandomValues) throw new Error('Secure random generator unavailable')
  // getRandomValues also supports local HTTP/LAN pages where randomUUID is absent.
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
