import { useCallback, useEffect, useRef, useState } from 'react'
import { getTrading, sendOrder, prepareOrder, cancelOrder, tradingError } from './api'

export function useTrading(userId) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [pending, setPending] = useState(false)
  const [unresolved, setUnresolved] = useState(null)
  const [result, setResult] = useState(null)
  const [storageReady, setStorageReady] = useState(false)
  const lock = useRef(false)
  const generation = useRef(0)
  const fetching = useRef(false)
  const mounted = useRef(false)
  const unresolvedRef = useRef(null)
  const key = `investking_pending_order:${userId}`

  const refresh = useCallback(async () => {
    if (lock.current || fetching.current) return
    fetching.current = true
    const id = ++generation.current
    try {
      const next = await getTrading()
      if (mounted.current && id === generation.current) {
        setData(next); setLoadError('')
        const local = unresolvedRef.current
        const filled = next.recovery.history.find(tx => tx.orderId === local?.orderId)
        const recovered = next.recovery.pending || (filled ? null : local)
        if (filled) setResult({ ...filled, duplicate: true })
        else if (recovered && recovered.orderId !== local?.orderId) setResult(null)
        unresolvedRef.current = recovered
        setUnresolved(recovered)
        try {
          if (recovered) sessionStorage.setItem(key, JSON.stringify(recovered))
          else sessionStorage.removeItem(key)
        } catch { /* Server recovery remains available when local storage is unavailable. */ }
      }
    } catch (failure) {
      if (mounted.current && id === generation.current) setLoadError(tradingError(failure))
    } finally { fetching.current = false }
  }, [key])

  useEffect(() => {
    mounted.current = true
    try {
      const stored = sessionStorage.getItem(key)
      if (stored) {
        const order = JSON.parse(stored)
        if (typeof order.orderId !== 'string' || typeof order.companyId !== 'string' || !['BUY', 'SELL'].includes(order.type) || !Number.isSafeInteger(order.quantity) || order.quantity < 1 || order.quantity > 1_000_000) throw new Error('Invalid pending order')
        unresolvedRef.current = order
        setUnresolved(order)
      }
    } catch { /* Server recovery is authoritative; local storage is only a backup. */ }
    setStorageReady(true)
    refresh()
    const timer = setInterval(refresh, 5000)
    const focus = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', focus)
    return () => { mounted.current = false; ++generation.current; clearInterval(timer); document.removeEventListener('visibilitychange', focus) }
  }, [key, refresh])

  const submit = async (order) => {
    if (lock.current || !storageReady) return
    try { sessionStorage.setItem(key, JSON.stringify(order)) } catch { /* Prepare must commit before execution. */ }
    lock.current = true
    ++generation.current
    setPending(true)
    unresolvedRef.current = order
    setUnresolved(order)
    setResult(null)
    try {
      await prepareOrder(order)
      const response = await sendOrder(order)
      if (!mounted.current) return
      setData((current) => ({ ...current, account: response.account }))
      setResult({ ...response.transaction, duplicate: response.duplicate })
      try { sessionStorage.removeItem(key) } catch {}
      unresolvedRef.current = null; setUnresolved(null); setError('')
    } catch (failure) {
      if (!mounted.current) return
      if (['ORDER_CANCELLED', 'PENDING_ORDER_EXISTS', 'ORDER_ID_CONFLICT'].includes(failure.message)) {
        try { sessionStorage.removeItem(key) } catch {}
        unresolvedRef.current = null; setUnresolved(null)
      }
      setError(failure.message === 'AUTH_REQUIRED'
        ? '로그인이 만료되었습니다. 로그아웃 후 같은 닉네임과 PIN으로 계정을 복구하면 미확인 주문을 계속 확인할 수 있습니다.'
        : failure.uncertain ? '주문 결과를 아직 확인하지 못했습니다. 같은 주문 확인 버튼으로 결과를 확인해 주세요.' : tradingError(failure))
    } finally {
      lock.current = false
      if (mounted.current) { setPending(false); refresh() }
    }
  }
  const cancel = async () => {
    const order = unresolvedRef.current
    if (!order || lock.current) return
    lock.current = true; ++generation.current; setPending(true)
    try {
      const response = await cancelOrder(order)
      if (!mounted.current) return
      setResult(response.cancelled ? { cancelled: true } : { ...response.transaction, duplicate: true })
      unresolvedRef.current = null; setUnresolved(null); setError('')
      try { sessionStorage.removeItem(key) } catch {}
    } catch (failure) { if (mounted.current) setError(tradingError(failure)) }
    finally { lock.current = false; if (mounted.current) { setPending(false); refresh() } }
  }
  return { ...data, cancel, error: error || loadError, pending, unresolved, result, submit, refresh, ready: storageReady && Boolean(data) && !loadError }
}
