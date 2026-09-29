import { useEffect, useState } from 'react'
import { useDraftGuard } from '../navigation/NavigationGuard'
import Panel from '../components/Panel'
import ActionDialog, { ConfirmDialog } from '../components/ActionDialog'
import { canBuy } from './api'
import useIntelligenceStore from './useIntelligenceStore'
import RefreshIconButton from '../components/RefreshIconButton'

export default function IntelligencePanel(props) {
  return <IntelligenceStorePanel store={useIntelligenceStore(props)} />
}

export function IntelligenceStorePanel({ store }) {
  const [review, setReview] = useState(null)
  useDraftGuard(Boolean(review), store.busy)
  const item = store.data?.items.find(candidate => candidate.clueId === review?.clueId)
  const priceChanged = Boolean(review && item?.price !== review.price)
  const confirmPurchase = async () => {
    if (!item || priceChanged) return
    if (await store.purchase(item)) setReview(null)
  }
  const openReview = selected => {
    store.clearPurchaseError?.()
    setReview({ clueId: selected.clueId, price: selected.price, title: selected.title })
  }
  const closeReview = () => {
    if (!store.busy) { store.clearPurchaseError?.(); setReview(null) }
  }
  useEffect(() => {
    if (review && store.data && !item && !store.busy) setReview(null)
  }, [review, item, store.data, store.busy])
  return <Panel title="정보 상점" className="intelligence-shop">
    <div className="intelligence-shop__intro">
      <p>시장에 공개되기 전 단서를 골라 현금으로 구매하세요.</p>
      {store.data && <p className="intelligence-wallet"><span>사용 가능 현금</span><strong>{store.data.cash.toLocaleString('ko-KR')}원</strong></p>}
    </div>
    {store.error && <p role="alert" className="form-error">{store.error} 구매 요청은 자동 재전송하지 않습니다. 보관함과 잔액을 확인하세요.</p>}
    {!store.fresh && store.data && <p>마지막으로 확인한 정보입니다. 최신 조회가 완료될 때까지 구매할 수 없습니다.</p>}
    {store.message && <p role="status" className="intelligence-shop__status">{store.message}</p>}
    <RefreshIconButton label="정보 상점 업데이트" loading={store.busy} className="intelligence-shop__refresh" disabled={store.busy} onClick={store.refresh} />
    {store.data ? <>
      {!store.data.purchaseOpen && <p>게임 진행 중에만 구매할 수 있습니다.</p>}
      <StoreItems data={store.data} options={store.options} onReview={openReview} />
      <PurchaseDialog review={review} item={item} store={store} priceChanged={priceChanged} onCancel={closeReview} onConfirm={confirmPurchase} />
    </> : <p>{store.error ? '확인된 상점 정보가 없습니다.' : '정보 상점을 불러오고 있습니다.'}</p>}
  </Panel>
}

export function PurchaseDialog({ review, item, store, priceChanged = false, onCancel, onConfirm }) {
  return <ConfirmDialog open={Boolean(review)} title="정보 구매" onCancel={onCancel} onConfirm={onConfirm} busy={store.busy} confirmDisabled={!canBuy(store.data, item, store.options) || priceChanged} confirmLabel="구매" hideClose>
    <dl className="purchase-review">
      <div><dt>정보</dt><dd>{review?.title}</dd></div>
      <div><dt>구매 가격</dt><dd>{review?.price.toLocaleString('ko-KR')}원</dd></div>
      <div><dt>현재 현금</dt><dd>{store.data.cash.toLocaleString('ko-KR')}원</dd></div>
      <div><dt>구매 후 현금</dt><dd>{Math.max(0, store.data.cash - (review?.price || 0)).toLocaleString('ko-KR')}원</dd></div>
    </dl>
    <p>구매한 정보는 내 정보 보관함에 저장됩니다.</p>
    {priceChanged && <p role="alert" className="form-error">가격이 변경되었습니다. 취소 후 최신 가격으로 다시 선택하세요.</p>}
    {store.purchaseError && <p role="alert" className="form-error">{store.purchaseError} 자동으로 다시 구매하지 않았습니다.</p>}
  </ConfirmDialog>
}

export function IntelligenceLibraryPanel({ store }) {
  return <Panel title="내 정보 보관함">
    <p>구매한 정보는 월이 지나거나 사건이 끝나도 이 게임의 보관함에서 다시 읽을 수 있습니다.</p>
    {store.error && <p role="alert" className="form-error">{store.error}</p>}
    <RefreshIconButton label="보관함 업데이트" loading={store.busy} disabled={store.busy} onClick={store.refresh} />
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
        <div className="intelligence-card__body"><h4>{item.title}</h4><p>{item.summary}</p>{item.relatedEvent && <span className="intelligence-card__link">미발생 사건 관련 정보</span>}</div>
        <dl className="intelligence-card__meta"><div><dt>가격</dt><dd>{item.price.toLocaleString('ko-KR')}원</dd></div><div><dt>공개</dt><dd>{item.availableRound}월</dd></div></dl>
        <button type="button" className="intelligence-card__action" disabled={!canBuy(data, item, options)} onClick={() => onReview(item)}>{storeItemAction(state)}</button>
      </li>
    })}</ul> : <p className="empty-state">현재 판매 중인 정보가 없습니다. 관리자가 카드를 등록하면 이곳에 표시됩니다.</p>}
  </section>
}

export function storeItemState(data, item, options) {
  if (data.purchases.some(purchase => purchase.clueId === item.clueId)) return 'owned'
  if (options.busy) return 'loading'
  if (!data.purchaseOpen || !item.canPurchase || options.stale) return 'locked'
  if (data.cash < item.price) return 'insufficient'
  return 'available'
}

export function storeItemAction(state) {
  return ({
    owned: '보관함에 있음', locked: '아직 구매할 수 없음', insufficient: '현금이 부족함', loading: '구매 처리 중…', available: '정보 구매',
  })[state]
}

export function IntelligenceLibrary({ purchases }) {
  const [selected, setSelected] = useState(null)
  const current = purchases.find(item => item.clueId === selected)
  useEffect(() => { if (selected && !current) setSelected(null) }, [selected, current])
  return <section className="intelligence-library" aria-label="구매한 정보">{purchases.length ? <ul className="intelligence-library__grid">{purchases.map((item, index) => <li key={item.clueId} className={`intelligence-library__card${item.expired ? " intelligence-library__card--expired" : ""}`}>
    <div className="intelligence-card__topline"><span className="intelligence-card__slot">ARCHIVE {String(index + 1).padStart(2, '0')}</span><span className="intelligence-card__state">{item.expired ? "지난 정보" : "수집 완료"}</span></div>
    <h3>{item.title}</h3><dl><div><dt>구매 월</dt><dd>{item.availableRound}월 공개 정보</dd></div><div><dt>결제</dt><dd>{item.paidCash.toLocaleString('ko-KR')}원</dd></div></dl>
    <button type="button" className="intelligence-card__action" onClick={() => setSelected(item.clueId)}>정보 읽기</button>
  </li>)}</ul> : <p>아직 구매한 정보가 없습니다.</p>}
  <ActionDialog open={Boolean(current)} title={current?.title || '구매 정보'} eyebrow="INTELLIGENCE ARCHIVE" onClose={() => setSelected(null)} width="medium">
    {current && <IntelligenceLibraryDetail item={current} />}
  </ActionDialog>
  </section>
}

export function IntelligenceLibraryDetail({ item }) {
  return <article className="intelligence-library__detail"><p className="intelligence-library__summary">{item.summary}</p><div className="intelligence-content">{item.content}</div><footer>{item.paidCash.toLocaleString('ko-KR')}원 사용 · <time dateTime={item.purchasedAt}>{new Date(item.purchasedAt).toLocaleString('ko-KR')}</time></footer></article>
}
