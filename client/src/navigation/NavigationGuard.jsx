import { createContext, useCallback, useContext, useEffect, useId, useState } from 'react'
import { useBlocker } from 'react-router-dom'
const DraftContext = createContext(null)
export function useDraftGuard(dirty, pending = false) {
  const register = useContext(DraftContext)
  const id = useId()
  useEffect(() => {
    register?.(id, pending ? 2 : dirty ? 1 : 0)
    return () => register?.(id, 0)
  }, [register, id, dirty, pending])
}
export default function NavigationGuard({ children, busy: externalBusy = false }) {
  const [drafts, setDrafts] = useState({})
  const register = useCallback((id, value) => setDrafts(old => {
    if ((old[id] || 0) === value) return old
    const next = { ...old }
    if (value) next[id] = value
    else delete next[id]
    return next
  }), [])
  const busy = externalBusy || Object.values(drafts).includes(2)
  const dirty = Object.values(drafts).some(Boolean)
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    (busy || dirty) && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!busy && !dirty) return
    const prevent = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [busy, dirty])
  return <DraftContext.Provider value={register}>
    {blocker.state === 'blocked' && <section className="navigation-confirm" role="alert" aria-label="페이지 이동 확인">
      <h2>{busy ? '처리가 끝날 때까지 기다려 주세요' : '작성 중인 내용이 있습니다'}</h2>
      <p>{busy ? '요청 결과를 확인한 뒤 이동할 수 있습니다.' : '계속 작성하여 저장하거나, 작성 내용을 버리고 이동하세요.'}</p>
      <button type="button" className="secondary-button" autoFocus onClick={() => blocker.reset()}>계속 작성</button>
      <button type="button" className="primary-button" disabled={busy} onClick={() => blocker.proceed()}>작성 내용 버리고 이동</button>
    </section>}
    {children}
  </DraftContext.Provider>
}
