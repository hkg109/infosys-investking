import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { controlGame, gameError, getGame } from './api'
import { allowedControl, remainingSeconds } from './model'

const events = ['game:state', 'game:start', 'game:pause', 'game:resume', 'game:end', 'round:start', 'round:end', 'trading:open', 'trading:close', 'stock:update', 'news:publish', 'event:result', 'ranking:update', 'participants:presence', 'game:reset']
export function useGame(adminPassword = '', onSessionCheck) {
  const [snapshot, setSnapshot] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [connected, setConnected] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const requestId = useRef(0)
  const receivedAt = useRef(0)
  const locked = useRef(false)
  const snapshotRef = useRef(null)
  const fresh = useRef(false)
  const fetching = useRef(0)

  const apply = useCallback((next) => {
    snapshotRef.current = next
    receivedAt.current = performance.now()
    fresh.current = true
    setElapsed(0)
    setSnapshot(next)
    setError('')
  }, [])
  const refresh = useCallback(async () => {
    if (locked.current || fetching.current) return
    const id = ++requestId.current
    fetching.current = id
    try {
      const next = await getGame()
      if (id === requestId.current) apply(next)
      return next
    } catch (failure) {
      if (id === requestId.current) { fresh.current = false; setError(gameError(failure)) }
    } finally {
      if (fetching.current === id) fetching.current = 0
      if (id === requestId.current) setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    refresh()
    const socket = io(import.meta.env.VITE_API_BASE_URL || undefined, { withCredentials: true, path: '/api/socket.io' })
    const disconnect = (reason) => {
      if (reason === 'io server disconnect') { onSessionCheck?.(); socket.connect() }
      setConnected(false)
      fresh.current = false
      setError('실시간 연결이 끊겼습니다. 게임 정보를 다시 확인하고 있습니다.')
    }
    socket.on('connect', () => { setConnected(true); refresh(); onSessionCheck?.() })
    socket.on('disconnect', disconnect)
    socket.on('connect_error', disconnect)
    socket.on('game:reset', () => onSessionCheck?.())
    // Legacy game:start is only a notification; never treat it as a state transition.
    events.forEach((event) => socket.on(event, refresh))
    const poll = setInterval(refresh, 5000)
    const tick = setInterval(() => setElapsed((performance.now() - receivedAt.current) / 1000), 250)
    const focus = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', focus)
    return () => {
      ++requestId.current
      fetching.current = 0
      socket.removeAllListeners()
      socket.disconnect()
      clearInterval(poll)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [refresh, onSessionCheck])

  const control = useCallback(async (action) => {
    const current = snapshotRef.current
    if (locked.current || !fresh.current || !adminPassword || !allowedControl(action, current?.game?.status)) return false
    locked.current = true
    setPending(true)
    const id = ++requestId.current
    try {
      const next = await controlGame(action, adminPassword)
      if (id === requestId.current) apply(next)
      return true
    } catch (failure) {
      if (id === requestId.current) { fresh.current = false; setError(`${gameError(failure)} 요청 결과를 다시 확인해 주세요.`) }
      return false
    } finally {
      locked.current = false
      if (id === requestId.current) setPending(false)
    }
  }, [apply, adminPassword])

  return {
    snapshot,
    game: snapshot?.game ? { ...snapshot.game, remainingSeconds: error ? null : remainingSeconds(snapshot.game, elapsed) } : null,
    loading, error, connected, pending, refresh, control,
    canControl: !error && !loading && Boolean(adminPassword),
  }
}
