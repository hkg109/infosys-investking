import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/users'
import { useSession } from '../auth/SessionContext'
import Panel from '../components/Panel'
import StatCard from '../components/StatCard'
import PageLayout from '../layouts/PageLayout'

const stocks = [
  { code: 'A', name: 'A 엔터', price: '10,000원' },
  { code: 'B', name: 'B IT', price: '12,500원' },
  { code: 'C', name: 'C 화학', price: '8,400원' },
]

function GamePage() {
  const navigate = useNavigate()
  const { logout, user } = useSession()
  const [logoutError, setLogoutError] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setLogoutError('')
    try {
      await logout()
      navigate('/', { replace: true })
    } catch (error) {
      setLogoutError(error instanceof ApiError && error.code === 'NETWORK_ERROR'
        ? '서버에 연결할 수 없어 로그아웃하지 못했습니다.'
        : '로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <PageLayout
      title="투자 현황"
      subtitle={`${user.nickname}님으로 참가했습니다. 자산과 주가 데이터는 다음 개발 단계에서 연결됩니다.`}
      actions={<button className="header-button" type="button" onClick={handleLogout} disabled={isLoggingOut}>{isLoggingOut ? '로그아웃 중...' : '로그아웃'}</button>}
    >
      {logoutError && <p className="page-error" role="alert">{logoutError}</p>}
      <div className="stats-grid">
        <StatCard label="현재 월" value="1월" tone="accent" />
        <StatCard label="남은 시간" value="09:32" />
        <StatCard label="보유 현금" value="1,000,000원" />
        <StatCard label="주식 평가액" value="0원" />
        <StatCard label="총자산" value="1,000,000원" tone="accent" />
      </div>

      <div className="content-grid">
        <Panel title="주식 종목 목록">
          <div className="table-wrap">
            <table>
              <thead><tr><th>코드</th><th>기업</th><th>현재가</th></tr></thead>
              <tbody>{stocks.map((stock) => <tr key={stock.code}><td>{stock.code}</td><td>{stock.name}</td><td>{stock.price}</td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
        <Panel title="현재 뉴스"><p className="news-item">정보시스템학과 모의투자 게임이 곧 시작됩니다.</p></Panel>
        <Panel title="보유 주식"><p className="empty-state">아직 보유한 주식이 없습니다.</p></Panel>
        <Panel title="현재 순위"><p className="ranking"><strong>1위</strong><span>투자왕</span><span>1,250,000원</span></p></Panel>
      </div>
    </PageLayout>
  )
}

export default GamePage
