import { validateBroadcast } from './model.js'

const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')

export async function getBroadcast(signal) {
  let response
  try {
    response = await fetch(`${base}/api/broadcast`, { cache: 'no-store', credentials: 'omit', signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('NETWORK_ERROR')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'REQUEST_FAILED')
  }
  return validateBroadcast(await response.json().catch(() => null))
}

export function broadcastError(error) {
  return ({ DATABASE_UNAVAILABLE: '중계 서버의 데이터베이스가 준비되지 않았습니다.', SERVICE_UNAVAILABLE: '중계 서버가 일시적으로 응답하지 않습니다.',
    ORIGIN_NOT_ALLOWED: '허용되지 않은 접속 주소입니다. 운영자에게 문의하세요.', NETWORK_ERROR: '서버 연결이 끊겼습니다. 자동으로 다시 연결합니다.',
    INVALID_RESPONSE: '중계 데이터를 확인할 수 없습니다. 자동으로 다시 시도합니다.' })[error?.message] || '중계 정보를 불러오지 못했습니다. 자동으로 다시 시도합니다.'
}
