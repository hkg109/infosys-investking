import { useEffect, useState } from 'react'
import Panel from '../components/Panel'
import ActionDialog from '../components/ActionDialog'
import { money } from '../game/model'
import { getTradeHistory, historyError } from './historyApi'
import { signedMoney } from './marketHistoryModel'
import RefreshIconButton from '../components/RefreshIconButton'

export default function TradeHistoryPanel({ totalRounds = 12, revision }) {
  const [round, setRound] = useState(null)
  const [state, setState] = useState({ round: undefined, data: null, error: '', loading: true })
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setState(previous => ({ round, data: previous.round === round ? previous.data : null, error: '', loading: true }))
    getTradeHistory(round, controller.signal).then(data => {
      if (active) setState({ round, data, error: '', loading: false })
    }).catch(error => {
      if (active && error.name !== 'AbortError') setState(previous => ({ ...previous, error: historyError(error), loading: false }))
    })
    return () => { active = false; controller.abort() }
  }, [round, revision, retry])
  const current = state.round === round ? state : { data: null, error: '', loading: true }
  const summary = current.data?.summary
  const visibleMonths = round ? [round] : Array.from({ length: Math.max(1, totalRounds) }, (_, index) => index + 1)
  const grouped = visibleMonths.map(month => {
    const trades = current.data?.trades.filter(trade => trade.round === month) || []
    return { month, trades, buyAmount: trades.filter(trade => trade.type === 'BUY').reduce((sum, trade) => sum + trade.totalPrice, 0), sellAmount: trades.filter(trade => trade.type === 'SELL').reduce((sum, trade) => sum + trade.totalPrice, 0) }
  })
  return <Panel title="내 월별 거래 현황">
    <div className="trade-history-toolbar">
      <label htmlFor="trade-history-round">조회 기간</label>
      <select id="trade-history-round" value={round ?? ''} onChange={event => setRound(event.target.value ? Number(event.target.value) : null)}>
        <option value="">전체 기간</option>
        {Array.from({ length: Math.max(1, totalRounds) }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}월</option>)}
      </select>
      <RefreshIconButton label="거래 내역 업데이트" onClick={() => setRetry(value => value + 1)} />
    </div>
    {current.loading && !current.data && <p role="status">거래 내역을 불러오고 있습니다.</p>}
    {current.error && <p className="form-error" role="alert">{current.error}</p>}
    {summary && <div className="trade-summary" aria-label="거래 요약">
      <div><span>체결</span><strong>{summary.tradeCount.toLocaleString('ko-KR')}건</strong></div>
      <div><span>매수 금액</span><strong>{money(summary.buyAmount)}</strong></div>
      <div><span>매도 금액</span><strong>{money(summary.sellAmount)}</strong></div>
      <div><span>순현금흐름</span><strong className={summary.netCashFlow > 0 ? 'market-up' : summary.netCashFlow < 0 ? 'market-down' : ''}>{signedMoney(summary.netCashFlow)}</strong></div>
      <div><span>실현손익</span><strong className={summary.realizedProfit > 0 ? 'market-up' : summary.realizedProfit < 0 ? 'market-down' : ''}>{signedMoney(summary.realizedProfit)}</strong></div>
    </div>}
    {current.data && <div className="trade-month-table-wrap"><table className="trade-month-table"><caption>월별 전체 체결 거래</caption><thead><tr><th scope="col">월</th><th scope="col">시각</th><th scope="col">종목</th><th scope="col">구분</th><th scope="col">수량</th><th scope="col">단가</th><th scope="col">총액</th><th scope="col">월 누계·상세</th></tr></thead>{grouped.map(group => <tbody key={group.month} aria-label={`${group.month}월 거래`}>
      <tr className="trade-month-table__group"><th scope="rowgroup" colSpan="8">{group.month}월 · {group.trades.length}건 · 매수 {money(group.buyAmount)} · 매도 {money(group.sellAmount)}</th></tr>
      {group.trades.length ? group.trades.map((trade, index) => <tr key={trade.transactionId}><th scope="row">{trade.round}월</th><td><time dateTime={trade.createdAt}>{new Date(trade.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></td><td><strong>{trade.companyName}</strong><small>{trade.companyId}</small></td><td><span className={`trade-side trade-side--${trade.type.toLowerCase()}`}>{trade.type === 'BUY' ? '매수' : '매도'}</span></td><td className="numeric-cell">{trade.quantity.toLocaleString('ko-KR')}주</td><td className="numeric-cell">{money(trade.price)}</td><td className="numeric-cell">{money(trade.totalPrice)}</td><td>{index === 0 && <span className="trade-month-table__total">매수 {money(group.buyAmount)}<br/>매도 {money(group.sellAmount)}</span>}<button type="button" className="detail-button" onClick={() => setSelected(trade)} aria-label={`${trade.companyName} ${trade.type === 'BUY' ? '매수' : '매도'} 거래 상세 보기`}>체결 상세</button></td></tr>) : <tr><td colSpan="8" className="admin-empty-cell">거래 없음</td></tr>}
    </tbody>)}</table></div>}
    <ActionDialog open={Boolean(selected)} title="체결 거래 상세" eyebrow="TRANSACTION" onClose={() => setSelected(null)} width="small">
      {selected && <><div className="participant-detail-grid"><div><span>종목</span><strong>{selected.companyName}</strong></div><div><span>거래 구분</span><strong>{selected.type === 'BUY' ? '매수' : '매도'}</strong></div><div><span>수량</span><strong>{selected.quantity.toLocaleString('ko-KR')}주</strong></div><div><span>체결 가격</span><strong>{money(selected.price)}</strong></div><div><span>총 거래 금액</span><strong>{money(selected.totalPrice)}</strong></div><div><span>게임 월</span><strong>{selected.round}월</strong></div></div><p><time dateTime={selected.createdAt}>{new Date(selected.createdAt).toLocaleString('ko-KR')}</time></p>{selected.realizedProfit !== null && <p className={selected.realizedProfit > 0 ? 'market-up' : selected.realizedProfit < 0 ? 'market-down' : ''}>실현손익 {signedMoney(selected.realizedProfit)}</p>}<p className="trading-help">거래 번호: {selected.transactionId}</p></>}
    </ActionDialog>
  </Panel>
}
