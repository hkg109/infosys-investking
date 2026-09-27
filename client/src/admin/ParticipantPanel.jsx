import { Fragment, useState } from 'react'
import Panel from '../components/Panel'
import AssetEditor from './AssetEditor'
import { money } from '../game/model'
export default function ParticipantPanel({ data, error, loading, updatedAt, refresh, stale, password, game, onBusy }) {
  const [selected, setSelected] = useState(null)
  return <Panel title="참가자 현황">
    {loading && <p role="status">참가자 현황을 불러오고 있습니다.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {data && <>
      <p>전체 {data.participants.length}명 · 온라인 {data.onlineParticipants}명</p>
      <p className="trading-help">{error || stale ? '최신 상태를 확인하지 못했습니다. 아래는 마지막 조회 결과입니다.' : '같은 참가자가 여러 탭으로 접속해도 한 명으로 표시합니다.'}</p>
      {updatedAt && <p className="trading-help">마지막 조회: <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleTimeString('ko-KR')}</time></p>}
      <ParticipantTable participants={data.participants} onSelect={setSelected} />
    </>}
    {!loading && !data && <p>확인된 참가자 정보가 없습니다.</p>}
    <button className="secondary-button" type="button" onClick={refresh}>참가자 업데이트</button>
    {selected && <AssetEditor key={selected.userId} participant={selected} password={password} game={game} stale={stale} onBusy={onBusy} onChanged={refresh} onClose={() => setSelected(null)} />}
  </Panel>
}
export function ParticipantTable({ participants, onSelect = () => {}, initialExpanded = [] }) {
  const [expanded, setExpanded] = useState(() => new Set(initialExpanded))
  if (!participants.length) return <p className="empty-state">등록된 참가자가 없습니다.</p>
  const toggle = userId => setExpanded(current => {
    const next = new Set(current)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    return next
  })
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="참가자 자산 표. 좁은 화면에서는 좌우로 스크롤하세요.">
    <table className="participant-table"><caption>참가자별 접속 상태와 자산. 보유 종목 버튼을 누르면 기업별 수량과 평가액을 확인할 수 있습니다.</caption><thead><tr>{['참가자', '접속', '현금', '주식 평가액', '총자산', '보유 종목', '관리'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{participants.map(p => {
        const detailId = `participant-holdings-${p.userId}`
        const isOpen = expanded.has(p.userId)
        return <Fragment key={p.userId}>
          <tr className="participant-row"><th scope="row" className="participant-name">{p.nickname}</th><td data-label="접속"><span className={`presence-badge presence-badge--${p.online ? 'online' : 'offline'}`}>{p.online ? '접속 중' : '오프라인'}</span></td><td data-label="현금" className="numeric-cell">{money(p.cash)}</td><td data-label="주식 평가액" className="numeric-cell">{money(p.stockValue)}</td><td data-label="총자산" className="numeric-cell participant-total">{money(p.totalAssets)}</td><td data-label="보유 종목"><button type="button" className="holdings-toggle" aria-expanded={isOpen} aria-controls={detailId} onClick={() => toggle(p.userId)}>{p.holdings.length ? `${p.holdings.length}개` : '보유 종목 없음'}</button></td><td data-label="관리"><button type="button" className="detail-button" onClick={() => onSelect(p)} aria-label={`${p.nickname} 자산 수정`}>자산 수정</button></td></tr>
          {isOpen && <tr className="participant-holdings-row"><td colSpan="7"><section id={detailId} aria-label={`${p.nickname} 보유 종목 상세`}>
            {!p.holdings.length ? <p className="empty-state">보유 종목 없음</p> : <table className="holdings-detail-table"><thead><tr><th scope="col">기업</th><th scope="col">상태</th><th scope="col">수량</th><th scope="col">현재가</th><th scope="col">평가액</th></tr></thead><tbody>{p.holdings.map(holding => <tr key={holding.companyId}><th scope="row">{holding.name}</th><td>{holding.active === false ? '비활성' : '거래 가능'}</td><td className="numeric-cell">{holding.quantity.toLocaleString('ko-KR')}주</td><td className="numeric-cell">{money(holding.currentPrice)}</td><td className="numeric-cell">{money(holding.marketValue)}</td></tr>)}</tbody></table>}
          </section></td></tr>}
        </Fragment>
      })}</tbody>
    </table>
  </div>
}
