import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ApiError, getCurrentUser, joinUser, logoutUser, recoverUser } from '../api/users'

const storageKey = 'investking_user_id'
const SessionContext = createContext(null)

function saveUserId(userId) {
  try {
    if (userId) localStorage.setItem(storageKey, userId)
    else localStorage.removeItem(storageKey)
  } catch {
    // A blocked storage API must not prevent cookie-based sign-in.
  }
}

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')
  const [sessionError, setSessionError] = useState('')

  const rememberUser = useCallback((nextUser) => {
    setUser(nextUser)
    saveUserId(nextUser?.userId)
  }, [])

  const refreshSession = useCallback(async (quiet = false) => {
    if (!quiet) setStatus('loading')
    setSessionError('')

    try {
      const result = await getCurrentUser()
      rememberUser(result.user)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'AUTH_REQUIRED') {
        rememberUser(null)
      } else {
        setSessionError(error.code || 'UNKNOWN_ERROR')
      }
    } finally {
      setStatus('ready')
    }
  }, [rememberUser])

  useEffect(() => {
    refreshSession()
  }, [refreshSession])

  const checkSession = useCallback(() => refreshSession(true), [refreshSession])

  const join = useCallback(async (nickname, pin) => {
    const result = await joinUser(nickname, pin)
    rememberUser(result.user)
    setSessionError('')
    return result.user
  }, [rememberUser])

  const recover = useCallback(async (nickname, pin) => {
    const result = await recoverUser(nickname, pin)
    rememberUser(result.user)
    setSessionError('')
    return result.user
  }, [rememberUser])

  const logout = useCallback(async () => {
    await logoutUser()
    rememberUser(null)
  }, [rememberUser])

  const value = useMemo(() => ({
    user,
    status,
    sessionError,
    join,
    recover,
    logout,
    refreshSession,
    checkSession,
  }), [join, logout, recover, refreshSession, checkSession, sessionError, status, user])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}
