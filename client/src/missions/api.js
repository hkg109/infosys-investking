const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
export const missionTypes = {
  DIVERSIFIED_HOLDINGS: ['분산 투자', '동시에 보유한 서로 다른 종목 수', '종목', '거래 직후'],
  CASH_RATIO: ['현금 비중', '총자산 중 현금 비중', '%', '거래 마감 후'],
  CONSECUTIVE_HOLDING: ['연속 보유', '같은 종목을 연속 보유한 월 수', '개월', '거래 마감 후'],
  CONTRARIAN_PROFIT: ['역발상 수익', '직전 월 하락 종목을 이익으로 매도한 체결 수', '건', '거래 직후'],
  TRADE_BOTH_SIDES: ['매수·매도 경험', '수행한 거래 방향 수 (매수·매도)', '방향', '거래 직후'],
}
const positive = value => Number.isSafeInteger(value) && value > 0
const amount = value => Number.isFinite(value) && value >= 0
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
export function missionInput(form) {
  const title = form.title.trim().normalize('NFC'), description = form.description.trim().normalize('NFC')
  const targetValue = Number(form.targetValue), rewardPoints = Number(form.rewardPoints)
  if (!title || [...title].length > 100 || !description || description.length > 2000 || /[\p{Cc}\p{Cf}]/u.test(title + description) || !Object.hasOwn(missionTypes, form.missionType) || !/^\d+$/.test(String(form.targetValue)) || !positive(targetValue) || targetValue > 1000 || !/^\d+$/.test(String(form.rewardPoints)) || !positive(rewardPoints) || rewardPoints > 1000000 || typeof form.isActive !== 'boolean') throw new Error('INVALID_MISSION')
  if ((form.missionType === 'CASH_RATIO' && targetValue > 100) || (form.missionType === 'TRADE_BOTH_SIDES' && targetValue !== 2)) throw new Error('INVALID_MISSION_TARGET')
  return {title, description, missionType:form.missionType, targetValue, rewardPoints, isActive:form.isActive}
}
function definition(m) {
  if (!m || typeof m.missionId !== 'string' || !m.missionId || typeof m.title !== 'string' || !Object.hasOwn(missionTypes,m.missionType) || !positive(m.targetValue) || m.targetValue > 1000 || !positive(m.rewardPoints) || m.rewardPoints > 1000000) throw new Error('INVALID_RESPONSE')
  if ((m.missionType === 'CASH_RATIO' && m.targetValue > 100) || (m.missionType === 'TRADE_BOTH_SIDES' && m.targetValue !== 2)) throw new Error('INVALID_RESPONSE')
}
function assignment(m) {
  definition(m)
  if (!amount(m.progress) || !['ASSIGNED','COMPLETED'].includes(m.status) || !date(m.assignedAt) || !(m.completedAt === null || date(m.completedAt)) || !(m.rewardedAt === null || date(m.rewardedAt))) throw new Error('INVALID_RESPONSE')
  if (m.status === 'COMPLETED' && (!m.completedAt || !m.rewardedAt)) throw new Error('INVALID_RESPONSE')
}
export function validateMine(data) {
  if (!data || !Number.isSafeInteger(data.points) || data.points < 0 || !(data.mission === null || typeof data.mission === 'object')) throw new Error('INVALID_RESPONSE')
  if (data.mission) {
    assignment(data.mission)
    if (typeof data.mission.description !== 'string') throw new Error('INVALID_RESPONSE')
  } else if (data.mission !== null) throw new Error('INVALID_RESPONSE')
  return data
}
export function validateAdmin(data) {
  if (!Array.isArray(data?.missions) || !Array.isArray(data?.assignments)) throw new Error('INVALID_RESPONSE')
  for (const m of data.missions) { definition(m); if (typeof m.description !== 'string' || typeof m.isActive !== 'boolean' || !Number.isSafeInteger(m.assignmentCount) || m.assignmentCount < 0) throw new Error('INVALID_RESPONSE') }
  for (const m of data.assignments) { assignment(m); if (typeof m.userId !== 'string' || typeof m.nickname !== 'string') throw new Error('INVALID_RESPONSE') }
  if (new Set(data.missions.map(m=>m.missionId)).size !== data.missions.length || new Set(data.assignments.map(m=>m.userId)).size !== data.assignments.length) throw new Error('INVALID_RESPONSE')
  return data
}
export function canManageMissions({status, stale, busy, fresh}) { return status === 'WAITING' && !stale && !busy && fresh }
export async function missionRequest(path, {password, method='GET', body, signal}={}) {
  const response=await fetch(`${base}/api/missions${path}`, {method,credentials:'include',cache:'no-store',signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),headers:{...(password?{Authorization:`Bearer ${password}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  if (!response.ok) { const data=await response.json().catch(()=>({})); throw new Error(response.status === 401 && path === '/me' ? 'AUTH_REQUIRED' : data.error || 'REQUEST_FAILED') }
  if (method === 'DELETE') { if(response.status !== 204) throw new Error('INVALID_RESPONSE'); return null }
  const data=await response.json()
  if (path === '/me') return validateMine(data)
  if(method === 'GET') return validateAdmin(data)
  validateAdmin({missions:[data.mission],assignments:[]}); return data
}
export function missionError(error) {
  return ({AUTH_REQUIRED:'참가 인증이 만료됐습니다. 다시 로그인해 주세요.', ADMIN_AUTH_REQUIRED:'관리자 잠금 후 다시 인증해 주세요.', ADMIN_AUTH_UNAVAILABLE:'서버 관리자 인증 설정이 필요합니다.', INVALID_MISSION:'제목 1~100자, 줄바꿈 없는 설명 1~2,000자, 목표 1~1,000, 보상 1~1,000,000의 정수를 입력하세요.', INVALID_MISSION_TARGET:'현금 비중 목표는 1~100%, 매수·매도 경험 목표는 2여야 합니다.', MISSION_MANAGEMENT_CLOSED:'게임 대기 중에만 미션을 변경할 수 있습니다.', MISSION_NOT_FOUND:'미션을 찾지 못했습니다. 목록을 다시 조회해 주세요.', DATABASE_UNAVAILABLE:'미션 DB에 연결할 수 없습니다.', INVALID_RESPONSE:'미션 응답을 확인하지 못했습니다.'})[error.message] || '미션 정보를 확인하지 못했습니다. 다시 조회해 주세요.'
}
export function privateFailure(previous, userId, error) {
  return {userId,data:error.message === 'AUTH_REQUIRED' || previous.userId !== userId ? null : previous.data,error:missionError(error)}
}
