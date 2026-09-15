export default function GameConnection({ loading, error, connected, refresh, pending }) {
  return <div className="dashboard-notice" role="status">
    <span>{loading ? '게임 정보를 불러오고 있습니다.' : error || (connected ? '실시간 연결됨' : '게임 정보를 주기적으로 확인하고 있습니다.')}</span>
    {!loading && <button className="secondary-button" type="button" disabled={pending} onClick={refresh}>다시 확인</button>}
  </div>
}
