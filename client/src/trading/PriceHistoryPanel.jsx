import { useEffect, useMemo, useState } from 'react'
import Panel from '../components/Panel'
import { money } from '../game/model'
import { getAllPriceHistories, historyError } from './historyApi'
import { chartGeometry, multiChartGeometry, multiPriceSeries, priceSeries } from './marketHistoryModel'

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
    <PriceTimeline points={graph.points} />
  </>
}

export function MultiPriceChart({ companies, selectedCompanyId = '' }) {
  const graph = multiChartGeometry(companies)
  if (!graph.groups.some(group => group.points.length)) return <p className="empty-state">아직 기록된 주가 변동이 없습니다.</p>
  const selected = selectedCompanyId && graph.groups.some(group => group.company.companyId === selectedCompanyId)
  const visibleGroups = graph.groups.filter(group => group.points.length)
  return <>
    <div className="price-chart-wrap price-chart-wrap--multi">
      <svg className="price-chart price-chart--multi" viewBox="0 0 760 320" role="img" aria-label="전체 기업 월별 주가 비교 차트">
        <title>전체 기업 월별 주가 비교</title>
        {[22, 86, 150, 214, 278].map(y => <line key={y} x1="62" x2="736" y1={y} y2={y} className="price-chart__grid" />)}
        <text x="8" y="28" className="price-chart__axis">{compactPrice(graph.maximum)}</text>
        <text x="8" y="282" className="price-chart__axis">{compactPrice(graph.minimum)}</text>
        {visibleGroups.map(group => {
          const seriesState = !selected ? 'active' : group.company.companyId === selectedCompanyId ? 'selected' : 'muted'
          const points = group.points.map(point => `${point.x},${point.y}`).join(' ')
          return <g key={group.company.companyId} className={`company-series company-series--${seriesState}`} style={{ '--series-color': group.style.color }} aria-label={`${group.company.name} 주가선`}>
            <polyline points={points} className="company-series__line" strokeDasharray={group.style.dash || undefined} />
            {group.points.map(point => <g key={point.key}>
              <circle cx={point.x} cy={point.y} r={point.event ? 5.5 : 3.5} className={`company-series__point${point.event ? ' company-series__point--event' : ''}`} />
              <title>{`${group.company.name} · ${point.label} · ${money(point.price)}${point.event ? ` · ${point.event.title}` : ''}`}</title>
            </g>)}
            {seriesState === 'selected' && <text x={group.points.at(-1).x - 4} y={group.points.at(-1).y - 9} textAnchor="end" className="company-series__label">{group.company.name}</text>}
          </g>
        })}
      </svg>
    </div>
    {selected && <PriceTimeline points={visibleGroups.find(group => group.company.companyId === selectedCompanyId)?.points || []} />}
  </>
}

function PriceTimeline({ points }) {
  return <ul className="price-timeline" aria-label="주가 변동 상세">
    {points.map(point => <li key={point.key}>
      <span className={`timeline-dot timeline-dot--${point.snapshotType.toLowerCase()}`} />
      <div><strong>{point.label}</strong>{point.event && <span>{point.event.title}</span>}</div>
      <div><strong>{money(point.price)}</strong><span className={point.changeRate > 0 ? 'market-up' : point.changeRate < 0 ? 'market-down' : ''}>{point.changeRate > 0 ? '+' : ''}{point.changeRate}%</span></div>
    </li>)}
  </ul>
}

function compactPrice(value) {
  if (!Number.isFinite(value)) return '—'
  if (value >= 10000) return `${Math.round(value / 1000)}천`
  return value.toLocaleString('ko-KR')
}

export default function PriceHistoryPanel({ companyId = '', onCompanyChange = () => {}, revision }) {
  const [state, setState] = useState({ data: null, error: '', loading: false })
  const [selectedRound, setSelectedRound] = useState(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setState(previous => ({ ...previous, error: '', loading: true }))
    getAllPriceHistories(controller.signal).then(data => {
      if (active) setState({ data, error: '', loading: false })
    }).catch(error => {
      if (active && error.name !== 'AbortError') setState(previous => ({ ...previous, error: historyError(error), loading: false }))
    })
    return () => { active = false; controller.abort() }
  }, [revision, retry])
  const histories = state.data?.companies || []
  const availableRounds = [...new Set(histories.flatMap(item => item.history.map(period => period.round)))].sort((a, b) => a - b)
  const effectiveRound = selectedRound !== null && availableRounds.includes(selectedRound) ? selectedRound : null
  const groups = useMemo(() => multiPriceSeries(histories, effectiveRound), [histories, effectiveRound])
  const selectedCompany = histories.find(item => item.company.companyId === companyId)?.company
  const selectCompany = id => onCompanyChange(id === companyId ? '' : id)
  return <Panel title="전체 종목 주가 비교">
    <header className="market-chart-header">
      <div><p className="eyebrow">MARKET COMPARISON</p><h3>{selectedCompany?.name || '전체 기업'}</h3><p>{selectedCompany?.description || '범례에서 기업을 선택하면 해당 주가선과 사건 지점을 강조합니다.'}</p></div>
      <span className="stock-status stock-status--active">{histories.length}개 종목</span>
    </header>
    {histories.length > 0 && <div className="company-chart-legend" role="group" aria-label="기업 주가선 선택">
      {groups.map(group => <button type="button" key={group.company.companyId} aria-pressed={companyId === group.company.companyId} onClick={() => selectCompany(group.company.companyId)} style={{ '--series-color': group.style.color }}>
        <svg className="company-chart-legend__line" viewBox="0 0 36 8" aria-hidden="true"><line x1="1" x2="35" y1="4" y2="4" strokeDasharray={group.style.dash || undefined} /></svg>
        <span>{group.company.name}</span><small>{group.company.companyId}</small>
      </button>)}
    </div>}
    {availableRounds.length > 0 && <div className="history-round-tabs" role="group" aria-label="차트 조회 월">
      <button type="button" aria-pressed={effectiveRound === null} onClick={() => setSelectedRound(null)}>전체</button>
      {availableRounds.map(round => <button type="button" key={round} aria-pressed={effectiveRound === round} onClick={() => setSelectedRound(round)}>{round}월</button>)}
    </div>}
    {state.loading && !state.data && <p role="status">전체 주가 이력을 불러오고 있습니다.</p>}
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.data && <MultiPriceChart companies={groups} selectedCompanyId={companyId} />}
    {state.error && <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>주가 이력 업데이트</button>}
  </Panel>
}
