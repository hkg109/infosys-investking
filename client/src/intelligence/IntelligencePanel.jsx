import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
import { canBuy, intelligenceRequest, privateStoreFailure } from './api'

export default function IntelligencePanel({ userId, game, revision, stale, onPurchased }) {
  const [state, setState] = useState({ userId, data: null, error: '', fresh: false })
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState(null)
  const [message, setMessage] = useState('')
  const lock = useRef(false), generation = useRef(0), sequence = useRef(0)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    ++generation.current; setReview(null); setMessage(''); setBusy(false)
    return () => { ++generation.current }
  }, [userId])
  useEffect(() => {
    if (lock.current) return
    const id = ++sequence.current, owner = generation.current
    const controller = new AbortController()
    intelligenceRequest('/me', { signal: controller.signal }).then(data => {
      if (id === sequence.current && owner === generation.current) setState({ userId, data, error: '', fresh: true })
    }).catch(error => {
      if (!controller.signal.aborted && id === sequence.current && owner === generation.current) {
        setState(previous => privateStoreFailure(previous, userId, error)); setReview(null)
      }
    })
    return () => controller.abort()
  }, [userId, revision, retry])
  const current = state.userId === userId ? state : { data: null, fresh: false, error: '' }
  const options = { status: game?.status, stale: stale || !current.fresh, busy }
  const purchase = async () => {
    const item = current.data?.items.find(i => i.clueId === review?.clueId)
    if (lock.current || !canBuy(current.data, item, options) || item.price !== review.price) { setReview(null); return }
    lock.current = true; setBusy(true); ++sequence.current
    const owner = generation.current
    setMessage(''); setState(s => ({ ...s, fresh: false, error: '' }))
    try {
      const data = await intelligenceRequest('/purchases', { method: 'POST', body: { clueId: item.clueId, expectedPrice: item.price } })
      if (owner !== generation.current) return
      setState({ userId, data, error: '', fresh: true }); setMessage('구매한 정보를 보관함에 저장했습니다.'); onPurchased?.()
    } catch (error) {
      if (owner === generation.current) setState(previous => privateStoreFailure(previous, userId, error))
    } finally {
      lock.current = false
      if (owner === generation.current) { setBusy(false); setReview(null) }
      setRetry(n => n + 1)
    }
  }
  return <Panel title="정보 상점·보관함">
    <p>미션으로 받은 정보 포인트로 단서를 구매하세요. 구매한 본문은 본인만 볼 수 있습니다.</p>
    {current.error && <p role="alert" className="form-error">{current.error} 구매 요청은 자동 재전송하지 않습니다. 보관함과 잔액을 다시 확인하세요.</p>}
    {!current.fresh && current.data && <p>마지막으로 확인한 정보입니다. 최신 조회가 완료될 때까지 구매할 수 없습니다.</p>}
    {message && <p role="status">{message}</p>}
    <button type="button" className="secondary-button" disabled={busy} onClick={() => setRetry(n => n + 1)}>{busy ? '구매 확인 중...' : '상점·보관함 다시 조회'}</button>
    {current.data ? <>
      <p className="mission-points">보유 정보 포인트 <strong>{current.data.points.toLocaleString('ko-KR')} P</strong></p>
      {game?.status !== 'RUNNING' && <p>게임 진행 중에만 구매할 수 있습니다. 구매한 정보는 보관함에서 확인하세요.</p>}
      <StoreItems data={current.data} options={options} onReview={item => { setReview({ clueId: item.clueId, price: item.price, title: item.title }); setMessage('') }} />
      {review && <section className="end-confirmation" aria-label="정보 구매 확인"><h3>정보 구매 확인</h3><p>{review.title} · {review.price} P를 사용합니다. 구매한 정보는 보관함에 남습니다.</p>
        {current.data.items.find(i => i.clueId === review.clueId)?.price !== review.price && <p>가격이 변경되었습니다. 취소 후 다시 선택하세요.</p>}
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setReview(null)}>구매 취소</button>
        <button type="button" className="primary-button" disabled={!canBuy(current.data, current.data.items.find(i => i.clueId === review.clueId), options) || current.data.items.find(i => i.clueId === review.clueId)?.price !== review.price} onClick={purchase}>포인트로 구매 확정</button>
      </section>}
      <IntelligenceLibrary purchases={current.data.purchases} />
    </> : <p>{current.error ? '확인된 상점 정보가 없습니다.' : '상점과 보관함을 불러오고 있습니다.'}</p>}
  </Panel>
}
export function StoreItems({ data, options, onReview }) {
  return <section aria-label="판매 중인 정보"><h3>정보 상점</h3>{data.items.length ? <ul className="mission-list">{data.items.map(item => {
    const owned = data.purchases.some(p => p.clueId === item.clueId)
    return <li key={item.clueId}><h4>{item.title}</h4><p>{item.summary}</p><p>{item.price} P · {item.availableRound}월부터</p><button type="button" className="secondary-button" disabled={!canBuy(data, item, options)} onClick={() => onReview(item)}>{owned ? '보관함에 있음' : !item.canPurchase ? '현재 구매 불가' : data.points < item.price ? '포인트 부족' : `${item.title} 구매`}</button></li>
  })}</ul> : <p>현재 판매 중인 정보가 없습니다.</p>}</section>
}
export function IntelligenceLibrary({ purchases }) {
  return <section aria-label="내 정보 보관함"><h3>내 정보 보관함</h3>{purchases.length ? <ul className="mission-list">{purchases.map(item => <li key={item.clueId}><h4>{item.title}</h4><p className="intelligence-content">{item.content}</p><p>{item.paidPoints} P 사용 · <time dateTime={item.purchasedAt}>{new Date(item.purchasedAt).toLocaleString('ko-KR')}</time></p></li>)}</ul> : <p>아직 구매한 정보가 없습니다.</p>}</section>
}
