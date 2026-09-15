import { validateSnapshot } from './model.js'
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// Proposed Phase 3 contract; see docs/PHASE3_FRONTEND.md.
async function request(path, options = {}) {
  const response = await fetch(`${base}/api/game${path}`, {
    ...options, credentials: 'include', signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error(response.status === 404 ? 'NOT_IMPLEMENTED' : response.status === 401 ? 'AUTH_REQUIRED' : response.status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED')
  return validateSnapshot(await response.json())
}
export const getGame = () => request('/state')
export const controlGame = (action) => request(`/${action}`, { method: 'POST' })
export const gameError = (error) => ({
  NOT_IMPLEMENTED: '게임 정보 서비스가 아직 준비되지 않았습니다.',
  AUTH_REQUIRED: '참가 정보를 확인할 수 없습니다. 다시 로그인해 주세요.',
  FORBIDDEN: '게임을 제어할 권한이 없습니다.',
  INVALID_RESPONSE: '게임 정보를 확인하지 못했습니다.',
}[error.message] || '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
