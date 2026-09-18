// Proposed contract: docs/INTELLIGENCE_API_DRAFT.md. Enable after backend integration.
export const intelligenceEnabled = import.meta.env?.VITE_ENABLE_INTELLIGENCE === 'true'
const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max
export function clueInput(form) {
  const title = form.title.trim().normalize('NFC')
  const summary = form.summary.trim().normalize('NFC')
  const content = form.content.trim().normalize('NFC')
  const price = Number(form.price), availableRound = Number(form.availableRound)
  if (!text(title, 100) || !text(summary, 500) || !text(content, 5000) || /[\p{Cc}\p{Cf}]/u.test(title + summary + content.replace(/\n/g, '')) || !/^\d+$/.test(String(form.price)) || !integer(price, 1, 1000000) || !/^\d+$/.test(String(form.availableRound)) || !integer(availableRound, 1, 1000) || typeof form.isActive !== 'boolean') throw new Error('INVALID_CLUE')
  return { title, summary, content, price, availableRound, isActive: form.isActive }
}
function metadata(item) {
  if (!item || !text(item.clueId, 100) || !text(item.title, 100) || !text(item.summary, 500) || !integer(item.price, 1, 1000000) || !integer(item.availableRound, 1, 1000)) throw new Error('INVALID_RESPONSE')
  return { clueId: item.clueId, title: item.title, summary: item.summary, price: item.price, availableRound: item.availableRound }
}
function unique(items) {
  if (new Set(items.map(i => i.clueId)).size !== items.length) throw new Error('INVALID_RESPONSE')
  return items
}
export function validateStore(data) {
  if (!integer(data?.points, 0, Number.MAX_SAFE_INTEGER) || !Array.isArray(data.items) || !Array.isArray(data.purchases)) throw new Error('INVALID_RESPONSE')
  // Whitelist public fields. Unpurchased content never enters component state.
  const items = unique(data.items.map(item => {
    if (!item || typeof item.canPurchase !== 'boolean') throw new Error('INVALID_RESPONSE')
    return { ...metadata(item), canPurchase: item.canPurchase }
  }))
  const purchases = unique(data.purchases.map(item => {
    if (!item || !text(item.content, 5000) || typeof item.purchasedAt !== 'string' || !Number.isFinite(Date.parse(item.purchasedAt)) || !integer(item.paidPoints, 1, 1000000)) throw new Error('INVALID_RESPONSE')
    return { ...metadata(item), content: item.content, purchasedAt: item.purchasedAt, paidPoints: item.paidPoints }
  }))
  return { points: data.points, items, purchases }
}
export function validateClues(data) {
  if (!Array.isArray(data?.clues)) throw new Error('INVALID_RESPONSE')
  return { clues: unique(data.clues.map(item => {
    if (!item || !text(item.content, 5000) || typeof item.isActive !== 'boolean') throw new Error('INVALID_RESPONSE')
    return { ...metadata(item), content: item.content, isActive: item.isActive }
  })) }
}
export function canBuy(data, item, { status, stale, busy }) {
  return Boolean(data && item && status === 'RUNNING' && !stale && !busy && item.canPurchase && data.points >= item.price && !data.purchases.some(p => p.clueId === item.clueId))
}
export async function intelligenceRequest(path, { method = 'GET', password, body, signal } = {}) {
  const response = await fetch(`${base}/api/intelligence${path}`, {
    method, credentials: 'include', cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    headers: { ...(password ? { Authorization: `Bearer ${password}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(response.status === 401 && !password ? 'AUTH_REQUIRED' : data.error || (response.status === 404 ? 'SERVICE_UNAVAILABLE' : 'REQUEST_FAILED'))
  }
  if (method === 'DELETE') { if (response.status !== 204) throw new Error('INVALID_RESPONSE'); return null }
  const data = await response.json()
  if (path === '/me' || path === '/purchases') return validateStore(data)
  if (method === 'GET') return validateClues(data)
  return { clue: validateClues({ clues: [data.clue] }).clues[0] }
}
export function intelligenceError(error) {
  return ({ AUTH_REQUIRED: '참가 인증이 만료됐습니다. 다시 로그인해 주세요.', ADMIN_AUTH_REQUIRED: '관리자 잠금 후 다시 인증해 주세요.', SERVICE_UNAVAILABLE: '정보 상점을 현재 이용할 수 없습니다.', INVALID_RESPONSE: '정보 응답을 확인하지 못했습니다. 다시 조회해 주세요.', INVALID_CLUE: '제목 1~100자, 요약 1~500자, 본문 1~5,000자, 가격 1~1,000,000P, 공개 월 1~1,000을 확인해 주세요.', INSUFFICIENT_POINTS: '정보 포인트가 부족합니다.', CLUE_UNAVAILABLE: '지금 구매할 수 없는 정보입니다.', PRICE_CHANGED: '가격이 변경되었습니다. 목록을 다시 확인해 주세요.', PURCHASE_CLOSED: '게임 진행 중에만 구매할 수 있습니다.', CLUE_MANAGEMENT_CLOSED: '게임 대기 중에만 단서를 변경할 수 있습니다.' })[error.message] || '요청 결과를 확인하지 못했습니다. 목록을 다시 조회해 주세요.'
}
export function privateStoreFailure(previous, userId, error) {
  return { userId, data: error.message === 'AUTH_REQUIRED' || previous.userId !== userId ? null : previous.data, error: intelligenceError(error), fresh: false }
}
