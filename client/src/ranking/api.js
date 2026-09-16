const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
const amount = value => Number.isFinite(value) && value >= 0
const entry = value => value && typeof value.nickname === 'string' && Number.isInteger(value.rank) && value.rank > 0 && amount(value.totalAssets)
export function validateRanking(data) {
  const r = data?.ranking
  if (!['WAITING', 'RUNNING', 'PAUSED', 'FINISHED'].includes(data?.gameStatus) || !r || typeof r.final !== 'boolean' || !Number.isFinite(Date.parse(r.calculatedAt)) || !Number.isInteger(r.totalParticipants) || r.totalParticipants < 0 || !Array.isArray(r.top3) || !r.top3.every(item => entry(item) && item.rank <= 3) || !(r.me === null || (entry(r.me) && amount(r.me.cash) && amount(r.me.stockValue)))) throw new Error('INVALID_RESPONSE')
  return data
}
export async function getRanking(signal) {
  const response = await fetch(`${base}/api/rankings`, { credentials: 'include', cache: 'no-store', signal })
  if (!response.ok) throw new Error(response.status === 401 ? 'SESSION_REQUIRED' : 'REQUEST_FAILED')
  return validateRanking(await response.json())
}
