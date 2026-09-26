import { useDraftGuard } from '../navigation/NavigationGuard'
import { useEffect, useRef, useState } from 'react'
import Panel from './Panel'
import ActionDialog from './ActionDialog'
import { money } from '../game/model'
import { newOrderId, orderError, orderPreview, quantityValue, tradingBlock } from '../trading/model'

export default function TradingPanel({ game, stale, trading, selectedCompanyId, onSelectCompany, orderIntent }) {
  const [localCompanyId, setLocalCompanyId] = useState('')
  const companyId = selectedCompanyId ?? localCompanyId
  const setCompanyId = onSelectCompany || setLocalCompanyId
  const [type, setType] = useState('BUY')
  const [quantityText, setQuantityText] = useState('1')
  const [touched, setTouched] = useState(false)
  useDraftGuard(touched || trading.pending || Boolean(trading.unresolved))
  const [validation, setValidation] = useState('')
  const [orderOpen, setOrderOpen] = useState(false)
  const handledResult = useRef(trading.result?.orderId ?? null)
  const resetForm = () => { setTouched(false); setCompanyId(''); setType('BUY'); setQuantityText('1'); setValidation('') }
  // Reset only once per confirmed order; later polling must not erase a new draft.
  useEffect(() => {
    const id = trading.result?.orderId
    if (id && id !== handledResult.current && !trading.unresolved && !trading.pending) {
      handledResult.current = id
      resetForm()
      setOrderOpen(false)
    }
  }, [trading.result, trading.unresolved, trading.pending])
  useEffect(() => {
    if (!orderIntent?.requestId) return
    setCompanyId(orderIntent.companyId)
    setType(orderIntent.type)
    setQuantityText('1')
    setValidation('')
    setTouched(false)
    setOrderOpen(true)
  }, [orderIntent?.requestId])
  const company = trading.companies?.find((item) => item.companyId === companyId)
  const quantity = quantityValue(quantityText)
  const preview = orderPreview({ company, account: trading.account, type, quantity })
  const resultHolding = trading.result && !trading.result.cancelled
    ? trading.account?.holdings?.find(item => item.companyId === trading.result.companyId)?.quantity ?? 0
    : null
  const blocked = tradingBlock(game, stale || !trading.ready)
  const frozen = trading.pending || Boolean(trading.unresolved)
  const fillMaximum = side => {
    const maximum = side === 'BUY' ? preview.maxBuyQuantity : preview.maxSellQuantity
    if (!Number.isInteger(maximum) || maximum < 1) return
    setTouched(true); setType(side); setQuantityText(String(maximum)); setValidation('')
  }
  const submit = (event) => {
    event.preventDefault()
    if (blocked || frozen) return
    const issue = orderError({ company, quantity, type, account: trading.account })
    setValidation(issue)
    if (issue) return
    let orderId
    try { orderId = newOrderId() } catch { setValidation('이 브라우저에서는 주문 번호를 만들 수 없습니다. 다른 브라우저로 접속해 주세요.'); return }
    trading.submit({ orderId, companyId, type, quantity })
  }
  return <Panel title="주문하기">
    <header className="trading-quote">
      <div><p className="eyebrow">LIVE QUOTE</p><h3>{company?.name || '종목을 선택하세요'}</h3><p>{company?.description || '시장 종목을 선택하면 현재 가격과 주문 정보를 확인할 수 있습니다.'}</p></div>
      <div><span>현재가</span><strong>{money(company?.currentPrice)}</strong>{Number.isFinite(company?.changeRate) && <span className={company.changeRate > 0 ? 'market-up' : company.changeRate < 0 ? 'market-down' : ''}>초기 대비 {company.changeRate > 0 ? '+' : ''}{company.changeRate}%</span>}</div>
    </header>
    {blocked && <p className="trading-help" role="status">{blocked}</p>}
    {trading.error && <p className="form-error" role="alert">{trading.error}</p>}
    <button className="primary-button" type="button" disabled={Boolean(blocked) || frozen} onClick={() => setOrderOpen(true)}>매수·매도 주문 열기</button>
    <ActionDialog open={orderOpen} title="주식 주문" eyebrow="ORDER TICKET" onClose={() => { setOrderOpen(false); resetForm() }} busy={trading.pending} dirty={touched}>
    <form onChange={() => setTouched(true)} className="order-form" onSubmit={submit} noValidate aria-busy={trading.pending}>
      <fieldset disabled={frozen || Boolean(blocked)}>
        <legend className="sr-only">주문 입력</legend>
        <label htmlFor="order-company">종목</label>
        <select id="order-company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setValidation('') }}>
          <option value="">종목을 선택하세요</option>
          {(trading.companies || []).map((item) => <option key={item.companyId} value={item.companyId}>{item.name}</option>)}
        </select>
        <span className="order-side-label">거래 종류</span>
        <div className="order-side-tabs" role="group" aria-label="거래 종류">
          <button type="button" className={type === 'BUY' ? 'is-active order-side--buy' : ''} aria-pressed={type === 'BUY'} onClick={() => { setTouched(true); setType('BUY'); setValidation('') }}>매수</button>
          <button type="button" className={type === 'SELL' ? 'is-active order-side--sell' : ''} aria-pressed={type === 'SELL'} onClick={() => { setTouched(true); setType('SELL'); setValidation('') }}>매도</button>
        </div>
        <label htmlFor="order-quantity">수량 (주)</label>
        <input id="order-quantity" inputMode="numeric" value={quantityText} onChange={(e) => { setQuantityText(e.target.value); setValidation('') }} aria-describedby="order-estimate" />
        <div className="order-quantity-actions" aria-label="최대 주문 수량 입력">
          <button className="secondary-button" type="button" disabled={frozen || Boolean(blocked) || !preview.maxBuyQuantity} onClick={() => fillMaximum('BUY')}>전량 매수</button>
          <button className="secondary-button" type="button" disabled={frozen || Boolean(blocked) || !preview.maxSellQuantity} onClick={() => fillMaximum('SELL')}>전량 매도</button>
        </div>
        <dl className="order-summary">
          <div><dt>현재가</dt><dd>{money(company?.currentPrice)}</dd></div>
          <div><dt>보유 현금</dt><dd>{money(trading.account?.cash)}</dd></div>
          <div><dt>현재 보유량</dt><dd>{company ? `${preview.held.toLocaleString('ko-KR')}주` : '—'}</dd></div>
          <div><dt>최대 매수 가능</dt><dd>{Number.isInteger(preview.maxBuyQuantity) ? `${preview.maxBuyQuantity.toLocaleString('ko-KR')}주` : '—'}</dd></div>
          <div><dt>최대 매수 금액</dt><dd>{money(preview.maxBuyTotal)}</dd></div>
          <div><dt>예상 거래 금액</dt><dd>{money(preview.estimatedTotal)}</dd></div>
          <div><dt>체결 후 예상 보유량</dt><dd>{Number.isInteger(preview.estimatedHolding) ? `${preview.estimatedHolding.toLocaleString('ko-KR')}주` : '—'}</dd></div>
        </dl>
        {company && preview.maxBuyQuantity === 0 && <p className="trading-help">현재 보유 현금으로 이 종목을 1주 이상 매수할 수 없습니다.</p>}
        {company && preview.maxSellQuantity === 0 && type === 'SELL' && <p className="trading-help">현재 매도할 수 있는 보유 주식이 없습니다.</p>}
        <p id="order-estimate" className="trading-help">예상 금액이며 실제 체결 가격과 거래 가능 여부는 서버가 최종 확인합니다.</p>
        {validation && <p className="form-error" role="alert">{validation}</p>}
        <button className={`primary-button order-submit order-submit--${type.toLowerCase()}`} type="submit">{trading.pending ? '주문 처리 중...' : type === 'BUY' ? '매수 주문' : '매도 주문'}</button>
        <button className="secondary-button" type="button" onClick={resetForm}>입력 초기화</button>
      </fieldset>
    </form>
    </ActionDialog>
    {trading.unresolved && <div className="order-unresolved" role="status">
      <p>{trading.unresolved.companyId} · {trading.unresolved.type === 'BUY' ? '매수' : '매도'} {trading.unresolved.quantity}주 주문을 확인 중입니다.</p>
      <p>새 주문을 만들지 않고 동일 주문 번호로 재확인합니다. 미체결 주문이면 현재 가격으로 체결될 수 있습니다.</p>
      <button type="button" className="secondary-button" disabled={trading.pending} onClick={() => trading.submit(trading.unresolved)}>같은 주문 확인</button>
      <button type="button" className="secondary-button" disabled={trading.pending} onClick={trading.cancel}>미체결 주문 취소</button>
      <p>다른 기기에서도 같은 닉네임과 PIN으로 복구할 수 있습니다. 이미 체결됐다면 취소 대신 기존 결과를 표시합니다.</p>
    </div>}
    {trading.result && <div className="order-success" role="status">
      <strong>{trading.result.cancelled ? '미체결 주문을 취소했습니다.' : trading.result.duplicate ? '이미 처리된 주문을 확인했습니다.' : '거래가 완료되었습니다.'}</strong>
      <p>{!trading.result.cancelled && <>{trading.result.companyId} · {trading.result.type === 'BUY' ? '매수' : '매도'} {trading.result.quantity}주 · 체결가 {money(trading.result.price)} · 총 {money(trading.result.totalPrice)}</>}</p>
      {Number.isInteger(resultHolding) && <p>체결 후 보유량 <strong>{resultHolding.toLocaleString('ko-KR')}주</strong></p>}
    </div>}
    {trading.recovery?.history?.length > 0 && <details className="order-history"><summary>최근 거래 내역 (최대 20건)</summary><ul>{trading.recovery.history.map(tx => <li key={tx.orderId}>{tx.companyId} · {tx.type === 'BUY' ? '매수' : '매도'} {tx.quantity}주 · {money(tx.totalPrice)}<br /><small>{new Date(tx.createdAt).toLocaleString('ko-KR')}</small></li>)}</ul></details>}
    <button className="secondary-button trading-refresh" type="button" disabled={trading.pending} onClick={trading.refresh}>자산·종목 업데이트</button>
  </Panel>
}
