import { Link, Outlet, useOutletContext } from 'react-router-dom'
import PageShell from '../layouts/PageShell'
import NavigationGuard from '../navigation/NavigationGuard'
import { adminMenu } from '../navigation/menus'
import AdminResults from '../admin/AdminResults'
import IntelligenceManager from '../intelligence/IntelligenceManager'
import { intelligenceEnabled } from '../intelligence/api'
import CompanyManager from '../companies/CompanyManager'
import ParticipantPanel from '../admin/ParticipantPanel'
import ResetPanel from '../admin/ResetPanel'
import { useParticipants } from '../admin/useParticipants'
import AdminGate from '../admin/AdminGate'
import EventManager from '../events/EventManager'
import { useState } from 'react'
import AdminDashboard from '../components/AdminDashboard'
import { useGame } from '../game/useGame'

function AdminWorkspace({ adminPassword }) {
  const [intelligenceBusy, setIntelligenceBusy] = useState(false)
  const [intelligenceVersion, setIntelligenceVersion] = useState(0)
  const [companiesBusy, setCompaniesBusy] = useState(false)
  const [companyVersion, setCompanyVersion] = useState(0)
  const [assetsBusy, setAssetsBusy] = useState(false)
  const [eventsBusy, setEventsBusy] = useState(false)
  const gameState = useGame(adminPassword)
  const participants = useParticipants(adminPassword, gameState.snapshot)
  const [resetBusy, setResetBusy] = useState(false)
  const [eventVersion, setEventVersion] = useState(0)
  const busy = gameState.pending || eventsBusy || resetBusy || companiesBusy || intelligenceBusy || assetsBusy
  const [confirmEnd, setConfirmEnd] = useState(false)
  const handleControl = (action) => {
    if (busy) return
    if (action === 'end') setConfirmEnd(true)
    else gameState.control(action)
  }
  const screens = {
    overview: (<><AdminDashboard {...gameState} game={{ ...gameState.game, connectedParticipants: participants.error || gameState.error ? null : participants.data?.onlineParticipants }} pending={busy} onControl={handleControl} />
<ResetPanel {...gameState} pending={gameState.pending || eventsBusy || companiesBusy || intelligenceBusy || assetsBusy} onBusy={setResetBusy} onReset={() => { participants.refresh(); setIntelligenceVersion(n => n + 1); setCompanyVersion(n => n + 1); setEventVersion(n => n + 1); setConfirmEnd(false) }} /></>),
    participants: (<ParticipantPanel {...participants} password={adminPassword} game={gameState.game} onBusy={setAssetsBusy} stale={gameState.loading || Boolean(gameState.error) || gameState.pending || resetBusy} />),
    companies: (<CompanyManager key={`companies-${companyVersion}`} password={adminPassword} game={gameState.game} stale={gameState.loading || Boolean(gameState.error) || gameState.pending || eventsBusy || resetBusy || intelligenceBusy || assetsBusy} onBusy={setCompaniesBusy} onChanged={() => setEventVersion(n => n + 1)} />),
    events: (<EventManager key={`events-${eventVersion}`} password={adminPassword} game={gameState.game} stale={gameState.loading || Boolean(gameState.error) || gameState.pending || companiesBusy || resetBusy || intelligenceBusy || assetsBusy} onBusy={setEventsBusy} />),
    intelligence: (intelligenceEnabled && <IntelligenceManager key={`intelligence-${intelligenceVersion}`} password={adminPassword} game={gameState.game} stale={gameState.loading || Boolean(gameState.error) || gameState.pending || eventsBusy || companiesBusy || resetBusy} onBusy={setIntelligenceBusy} /> || <p>정보 기능이 비활성화되어 있습니다.</p>),
    results: (<AdminResults revision={gameState.snapshot} />),
  }
  return (
    <NavigationGuard busy={Boolean(busy || confirmEnd)}>
    <PageShell area="admin" menu={adminMenu} gameState={gameState} actions={<Link className="header-button" to="/">관리자 잠금</Link>}>
      <Outlet context={screens} />
      {confirmEnd && <section className="end-confirmation" aria-label="게임 종료 확인">
        <h2>게임을 종료할까요?</h2>
        <p>종료하면 참가자의 거래가 중지됩니다.</p>
        <div className="control-grid">
          <button className="secondary-button" type="button" autoFocus onClick={() => setConfirmEnd(false)}>취소</button>
          <button className="primary-button" type="button" disabled={!gameState.canControl || busy} onClick={() => { setConfirmEnd(false); gameState.control('end') }}>종료 확정</button>
        </div>
      </section>}
    </PageShell>
    </NavigationGuard>
  )
}
export default function AdminPage() {
  return <AdminGate>{(adminPassword) => <AdminWorkspace adminPassword={adminPassword} />}</AdminGate>
}

export function AdminSection({ name }) { return useOutletContext()[name] }
