import { useEffect, useMemo, useState } from 'react'
import Panel from '../components/Panel'
import { money } from '../game/model'
import { getPriceHistory, historyError } from './historyApi'
import { chartGeometry, priceSeries } from './marketHistoryModel'

export function PriceChart({ series, companyName }) {
  const graph = chartGeometry(series)
  if (!graph.points.length) return <p className="empty-state">아직 기록된 주가 변동이 없습니다.</p>
  return <>
    <div className="price-chart-wrap">
      <svg className="price-chart" viewBox="0 0 640 240" role="img" aria-label={`${companyName} 월별 주가 변동 차트`}>
        <title>{`${companyName} 월별 주가 변동`}</title>
        {[20, 66, 112, 158, 204].map(y => <line key={y} x1="54" x2="622" y1={y} y2={y} className="price-chart__grid" />)}
        <text x="8" y="25" className="price-chart__axis">{compactPrice(graph.maximum)}</text>
        <text x="8" y="208" className="price-chart__axis">{compactPrice(graph.minimum)}</text>
        <polyline points={graph.polyline} className="price-chart__line" />
        {graph.points.map(point => <g key={point.key}>
          <circle cx={point.x} cy={point.y} r={point.snapshotType === 'INTRADAY_EVENT' ? 6 : 4} className={`price-chart__point price-chart__point--${point.snapshotType.toLowerCase()}`} />
          <title>{`${point.label}: ${money(point.price)}${point.event ? ` · ${point.event.title}` : ''}`}</title>
        </g>)}
        <text x="54" y="232" className="price-chart__axis">{graph.points[0].label}</text>
        <text x="622" y="232" textAnchor="end" className="price-chart__axis">{graph.points.at(-1).label}</text>
      </svg>
    </div>
    <ul className="price-timeline" aria-label="주가 변동 상세">
      {graph.points.map(point => <li key={point.key}>
        <span className={`timeline-dot timeline-dot--${point.snapshotType.toLowerCase()}`} />
        <div><strong>{point.label}</strong>{point.event && <span>{point.event.title}</span>}</div>
        <div><strong>{money(point.price)}</strong><span className={point.changeRate > 0 ? 'market-up' : point.changeRate < 0 ? 'market-down' : ''}>{point.changeRate > 0 ? '+' : ''}{point.changeRate}%</span></div>
      </li>)}
    </ul>
  </>
}

function compactPrice(value) {
  if (!Number.isFinite(value)) return '—'
  if (value >= 10000) return `${Math.round(value / 1000)}천`
  return value.toLocaleString('ko-KR')
}

export default function PriceHistoryPanel({ companyId, revision }) {
  const [state, setState] = useState({ companyId: '', data: null, error: '', loading: false })
  const [selectedRound, setSelectedRound] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!companyId) return
    let active = true
    const controller = new AbortController()
    setState(previous => ({ companyId, data: previous.companyId === companyId ? previous.data : null, error: '', loading: true }))
    getPriceHistory(companyId, controller.signal).then(data => {
      if (active) setState({ companyId, data, error: '', loading: false })
    }).catch(error => {
      if (active && error.name !== 'AbortError') setState(previous => ({ ...previous, companyId, error: historyError(error), loading: false }))
    })
    return () => { active = false; controller.abort() }
  }, [companyId, revision, retry])
  const current = state.companyId === companyId ? state : { data: null, error: '', loading: true }
  const periods = current.data?.history || []
  const availableRounds = periods.map(period => period.round)
  const effectiveRound = selectedRound !== null && availableRounds.includes(selectedRound) ? selectedRound : null
  const series = useMemo(() => priceSeries(periods, effectiveRound), [periods, effectiveRound])
  return <Panel title="종목별 월간 주가">
    {!companyId ? <p className="empty-state">종목을 선택하면 월별 주가 변동을 확인할 수 있습니다.</p> : <>
      <header className="market-chart-header">
        <div><p className="eyebrow">PRICE HISTORY</p><h3>{current.data?.company.name || companyId}</h3><p>{current.data?.company.description || '주가 이력을 불러오고 있습니다.'}</p></div>
        {current.data && <span className={current.data.company.active ? 'stock-status stock-status--active' : 'stock-status'}>{current.data.company.active ? '거래 종목' : '비활성 종목'}</span>}
      </header>
      {availableRounds.length > 0 && <div className="history-round-tabs" role="group" aria-label="차트 조회 월">
        <button type="button" aria-pressed={effectiveRound === null} onClick={() => setSelectedRound(null)}>전체</button>
        {availableRounds.map(round => <button type="button" key={round} aria-pressed={effectiveRound === round} onClick={() => setSelectedRound(round)}>{round}월</button>)}
      </div>}
      {current.loading && !current.data && <p role="status">주가 이력을 불러오고 있습니다.</p>}
      {current.error && <p className="form-error" role="alert">{current.error}</p>}
      {current.data && <PriceChart series={series} companyName={current.data.company.name} />}
      {current.error && <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>주가 이력 업데이트</button>}
    </>}
  </Panel>
}
