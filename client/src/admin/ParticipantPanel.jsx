import Panel from '../components/Panel'
import { money } from '../game/model'
export default function ParticipantPanel({ data, error, loading, updatedAt, refresh, stale }) {
  return <Panel title="참가자 현황">
    {loading && <p role="status">참가자 현황을 불러오고 있습니다.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {data && <>
      <p>전체 {data.participants.length}명 · 온라인 {data.onlineParticipants}명</p>
      <p className="trading-help">{error || stale ? '최신 상태를 확인하지 못했습니다. 아래는 마지막 조회 결과입니다.' : '같은 참가자가 여러 탭으로 접속해도 한 명으로 표시합니다.'}</p>
      {updatedAt && <p className="trading-help">마지막 조회: <time dateTime={updatedAt}>{new Date(updatedAt).toLocaleTimeString('ko-KR')}</time></p>}
      <ParticipantTable participants={data.participants} />
    </>}
    {!loading && !data && <p>확인된 참가자 정보가 없습니다.</p>}
    <button className="secondary-button" type="button" onClick={refresh}>참가자 다시 확인</button>
  </Panel>
}
export function ParticipantTable({ participants }) {
  if (!participants.length) return <p className="empty-state">등록된 참가자가 없습니다.</p>
  return <div className="table-wrap" tabIndex={0} role="region" aria-label="참가자 자산 표. 좁은 화면에서는 좌우로 스크롤하세요.">
    <table><caption>참가자별 접속 상태와 자산</caption><thead><tr>{['닉네임', '접속 상태', '보유 현금', '주식 평가액', '총자산', '보유 종목'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{participants.map(p => <tr key={p.userId}><th scope="row" className="participant-name">{p.nickname}</th><td>{p.online ? '온라인' : '오프라인'}</td><td>{money(p.cash)}</td><td>{money(p.stockValue)}</td><td>{money(p.totalAssets)}</td><td>{p.holdings.length ? <details><summary>{p.holdings.length}종목 보기</summary><ul className="participant-holdings">{p.holdings.map(h => <li key={h.companyId}>{h.name} · {h.quantity.toLocaleString('ko-KR')}주 · {money(h.marketValue)}</li>)}</ul></details> : '없음'}</td></tr>)}</tbody>
    </table>
  </div>
}
