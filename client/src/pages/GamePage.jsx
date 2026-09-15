import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/users'
import { useSession } from '../auth/SessionContext'
import GameConnection from '../components/GameConnection'
import UserDashboard from '../components/UserDashboard'
import { useGame } from '../game/useGame'
import PageLayout from '../layouts/PageLayout'

function GamePage() {
  const gameState = useGame()
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
      subtitle={`${user.nickname}님으로 참가했습니다. 게임 진행과 투자 현황을 확인하세요.`}
      actions={<button className="header-button" type="button" onClick={handleLogout} disabled={isLoggingOut}>{isLoggingOut ? '로그아웃 중...' : '로그아웃'}</button>}
    >
      {logoutError && <p className="page-error" role="alert">{logoutError}</p>}
      <GameConnection {...gameState} />
      <UserDashboard game={gameState.game} snapshot={gameState.snapshot} />
    </PageLayout>
  )
}

export default GamePage
