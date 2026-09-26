import { useState } from 'react'
import { useDraftGuard } from '../navigation/NavigationGuard'
import Panel from '../components/Panel'
import { canBuy } from './api'
import useIntelligenceStore from './useIntelligenceStore'

export default function IntelligencePanel(props) {
  return <IntelligenceStorePanel store={useIntelligenceStore(props)} />
}

export function IntelligenceStorePanel({ store }) {
  const [review, setReview] = useState(null)
  useDraftGuard(Boolean(review), store.busy)
  const item = store.data?.items.find(candidate => candidate.clueId === review?.clueId)
  const priceChanged = Boolean(review && item?.price !== review.price)
  const confirmPurchase = async () => {
    if (!item || priceChanged) { setReview(null); return }
    await store.purchase(item)
    setReview(null)
  }
  return <Panel title="정보 상점" className="intelligence-shop">
    <div className="intelligence-shop__intro">
      <p>시장에 공개되기 전 단서를 골라 현금으로 구매하세요.</p>
      {store.data && <p className="intelligence-wallet"><span>사용 가능 현금</span><strong>{store.data.cash.toLocaleString('ko-KR')}원</strong></p>}
    </div>
    {store.error && <p role="alert" className="form-error">{store.error} 구매 요청은 자동 재전송하지 않습니다. 보관함과 잔액을 확인하세요.</p>}
    {!store.fresh && store.data && <p>마지막으로 확인한 정보입니다. 최신 조회가 완료될 때까지 구매할 수 없습니다.</p>}
    {store.message && <p role="status" className="intelligence-shop__status">{store.message}</p>}
    <button type="button" className="secondary-button intelligence-shop__refresh" disabled={store.busy} onClick={store.refresh}>{store.busy ? '구매 확인 중…' : '정보 상점 업데이트'}</button>
    {store.data ? <>
      {store.options.status !== 'RUNNING' && <p>게임 진행 중에만 구매할 수 있습니다.</p>}
      <StoreItems data={store.data} options={store.options} onReview={selected => setReview({ clueId: selected.clueId, price: selected.price, title: selected.title })} />
      {review && <section className="end-confirmation" aria-label="정보 구매 확인"><h3>정보 구매 확인</h3><p>{review.title} · {review.price.toLocaleString('ko-KR')}원을 사용합니다. 구매한 정보는 보관함에 남습니다.</p>
        {priceChanged && <p>가격이 변경되었습니다. 취소 후 다시 선택하세요.</p>}
        <button type="button" className="secondary-button" disabled={store.busy} onClick={() => setReview(null)}>구매 취소</button>
        <button type="button" className="primary-button" disabled={!canBuy(store.data, item, store.options) || priceChanged} onClick={confirmPurchase}>현금으로 구매 확정</button>
      </section>}
    </> : <p>{store.error ? '확인된 상점 정보가 없습니다.' : '정보 상점을 불러오고 있습니다.'}</p>}
  </Panel>
}

export function IntelligenceLibraryPanel({ store }) {
  return <Panel title="내 정보 보관함">
    <p>구매를 완료한 정보와 구매 당시 결제 금액을 확인할 수 있습니다.</p>
    {store.error && <p role="alert" className="form-error">{store.error}</p>}
    <button type="button" className="secondary-button" disabled={store.busy} onClick={store.refresh}>보관함 업데이트</button>
    {store.data ? <IntelligenceLibrary purchases={store.data.purchases} /> : <p>{store.error ? '확인된 구매 정보가 없습니다.' : '보관함을 불러오고 있습니다.'}</p>}
  </Panel>
}

export function StoreItems({ data, options, onReview }) {
  return <section className="intelligence-catalog" aria-label="판매 중인 정보" aria-busy={options.busy || undefined}>
    <div className="intelligence-catalog__heading"><h3>정보 카드</h3><p>구매한 정보는 보관함에서 언제든 다시 읽을 수 있습니다.</p></div>
    {data.items.length ? <ul className="intelligence-grid">{data.items.map((item, index) => {
      const state = storeItemState(data, item, options)
      const labels = {
        owned: '보유 중', locked: `${item.availableRound}월 해금`, insufficient: '현금 부족', loading: '처리 중…', available: '구매 가능',
      }
      return <li key={item.clueId} className="intelligence-card" data-state={state}>
        <div className="intelligence-card__topline"><span className="intelligence-card__slot">SLOT {String(index + 1).padStart(2, '0')}</span><span className="intelligence-card__state">{labels[state]}</span></div>
        <div className="intelligence-card__body"><h4>{item.title}</h4><p>{item.summary}</p></div>
        <dl className="intelligence-card__meta"><div><dt>가격</dt><dd>{item.price.toLocaleString('ko-KR')}원</dd></div><div><dt>공개</dt><dd>{item.availableRound}월</dd></div></dl>
        <button type="button" className="intelligence-card__action" disabled={!canBuy(data, item, options)} onClick={() => onReview(item)}>{storeItemAction(state, item.title)}</button>
      </li>
    })}</ul> : <p className="empty-state">현재 판매 중인 정보가 없습니다. 관리자가 카드를 등록하면 이곳에 표시됩니다.</p>}
  </section>
}

export function storeItemState(data, item, options) {
  if (data.purchases.some(purchase => purchase.clueId === item.clueId)) return 'owned'
  if (options.busy) return 'loading'
  if (!item.canPurchase || options.status !== 'RUNNING' || options.stale) return 'locked'
  if (data.cash < item.price) return 'insufficient'
  return 'available'
}

export function storeItemAction(state, title) {
  return ({
    owned: '보관함에 있음', locked: '아직 구매할 수 없음', insufficient: '현금이 부족함', loading: '구매 확인 중…', available: `${title} 구매`,
  })[state]
}

export function IntelligenceLibrary({ purchases }) {
  return <section aria-label="구매한 정보">{purchases.length ? <ul className="mission-list">{purchases.map(item => <li key={item.clueId}><h3>{item.title}</h3><p className="intelligence-content">{item.content}</p><p>{item.paidCash.toLocaleString('ko-KR')}원 사용 · <time dateTime={item.purchasedAt}>{new Date(item.purchasedAt).toLocaleString('ko-KR')}</time></p></li>)}</ul> : <p>아직 구매한 정보가 없습니다.</p>}</section>
}
