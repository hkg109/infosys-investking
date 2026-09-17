const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
const amount = value => Number.isFinite(value) && value >= 0
export function validateParticipants(data) {
  if (!data || !Number.isInteger(data.onlineParticipants) || !Array.isArray(data.participants)) throw new Error('INVALID_RESPONSE')
  const ids = new Set()
  for (const p of data.participants) {
    if (!p || typeof p.userId !== 'string' || !p.userId || ids.has(p.userId) || typeof p.nickname !== 'string' || typeof p.online !== 'boolean' || ![p.cash, p.stockValue, p.totalAssets].every(amount) || !Array.isArray(p.holdings) || !p.holdings.every(h => h && typeof h.companyId === 'string' && typeof h.name === 'string' && Number.isSafeInteger(h.quantity) && h.quantity > 0 && amount(h.currentPrice) && amount(h.marketValue))) throw new Error('INVALID_RESPONSE')
    ids.add(p.userId)
  }
  if (data.onlineParticipants !== data.participants.filter(p => p.online).length) throw new Error('INVALID_RESPONSE')
  return data
}
export async function getParticipants(password, signal) {
  const response = await fetch(`${base}/api/admin/participants`, { credentials: 'include', cache: 'no-store', headers: { Authorization: `Bearer ${password}` }, signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'REQUEST_FAILED')
  }
  return validateParticipants(await response.json())
}
export function participantError(error) {
  return ({ ADMIN_AUTH_REQUIRED: '관리자 인증이 유효하지 않습니다. 관리자 잠금 후 다시 로그인해 주세요.', ADMIN_AUTH_UNAVAILABLE: '서버 관리자 인증 설정을 확인해 주세요.', DATABASE_UNAVAILABLE: '참가자 DB를 사용할 수 없습니다.', INVALID_RESPONSE: '참가자 응답 형식을 확인하지 못했습니다.' })[error.message] || '참가자 현황을 갱신하지 못했습니다. 다시 확인해 주세요.'
}
