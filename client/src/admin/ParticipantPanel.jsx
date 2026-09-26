import { useState } from 'react'
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
export function ParticipantTable({ participants, onSelect = () => {} }) {
  if (!participants.length) return <p className="empty-state">등록된 참가자가 없습니다.</p>
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="참가자 자산 표. 좁은 화면에서는 좌우로 스크롤하세요.">
    <table><caption>참가자별 접속 상태와 자산. 종목별 상세는 관리자 전용 창에서 확인합니다.</caption><thead><tr>{['닉네임', '접속 상태', '보유 현금', '총자산', '보유 요약', '관리'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{participants.map(p => <tr key={p.userId}><th scope="row" className="participant-name">{p.nickname}</th><td>{p.online ? '온라인' : '오프라인'}</td><td>{money(p.cash)}</td><td>{money(p.totalAssets)}</td><td>{p.holdings.length ? `${p.holdings.length}종목 · ${p.holdings.reduce((sum, holding) => sum + holding.quantity, 0).toLocaleString('ko-KR')}주` : '없음'}</td><td><button type="button" className="detail-button" onClick={() => onSelect(p)} aria-label={`${p.nickname}의 자산 상세 보기`}>상세 보기</button></td></tr>)}</tbody>
    </table>
  </div>
}
