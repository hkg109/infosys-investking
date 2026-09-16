import { validateSnapshot } from './model.js'
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// Actual server contract: docs/GAME_STATE_API.md.
async function request(path, options = {}) {
  const response = await fetch(`${base}/api/game${path}`, {
    ...options, credentials: 'include', signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'REQUEST_FAILED')
  }
  return validateSnapshot(await response.json())
}
export const getGame = () => request('')
export const controlGame = (action, password) => request(`/admin/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${password}` } })
export const gameError = (error) => ({
  ADMIN_AUTH_REQUIRED: '관리자 비밀번호를 확인해 주세요.',
  ADMIN_AUTH_UNAVAILABLE: '관리자 인증이 아직 설정되지 않았습니다.',
  INVALID_GAME_STATE: '게임 상태가 변경되었습니다. 최신 상태를 다시 확인해 주세요.',
  ORIGIN_NOT_ALLOWED: '접속 주소를 확인해 주세요.',
  NOT_IMPLEMENTED: '게임 정보 서비스가 아직 준비되지 않았습니다.',
  AUTH_REQUIRED: '참가 정보를 확인할 수 없습니다. 다시 로그인해 주세요.',
  FORBIDDEN: '게임을 제어할 권한이 없습니다.',
  INVALID_RESPONSE: '게임 정보를 확인하지 못했습니다.',
}[error.message] || '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
