import { newOrderId } from '../trading/model.js'
const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
export function assetInput(participant, form) {
  const cashText = String(form.cash).trim(), quantityText = String(form.quantity).trim()
  const reason = form.reason.trim()
  if (!/^\d+$/.test(cashText) || !nonnegative(Number(cashText)) || Number(cashText) > 1e12 || !reason || reason.length > 300) throw new Error('INVALID_INPUT')
  if (form.companyId && (!/^\d+$/.test(quantityText) || !nonnegative(Number(quantityText)) || Number(quantityText) > 1e6)) throw new Error('INVALID_INPUT')
  const expectedQuantity = participant.holdings.find(h => h.companyId === form.companyId)?.quantity || 0
  if (Number(cashText) === participant.cash && (!form.companyId || Number(quantityText) === expectedQuantity)) throw new Error('NO_ASSET_CHANGE')
  return { requestId: newOrderId(), cash: Number(cashText), expectedCash: participant.cash, reason,
    ...(form.companyId ? { companyId: form.companyId, quantity: Number(quantityText), expectedQuantity } : {}) }
}
export function validateAdjustment(value) {
  if (!value || typeof value.requestId !== 'string' || typeof value.userId !== 'string' || typeof value.reason !== 'string' || typeof value.duplicate !== 'boolean' ||
    !(value.companyId === null || typeof value.companyId === 'string') || ![value.before, value.after].every(v => v && nonnegative(v.cash) && (value.companyId === null ? v.quantity === null : nonnegative(v.quantity)))) throw new Error('INVALID_RESPONSE')
  return value
}
export async function adjustmentRequest(userId, password, body) {
  const write = Boolean(body)
  try {
    const response = await fetch(`${base}/api/admin/participants/${encodeURIComponent(userId)}/${write ? 'assets' : 'adjustments'}`, {
      method: write ? 'POST' : 'GET', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${password}`, ...(write ? { 'Content-Type': 'application/json' } : {}) },
      ...(write ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      const error = new Error(data.error || 'REQUEST_FAILED')
      if (data.current && nonnegative(data.current.cash) && (data.current.quantity === null || nonnegative(data.current.quantity))) error.current = data.current
      error.uncertain = write && response.status >= 500
      throw error
    }
    const data = await response.json()
    if (write) {
      validateAdjustment(data)
      if (data.requestId !== body.requestId || data.userId !== userId || data.after.cash !== body.cash || data.companyId !== (body.companyId || null) || data.after.quantity !== (body.companyId ? body.quantity : null)) throw new Error('INVALID_RESPONSE')
      return data
    }
    if (!Array.isArray(data.adjustments)) throw new Error('INVALID_RESPONSE')
    data.adjustments.forEach(row => { validateAdjustment(row); if (row.userId !== userId || !Number.isFinite(Date.parse(row.createdAt))) throw new Error('INVALID_RESPONSE') })
    return data.adjustments
  } catch (error) {
    if (error.uncertain === undefined) error.uncertain = write
    throw error
  }
}
export function assetError(error) {
  return ({ INVALID_INPUT: '현금은 0~1조 원, 수량은 0~100만 주의 정수, 수정 사유는 1~300자로 입력해 주세요.', NO_ASSET_CHANGE: '변경된 금액이나 수량이 없습니다.', ASSET_CONFLICT: '다른 요청으로 자산이 변경됐습니다. 최신 값을 다시 불러와 수정해 주세요.', ASSET_ADJUSTMENT_CLOSED: '대기 또는 일시정지 중에만 수정할 수 있습니다.', ADJUSTMENT_ID_CONFLICT: '요청 번호가 다른 수정에 사용됐습니다. 최신 값을 다시 불러와 주세요.', COMPANY_INACTIVE: '비활성 종목의 보유량을 늘릴 수 없습니다.', COMPANY_NOT_FOUND: '종목이 삭제됐습니다. 최신 값을 다시 불러와 주세요.', PARTICIPANT_NOT_FOUND: '참가자가 없거나 게임이 초기화됐습니다.', ASSET_LIMIT_EXCEEDED: '총자산이 처리 가능한 범위를 초과합니다.', ADMIN_AUTH_REQUIRED: '관리자 잠금 후 다시 로그인해 주세요. 확인 중인 요청은 이 탭에 보관됩니다.', ORIGIN_NOT_ALLOWED: '허용되지 않은 접속 주소입니다.' })[error.message] || '요청 결과를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.'
}
