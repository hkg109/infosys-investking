import { useCallback, useEffect, useRef, useState } from 'react'
import { canBuy, intelligenceRequest, privateStoreFailure } from './api'

export default function useIntelligenceStore({ userId, game, revision, stale, onPurchased, enabled = true }) {
  const [state, setState] = useState({ userId, data: null, error: '', fresh: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const lock = useRef(false), generation = useRef(0), sequence = useRef(0)

  useEffect(() => {
    ++generation.current
    setState({ userId, data: null, error: '', fresh: false })
    setMessage('')
    setBusy(false)
    return () => { ++generation.current }
  }, [userId])

  useEffect(() => {
    if (!enabled || lock.current) return
    const id = ++sequence.current, owner = generation.current
    const controller = new AbortController()
    intelligenceRequest('/me', { signal: controller.signal }).then(data => {
      if (id === sequence.current && owner === generation.current) setState({ userId, data, error: '', fresh: true })
    }).catch(error => {
      if (!controller.signal.aborted && id === sequence.current && owner === generation.current) {
        setState(previous => privateStoreFailure(previous, userId, error))
      }
    })
    return () => controller.abort()
  }, [enabled, userId, revision, refreshVersion])

  const current = state.userId === userId ? state : { data: null, fresh: false, error: '' }
  const options = { status: game?.status, stale: stale || !current.fresh, busy }
  const refresh = useCallback(() => setRefreshVersion(value => value + 1), [])

  const purchase = async item => {
    if (lock.current || !canBuy(current.data, item, options)) return false
    lock.current = true
    setBusy(true)
    ++sequence.current
    const owner = generation.current
    setMessage('')
    setState(previous => ({ ...previous, fresh: false, error: '' }))
    try {
      const data = await intelligenceRequest('/purchases', { method: 'POST', body: { clueId: item.clueId, expectedPrice: item.price } })
      if (owner !== generation.current) return false
      setState({ userId, data, error: '', fresh: true })
      setMessage(`${item.price.toLocaleString('ko-KR')}원을 결제했습니다. 남은 현금은 ${data.cash.toLocaleString('ko-KR')}원이며 구매한 정보는 보관함에 저장했습니다.`)
      onPurchased?.()
      return true
    } catch (error) {
      if (owner === generation.current) {
        setState(previous => privateStoreFailure(previous, userId, error))
        setRefreshVersion(value => value + 1)
      }
      return false
    } finally {
      lock.current = false
      if (owner === generation.current) setBusy(false)
    }
  }

  return { ...current, busy, message, options, purchase, refresh }
}
