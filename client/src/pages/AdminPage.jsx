import Panel from '../components/Panel'
import StatCard from '../components/StatCard'
import PageLayout from '../layouts/PageLayout'

const controls = ['게임 시작', '일시정지', '재개', '종료', '거래 중지', '거래 재개']

function AdminPage() {
  return (
    <PageLayout title="관리자 대시보드" subtitle="관리 버튼은 현재 UI만 제공하며 서버 동작과 연결되지 않습니다.">
      <div className="stats-grid">
        <StatCard label="현재 게임 상태" value="대기 중" tone="accent" />
        <StatCard label="현재 월" value="1월" />
        <StatCard label="남은 시간" value="10:00" />
        <StatCard label="접속 참가자 수" value="0명" />
        <StatCard label="거래 상태" value="중지" />
      </div>
      <Panel title="게임 제어">
        <div className="control-grid">
          {controls.map((control) => <button className="secondary-button" key={control} type="button">{control}</button>)}
        </div>
      </Panel>
    </PageLayout>
  )
}

export default AdminPage
