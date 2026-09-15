import { useState } from 'react'
import AdminDashboard from '../components/AdminDashboard'
import GameConnection from '../components/GameConnection'
import PageLayout from '../layouts/PageLayout'
import { useGame } from '../game/useGame'

function AdminPage() {
  const [adminPassword, setAdminPassword] = useState('')
  const gameState = useGame(adminPassword)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const handleControl = (action) => {
    if (action === 'end') setConfirmEnd(true)
    else gameState.control(action)
  }
  return (
    <PageLayout title="관리자 대시보드" subtitle="게임 진행 상황을 확인하고 관리합니다.">
      <GameConnection {...gameState} />
      <section className="admin-credentials" aria-label="관리자 인증">
        <label htmlFor="admin-password">관리자 비밀번호</label>
        <input id="admin-password" type="password" autoComplete="off" value={adminPassword} disabled={gameState.pending} onChange={(event) => setAdminPassword(event.target.value)} />
        <p className="trading-help">제어 요청 시 서버에서 확인합니다. 페이지를 벗어나면 입력한 비밀번호가 지워집니다.</p>
      </section>
      <AdminDashboard {...gameState} onControl={handleControl} />
      {confirmEnd && <section className="end-confirmation" aria-label="게임 종료 확인">
        <h2>게임을 종료할까요?</h2>
        <p>종료하면 참가자의 거래가 중지됩니다.</p>
        <div className="control-grid">
          <button className="secondary-button" type="button" autoFocus onClick={() => setConfirmEnd(false)}>취소</button>
          <button className="primary-button" type="button" disabled={!gameState.canControl || gameState.pending} onClick={() => { setConfirmEnd(false); gameState.control('end') }}>종료 확정</button>
        </div>
      </section>}
    </PageLayout>
  )
}
export default AdminPage
