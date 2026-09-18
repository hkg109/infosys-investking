import RankingPanel from '../ranking/RankingPanel'
import EventNews from '../events/EventNews'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/users'
import { useSession } from '../auth/SessionContext'
import GameConnection from '../components/GameConnection'
import TradingPanel from '../components/TradingPanel'
import { useTrading } from '../trading/useTrading'
import { displayAccount } from '../trading/model'
import UserDashboard from '../components/UserDashboard'
import { useGame } from '../game/useGame'
import PageLayout from '../layouts/PageLayout'
import FloatingGameTimer from '../components/FloatingGameTimer'

function GamePage() {
  const navigate = useNavigate()
  const { logout, user, checkSession } = useSession()
  const gameState = useGame('', checkSession)
  const trading = useTrading(user.userId)
  useEffect(() => { trading.refresh() }, [gameState.snapshot, trading.refresh])
  const snapshot = {
    ...gameState.snapshot,
    account: displayAccount(trading.account),
    stocks: trading.companies?.map((item) => ({ ...item, id: item.companyId })),
    holdings: trading.account?.holdings.filter((item) => item.quantity > 0),
  }
  const [showInfo, setShowInfo] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (isLoggingOut || trading.pending) return
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
      wide
      title="투자 현황"
      subtitle={`${user.nickname}님으로 참가했습니다. 게임 진행과 투자 현황을 확인하세요.`}
      actions={<button className="header-button" type="button" aria-expanded={showInfo} aria-controls="my-info" onClick={() => setShowInfo(value => !value)}>내 정보</button>}
    >
      {showInfo && <section className="panel my-info" id="my-info" aria-label="내 정보">
        <h2>내 정보</h2>
        <p className="ranking-name"><strong>닉네임:</strong> {user.nickname}</p>
        <p>로그아웃 후에도 계정과 거래 내역은 남습니다. 같은 닉네임과 가입할 때 정한 4자리 PIN으로 복구할 수 있습니다.</p>
        <p>PIN은 보안을 위해 표시하지 않습니다. 로그아웃하기 전에 PIN을 기억하는지 확인하세요.</p>
        {trading.unresolved && <p className="trading-help">결과를 확인하지 못한 주문이 있습니다. 다시 로그인한 뒤 같은 주문을 확인할 수 있습니다.</p>}
        {trading.pending && <p role="status">주문 처리 중입니다. 처리가 끝나면 로그아웃할 수 있습니다.</p>}
        <button className="secondary-button" type="button" onClick={handleLogout} disabled={isLoggingOut || trading.pending}>{isLoggingOut ? '로그아웃 중...' : '로그아웃'}</button>
      </section>}
      {logoutError && <p className="page-error" role="alert">{logoutError}</p>}
      <GameConnection {...gameState} />
      <FloatingGameTimer game={gameState.game} />
      <div className="game-dashboard-grid">
        <div className="game-dashboard-column game-dashboard-column--trade">
          <UserDashboard game={gameState.game} snapshot={snapshot} />
          <TradingPanel game={gameState.game} stale={gameState.loading || Boolean(gameState.error)} trading={trading} />
        </div>
        <div className="game-dashboard-column game-dashboard-column--news">
          <EventNews game={gameState.game} revision={gameState.snapshot} />
          <RankingPanel userId={user.userId} game={gameState.game} revision={gameState.snapshot} />
        </div>
      </div>
    </PageLayout>
  )
}

export default GamePage
