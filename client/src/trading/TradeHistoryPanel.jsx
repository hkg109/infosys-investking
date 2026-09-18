import { useEffect, useState } from 'react'
import Panel from '../components/Panel'
import { money } from '../game/model'
import { getTradeHistory, historyError } from './historyApi'
import { signedMoney } from './marketHistoryModel'

export default function TradeHistoryPanel({ totalRounds = 12, revision }) {
  const [round, setRound] = useState(null)
  const [state, setState] = useState({ round: undefined, data: null, error: '', loading: true })
  const [retry, setRetry] = useState(0)
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
  return <Panel title="내 월별 거래 현황">
    <div className="trade-history-toolbar">
      <label htmlFor="trade-history-round">조회 기간</label>
      <select id="trade-history-round" value={round ?? ''} onChange={event => setRound(event.target.value ? Number(event.target.value) : null)}>
        <option value="">전체 기간</option>
        {Array.from({ length: Math.max(1, totalRounds) }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}월</option>)}
      </select>
      <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>거래 내역 새로고침</button>
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
    {current.data && (current.data.trades.length === 0 ? <p className="empty-state">선택한 기간에 체결된 거래가 없습니다.</p> : <ul className="trade-ledger" aria-label="체결 거래 목록">
      {current.data.trades.map(trade => <li key={trade.transactionId}>
        <div className="trade-ledger__headline"><span className={`trade-side trade-side--${trade.type.toLowerCase()}`}>{trade.type === 'BUY' ? '매수' : '매도'}</span><strong>{trade.companyName}</strong><span>{trade.round}월</span></div>
        <div className="trade-ledger__numbers"><span>{trade.quantity.toLocaleString('ko-KR')}주 × {money(trade.price)}</span><strong>{money(trade.totalPrice)}</strong></div>
        <div className="trade-ledger__meta"><time dateTime={trade.createdAt}>{new Date(trade.createdAt).toLocaleString('ko-KR')}</time>{trade.realizedProfit !== null && <span className={trade.realizedProfit > 0 ? 'market-up' : trade.realizedProfit < 0 ? 'market-down' : ''}>실현손익 {signedMoney(trade.realizedProfit)}</span>}</div>
      </li>)}
    </ul>)}
  </Panel>
}
