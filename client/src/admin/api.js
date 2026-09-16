const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
export async function verifyAdmin(password, signal) {
  const response = await fetch(`${base}/api/admin/auth/verify`, {
    method: 'POST', credentials: 'include', cache: 'no-store', signal,
    headers: { Authorization: `Bearer ${password}` },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'REQUEST_FAILED')
  if (body.authenticated !== true) throw new Error('INVALID_RESPONSE')
}
export function adminAuthError(error) {
  return ({ ADMIN_AUTH_REQUIRED: '관리자 비밀번호가 올바르지 않습니다.', ADMIN_AUTH_UNAVAILABLE: '서버에 관리자 비밀번호가 설정되지 않았습니다. 운영자에게 문의해 주세요.', ORIGIN_NOT_ALLOWED: '허용되지 않은 접속 주소입니다. 운영자에게 주소를 확인해 주세요.', INVALID_RESPONSE: '인증 결과를 확인하지 못했습니다. 다시 시도해 주세요.' })[error.message] || '서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
}
