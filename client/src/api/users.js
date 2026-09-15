const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(code, status) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

async function request(path, options = {}) {
  let response

  try {
    response = await fetch(`${apiBaseUrl}/api/users${path}`, {
      credentials: 'include',
      ...options,
      headers: options.body
        ? { 'Content-Type': 'application/json', ...options.headers }
        : options.headers,
    })
  } catch {
    throw new ApiError('NETWORK_ERROR', 0)
  }

  if (response.status === 204) return null

  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(result.error || 'UNKNOWN_ERROR', response.status)
  return result
}

export function joinUser(nickname, pin) {
  return request('/join', {
    method: 'POST',
    body: JSON.stringify({ nickname, pin }),
  })
}

export function recoverUser(nickname, pin) {
  return request('/recover', {
    method: 'POST',
    body: JSON.stringify({ nickname, pin }),
  })
}

export function getCurrentUser() {
  return request('/me')
}

export function logoutUser() {
  return request('/logout', { method: 'POST' })
}
