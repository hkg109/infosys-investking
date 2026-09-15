import Panel from './Panel'
import StatCard from './StatCard'
import { formatTime, money, statusLabels } from '../game/model'

const messages = {
  WAITING: '게임 시작을 기다리고 있습니다.', RUNNING: '뉴스를 확인하고 투자 상황을 살펴보세요.',
  PAUSED: '게임이 일시정지되었습니다. 재개될 때까지 거래할 수 없습니다.', FINISHED: '게임이 종료되었습니다. 자산 현황을 확인하세요.',
}
export default function UserDashboard({ game, snapshot }) {
  const account = snapshot?.account
  const stocks = snapshot?.stocks
  const holdings = snapshot?.holdings
  const news = snapshot?.news
  return <>
    <section className="game-summary" aria-label="게임 진행 상태">
      <strong>{statusLabels[game?.status] || '확인 전'}</strong>
      <p>{messages[game?.status] || '게임 정보를 확인하면 투자 현황이 표시됩니다.'}</p>
      {game?.status === 'RUNNING' && <span>{game.tradingEnabled === true ? '거래 가능' : game.tradingEnabled === false ? '거래 마감 · 결과를 기다려 주세요.' : '거래 상태 확인 전'}</span>}
    </section>
    <div className="stats-grid">
      <StatCard label="현재 월" value={Number.isInteger(game?.currentRound) && game.currentRound > 0 ? `${game.currentRound}월` : '—'} tone="accent" />
      <StatCard label="남은 시간" value={formatTime(game?.remainingSeconds)} />
      <StatCard label="보유 현금" value={money(account?.cash)} />
      <StatCard label="주식 평가액" value={money(account?.stockValue)} />
      <StatCard label="총자산" value={money(account?.totalAssets)} tone="accent" />
    </div>
    <div className="content-grid">
      <Panel title="주식 종목 목록">
        {!Array.isArray(stocks) ? <p className="empty-state">종목 정보를 기다리고 있습니다.</p> : stocks.length === 0 ? <p className="empty-state">등록된 종목이 없습니다.</p> : <div className="table-wrap"><table>
          <caption className="sr-only">종목별 현재 주가</caption>
          <thead><tr><th scope="col">기업</th><th scope="col">현재가</th><th scope="col">등락률</th></tr></thead>
          <tbody>{stocks.map((stock) => <tr key={stock.id}><th scope="row">{stock.name}</th><td>{money(stock.currentPrice)}</td><td>{Number.isFinite(stock.changeRate) ? `${stock.changeRate > 0 ? '+' : ''}${stock.changeRate}%` : '—'}</td></tr>)}</tbody>
        </table></div>}
      </Panel>
      <Panel title="현재 뉴스">
        {!Array.isArray(news) ? <p className="empty-state">뉴스 정보를 기다리고 있습니다.</p> : news.length === 0 ? <p className="empty-state">아직 공개된 뉴스가 없습니다.</p> : <ul className="news-list">{news.map((item) => <li key={item.id}><h3>{item.title}</h3><p>{item.description}</p></li>)}</ul>}
      </Panel>
      <Panel title="보유 주식">
        {!Array.isArray(holdings) ? <p className="empty-state">보유 주식 정보를 기다리고 있습니다.</p> : holdings.length === 0 ? <p className="empty-state">아직 보유한 주식이 없습니다.</p> : <ul className="holdings-list">{holdings.map((item) => <li key={item.companyId}><strong>{item.name}</strong><span>{Number.isInteger(item.quantity) && item.quantity >= 0 ? `${item.quantity.toLocaleString('ko-KR')}주` : '—'}</span></li>)}</ul>}
      </Panel>
    </div>
  </>
}
