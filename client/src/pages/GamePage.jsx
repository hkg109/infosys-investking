import { Outlet, useOutletContext } from 'react-router-dom'
import PageShell from '../layouts/PageShell'
import NavigationGuard from '../navigation/NavigationGuard'
import { gameMenu } from '../navigation/menus'
import { IntelligenceLibraryPanel, IntelligenceStorePanel } from '../intelligence/IntelligencePanel'
import { intelligenceEnabled } from '../intelligence/api'
import useIntelligenceStore from '../intelligence/useIntelligenceStore'
import RankingPanel from '../ranking/RankingPanel'
import EventNews from '../events/EventNews'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/users'
import { useSession } from '../auth/SessionContext'
import TradingPanel from '../components/TradingPanel'
import { useTrading } from '../trading/useTrading'
import { displayAccount } from '../trading/model'
import UserDashboard from '../components/UserDashboard'
import { useGame } from '../game/useGame'
import FloatingGameTimer from '../components/FloatingGameTimer'
import PriceHistoryPanel from '../trading/PriceHistoryPanel'
import TradeHistoryPanel from '../trading/TradeHistoryPanel'

function GamePage() {
  const navigate = useNavigate()
  const [floatingClock, setFloatingClock] = useState(false)
  const { logout, user, checkSession } = useSession()
  const gameState = useGame('', checkSession)
  const trading = useTrading(user.userId)
  const intelligence = useIntelligenceStore({ userId: user.userId, game: gameState.game, revision: gameState.snapshot, stale: gameState.loading || Boolean(gameState.error), onPurchased: trading.refresh, enabled: intelligenceEnabled })
  useEffect(() => { trading.refresh() }, [gameState.snapshot, trading.refresh])
  const snapshot = {
    ...gameState.snapshot,
    account: displayAccount(trading.account),
    stocks: trading.companies?.map((item) => ({ ...item, id: item.companyId })),
    holdings: trading.account?.holdings.filter((item) => item.quantity > 0),
  }
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [orderIntent, setOrderIntent] = useState(null)
  const orderIntentId = useRef(0)
  const selectedInitialCompany = useRef(false)
  const [logoutError, setLogoutError] = useState('')
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  useEffect(() => {
    const companies = trading.companies || []
    if (!companies.length) { setSelectedCompanyId(''); return }
    setSelectedCompanyId(current => {
      if (current && companies.some(company => company.companyId === current)) return current
      if (current || !selectedInitialCompany.current) {
        selectedInitialCompany.current = true
        return companies[0].companyId
      }
      return ''
    })
  }, [trading.companies])

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
  const openPortfolioOrder = (companyId, type) => {
    setSelectedCompanyId(companyId)
    setOrderIntent({ requestId: ++orderIntentId.current, companyId, type })
    navigate('/game/orders')
  }

  const screens = {
    market: (<UserDashboard showHoldings={false} game={gameState.game} snapshot={snapshot} selectedCompanyId={selectedCompanyId} onSelectCompany={id => { setSelectedCompanyId(id); navigate('/game/orders') }} />),
    news: (<EventNews game={gameState.game} revision={gameState.snapshot} />),
    orders: (<><UserDashboard showMarket={false} game={gameState.game} snapshot={snapshot} selectedCompanyId={selectedCompanyId} onSelectCompany={id => { setSelectedCompanyId(id); navigate('/game/orders') }} onOrder={openPortfolioOrder} />
<TradingPanel game={gameState.game} stale={gameState.loading || Boolean(gameState.error)} trading={trading} selectedCompanyId={selectedCompanyId} onSelectCompany={setSelectedCompanyId} orderIntent={orderIntent} /></>),
    history: (<><label>차트 종목<select value={selectedCompanyId} onChange={e => setSelectedCompanyId(e.target.value)}><option value="">종목 선택</option>{(trading.companies || []).map(item => <option key={item.companyId} value={item.companyId}>{item.name}</option>)}</select></label><PriceHistoryPanel companyId={selectedCompanyId} revision={gameState.snapshot} /><TradeHistoryPanel totalRounds={gameState.game?.totalRounds} revision={trading.account} /></>),
    ranking: (<RankingPanel userId={user.userId} game={gameState.game} revision={gameState.snapshot} />),
    intelligence: (intelligenceEnabled && <IntelligenceStorePanel store={intelligence} /> || <p>정보 기능이 비활성화되어 있습니다.</p>),
    library: (intelligenceEnabled && <IntelligenceLibraryPanel store={intelligence} /> || <p>정보 기능이 비활성화되어 있습니다.</p>),
    profile: (<section className="panel my-info" id="my-info" aria-label="내 정보">
        <h2>내 정보</h2>
        <p className="ranking-name"><strong>닉네임:</strong> {user.nickname}</p>
        <p>로그아웃 후에도 계정과 거래 내역은 남습니다. 같은 닉네임과 가입할 때 정한 4자리 PIN으로 복구할 수 있습니다.</p>
        <p>PIN은 보안을 위해 표시하지 않습니다. 로그아웃하기 전에 PIN을 기억하는지 확인하세요.</p>
        {trading.unresolved && <p className="trading-help">결과를 확인하지 못한 주문이 있습니다. 다시 로그인한 뒤 같은 주문을 확인할 수 있습니다.</p>}
        {trading.pending && <p role="status">주문 처리 중입니다. 처리가 끝나면 로그아웃할 수 있습니다.</p>}
        <button className="secondary-button" type="button" onClick={handleLogout} disabled={isLoggingOut || trading.pending}>{isLoggingOut ? '로그아웃 중...' : '로그아웃'}</button>
      </section>),
  }
  return <NavigationGuard busy={trading.pending || isLoggingOut}>
    <PageShell area="game" menu={gameMenu} gameState={gameState}>
      {logoutError && <p className="page-error" role="alert">{logoutError}</p>}
      <div className="game-clock-bar"><button type="button" className="secondary-button" onClick={() => setFloatingClock(value => !value)}>{floatingClock ? '타이머 본문에 고정' : '타이머 띄우기'}</button><FloatingGameTimer game={gameState.game} docked={!floatingClock} /></div>
      <Outlet context={screens} />
    </PageShell>
  </NavigationGuard>
}
export function GameSection({ name }) { return useOutletContext()[name] }
export default GamePage
