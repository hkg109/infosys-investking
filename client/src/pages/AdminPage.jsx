import MissionManager from '../missions/MissionManager'
import CompanyManager from '../companies/CompanyManager'
import ParticipantPanel from '../admin/ParticipantPanel'
import ResetPanel from '../admin/ResetPanel'
import { useParticipants } from '../admin/useParticipants'
import AdminGate from '../admin/AdminGate'
import EventManager from '../events/EventManager'
import { useState } from 'react'
import AdminDashboard from '../components/AdminDashboard'
import GameConnection from '../components/GameConnection'
import PageLayout from '../layouts/PageLayout'
import { useGame } from '../game/useGame'

function AdminWorkspace({ adminPassword, lock }) {
  const [missionsBusy, setMissionsBusy] = useState(false)
  const [missionVersion, setMissionVersion] = useState(0)
  const [companiesBusy, setCompaniesBusy] = useState(false)
  const [companyVersion, setCompanyVersion] = useState(0)
  const [eventsBusy, setEventsBusy] = useState(false)
  const gameState = useGame(adminPassword)
  const participants = useParticipants(adminPassword, gameState.snapshot)
  const [resetBusy, setResetBusy] = useState(false)
  const [eventVersion, setEventVersion] = useState(0)
  const busy = gameState.pending || eventsBusy || resetBusy || companiesBusy || missionsBusy
  const [confirmEnd, setConfirmEnd] = useState(false)
  const handleControl = (action) => {
    if (busy) return
    if (action === 'end') setConfirmEnd(true)
    else gameState.control(action)
  }
  return (
    <PageLayout title="관리자 대시보드" subtitle="게임 진행 상황을 확인하고 관리합니다." actions={<button className="header-button" type="button" disabled={busy} onClick={lock}>관리자 잠금</button>}>
      <GameConnection {...gameState} />
      <AdminDashboard {...gameState} game={{ ...gameState.game, connectedParticipants: participants.error || gameState.error ? null : participants.data?.onlineParticipants }} pending={busy} onControl={handleControl} />
      <ParticipantPanel {...participants} stale={Boolean(gameState.error)} />
      <ResetPanel {...gameState} pending={gameState.pending || eventsBusy || companiesBusy || missionsBusy} onBusy={setResetBusy} onReset={() => { participants.refresh(); setMissionVersion(n => n + 1); setCompanyVersion(n => n + 1); setEventVersion(n => n + 1); setConfirmEnd(false) }} />
      <CompanyManager key={`companies-${companyVersion}`} password={adminPassword} game={gameState.game} stale={gameState.loading || Boolean(gameState.error) || gameState.pending || eventsBusy || resetBusy || missionsBusy} onBusy={setCompaniesBusy} onChanged={() => setEventVersion(n => n + 1)} />
      <EventManager key={`events-${eventVersion}`} password={adminPassword} game={gameState.game} stale={gameState.loading || Boolean(gameState.error) || gameState.pending || companiesBusy || resetBusy || missionsBusy} onBusy={setEventsBusy} />
      <MissionManager key={`missions-${missionVersion}`} password={adminPassword} game={gameState.game} stale={gameState.loading || Boolean(gameState.error) || gameState.pending || eventsBusy || companiesBusy || resetBusy} onBusy={setMissionsBusy} />
      {confirmEnd && <section className="end-confirmation" aria-label="게임 종료 확인">
        <h2>게임을 종료할까요?</h2>
        <p>종료하면 참가자의 거래가 중지됩니다.</p>
        <div className="control-grid">
          <button className="secondary-button" type="button" autoFocus onClick={() => setConfirmEnd(false)}>취소</button>
          <button className="primary-button" type="button" disabled={!gameState.canControl || busy} onClick={() => { setConfirmEnd(false); gameState.control('end') }}>종료 확정</button>
        </div>
      </section>}
    </PageLayout>
  )
}
export default function AdminPage() {
  return <AdminGate>{(adminPassword, lock) => <AdminWorkspace adminPassword={adminPassword} lock={lock} />}</AdminGate>
}
