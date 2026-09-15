import { useCallback, useEffect, useRef, useState } from 'react'
import { getTrading, sendOrder, tradingError } from './api'

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
  const key = `investking_pending_order:${userId}`

  const refresh = useCallback(async () => {
    if (lock.current || fetching.current) return
    fetching.current = true
    const id = ++generation.current
    try {
      const next = await getTrading()
      if (mounted.current && id === generation.current) { setData(next); setLoadError('') }
    } catch (failure) {
      if (mounted.current && id === generation.current) setLoadError(tradingError(failure))
    } finally { fetching.current = false }
  }, [])

  useEffect(() => {
    mounted.current = true
    try {
      const stored = sessionStorage.getItem(key)
      if (stored) {
        const order = JSON.parse(stored)
        if (typeof order.orderId !== 'string' || typeof order.companyId !== 'string' || !['BUY', 'SELL'].includes(order.type) || !Number.isSafeInteger(order.quantity) || order.quantity < 1 || order.quantity > 1_000_000) throw new Error('Invalid pending order')
        setUnresolved(order)
      }
      setStorageReady(true)
    } catch { setError('주문 복구 정보를 읽을 수 없어 거래를 중지했습니다. 브라우저 저장소 설정을 확인해 주세요.') }
    refresh()
    const timer = setInterval(refresh, 5000)
    const focus = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', focus)
    return () => { mounted.current = false; ++generation.current; clearInterval(timer); document.removeEventListener('visibilitychange', focus) }
  }, [key, refresh])

  const submit = async (order) => {
    if (lock.current || !storageReady) return
    // Persist before sending so a reload cannot silently produce a second orderId.
    try { sessionStorage.setItem(key, JSON.stringify(order)) } catch {
      setStorageReady(false)
      setError('주문 정보를 보관할 수 없어 전송하지 않았습니다. 브라우저 저장소 설정을 확인해 주세요.')
      return
    }
    lock.current = true
    ++generation.current
    setPending(true)
    setUnresolved(order)
    setResult(null)
    try {
      const response = await sendOrder(order)
      if (!mounted.current) return
      setData((current) => ({ ...current, account: response.account }))
      setResult({ ...response.transaction, duplicate: response.duplicate })
      try { sessionStorage.removeItem(key); setUnresolved(null); setError('') } catch {
        setStorageReady(false)
        setError('거래는 완료됐지만 주문 기록을 정리하지 못했습니다. 브라우저 저장소 설정을 확인해 주세요.')
      }
    } catch (failure) {
      if (!mounted.current) return
      if (!failure.uncertain) {
        try { sessionStorage.removeItem(key); setUnresolved(null) } catch { setStorageReady(false) }
      }
      setError(failure.uncertain ? '주문 결과를 아직 확인하지 못했습니다. 같은 주문 확인 버튼으로 결과를 확인해 주세요.' : tradingError(failure))
    } finally {
      lock.current = false
      if (mounted.current) { setPending(false); refresh() }
    }
  }
  return { ...data, error: error || loadError, pending, unresolved, result, submit, refresh, ready: storageReady && Boolean(data) && !loadError }
}
