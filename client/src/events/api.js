const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
export async function eventRequest(path, { password, method = 'GET', body } = {}) {
  const response = await fetch(`${base}/api/events${path}`, {
    method, credentials: 'include', signal: AbortSignal.timeout(8000),
    headers: { ...(password ? { Authorization: `Bearer ${password}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (response.status === 204) return null
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'REQUEST_FAILED')
  return data
}
export function eventError(error) {
  return ({ ADMIN_AUTH_REQUIRED: '관리자 비밀번호를 확인해 주세요.', ADMIN_AUTH_UNAVAILABLE: '서버에 관리자 인증 설정이 필요합니다.', EVENT_MANAGEMENT_CLOSED: '게임 시작 후에는 사건을 변경할 수 없습니다.', EVENT_IN_USE: '배정된 사건은 삭제할 수 없습니다.', EVENT_NOT_FOUND: '사건이 변경되거나 삭제되었습니다. 목록을 다시 확인해 주세요.', INVALID_EVENT: '제목·뉴스·결과와 기업별 변동률을 확인해 주세요.', INVALID_EVENT_EFFECT: '변동률은 -99~1000 사이의 정수이며 기업은 중복될 수 없습니다.', DATABASE_UNAVAILABLE: '사건 DB를 준비하고 있습니다.', COMPANY_NOT_FOUND: '등록된 기업을 선택해 주세요.' })[error.message] || '요청 결과를 확인하지 못했습니다. 다시 저장하기 전에 목록을 조회해 주세요.'
}
export function eventInput(form) {
  const title = form.title.trim(), news = form.news.trim(), result = form.result.trim()
  if (!title || title.length > 100 || !news || news.length > 2000 || !result || result.length > 2000) throw new Error('INVALID_EVENT')
  const seen = new Set()
  const effects = form.effects.map(item => {
    const raw = String(item.changeRate)
    const changeRate = Number(raw)
    if (!item.companyId || !/^-?\d+$/.test(raw) || !Number.isInteger(changeRate) || changeRate < -99 || changeRate > 1000 || seen.has(item.companyId)) throw new Error('INVALID_EVENT_EFFECT')
    seen.add(item.companyId)
    return { companyId: item.companyId, changeRate }
  })
  if (!effects.length) throw new Error('INVALID_EVENT_EFFECT')
  return { title, news, result, effects }
}
