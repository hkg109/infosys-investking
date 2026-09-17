const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
const positive = value => Number.isSafeInteger(value) && value > 0
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
export function companyInput(form, editing = false) {
  const companyId = form.companyId.trim().toUpperCase()
  const name = form.name.trim().normalize('NFC')
  const description = form.description.trim().normalize('NFC')
  const priceText = String(form.initialPrice).trim()
  const initialPrice = Number(priceText)
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(companyId)) throw new Error('INVALID_CODE')
  if (!name || [...name].length > 60 || /[\p{Cc}\p{Cf}]/u.test(name)) throw new Error('INVALID_NAME')
  if (description.length > 2000 || /[\p{Cc}\p{Cf}]/u.test(description)) throw new Error('INVALID_DESCRIPTION')
  if (!/^\d+$/.test(priceText) || !positive(initialPrice)) throw new Error('INVALID_PRICE')
  if (typeof form.isActive !== 'boolean') throw new Error('INVALID_COMPANY')
  return { ...(!editing ? { companyId } : {}), name, description, initialPrice, isActive: form.isActive }
}
export function validateCompany(company) {
  if (!company || typeof company.companyId !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(company.companyId) || typeof company.name !== 'string' || typeof company.description !== 'string' || !positive(company.initialPrice) || !positive(company.currentPrice) || typeof company.isActive !== 'boolean' || !company.references || !['transactions', 'holdings', 'eventEffects'].every(key => nonnegative(company.references[key]))) throw new Error('INVALID_RESPONSE')
  return company
}
export function validateCompanies(data) {
  if (!Array.isArray(data?.companies)) throw new Error('INVALID_RESPONSE')
  data.companies.forEach(validateCompany)
  if (new Set(data.companies.map(c => c.companyId)).size !== data.companies.length) throw new Error('INVALID_RESPONSE')
  return data.companies
}
export async function companyRequest(path = '', { password, method = 'GET', body, signal } = {}) {
  const write = method !== 'GET'
  try {
    const response = await fetch(`${base}/api/companies/admin${path}`, {
      method, credentials: 'include', cache: 'no-store', signal: signal || AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${password}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      const error = new Error(data.error || 'REQUEST_FAILED')
      error.uncertain = write && response.status >= 500
      throw error
    }
    if (method === 'DELETE') {
      if (response.status !== 204) throw new Error('INVALID_RESPONSE')
      return null
    }
    const data = await response.json()
    return method === 'GET' ? validateCompanies(data) : validateCompany(data.company)
  } catch (error) {
    if (error.uncertain === undefined) error.uncertain = write
    throw error
  }
}
export function companyError(error) {
  return ({ INVALID_CODE: '종목 코드는 영문·숫자로 시작하는 1~20자의 영문·숫자·밑줄·하이픈만 사용할 수 있습니다.', INVALID_NAME: '이름은 1~60자이며 제어 문자를 사용할 수 없습니다.', INVALID_DESCRIPTION: '설명은 줄바꿈 없는 2,000자 이하 문장으로 입력해 주세요.', INVALID_PRICE: '초기 가격은 1~9,007,199,254,740,991 사이의 정수로 입력해 주세요.', INVALID_COMPANY: '종목 입력값을 확인해 주세요.', COMPANY_ID_TAKEN: '이미 사용 중인 종목 코드입니다. 비활성 종목도 같은 코드를 사용할 수 없습니다.', COMPANY_NOT_FOUND: '종목을 찾지 못했습니다. 목록을 다시 조회해 주세요.', COMPANY_MANAGEMENT_CLOSED: '게임이 대기 상태일 때만 종목을 변경할 수 있습니다.', COMPANY_INACTIVE: '비활성 종목은 신규 주문이나 사건에 사용할 수 없습니다.', ADMIN_AUTH_REQUIRED: '관리자 인증이 유효하지 않습니다. 관리자 잠금 후 다시 로그인해 주세요.', ADMIN_AUTH_UNAVAILABLE: '서버 관리자 비밀번호 설정을 확인해 주세요.', DATABASE_UNAVAILABLE: '종목 DB를 사용할 수 없습니다.', ORIGIN_NOT_ALLOWED: '허용되지 않은 접속 주소입니다.', GAME_RESET_IN_PROGRESS: '게임 초기화 중입니다. 잠시 후 목록을 다시 조회해 주세요.', INVALID_RESPONSE: '서버 응답을 확인하지 못했습니다.' })[error.message] || '서버에 연결하지 못했습니다. 목록을 다시 조회해 주세요.'
}
