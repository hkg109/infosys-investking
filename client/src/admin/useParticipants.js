import { useCallback, useEffect, useRef, useState } from 'react'
import { getParticipants, participantError } from './participants'
export function useParticipants(password, revision) {
  const [state, setState] = useState({ data: null, error: '', loading: true, updatedAt: null })
  const [retry, setRetry] = useState(0)
  const refresh = useCallback(() => setRetry(n => n + 1), [])
  const serial = useRef(0)
  useEffect(() => {
    const id = ++serial.current
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    getParticipants(password, controller.signal).then(data => {
      if (id === serial.current) setState({ data, error: '', loading: false, updatedAt: new Date().toISOString() })
    }).catch(error => {
      if (id === serial.current) setState(s => ({ ...s, data: error.message === 'ADMIN_AUTH_REQUIRED' ? null : s.data, loading: false, error: participantError(error) }))
    }).finally(() => clearTimeout(timeout))
    return () => { ++serial.current; clearTimeout(timeout); controller.abort() }
  }, [password, revision, retry])
  return { ...state, refresh }
}
