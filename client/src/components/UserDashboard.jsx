import Panel from './Panel'
import StatCard from './StatCard'
import { money, statusLabels } from '../game/model'

const messages = {
  WAITING: '게임 시작을 기다리고 있습니다.', RUNNING: '뉴스를 확인하고 투자 상황을 살펴보세요.',
  PAUSED: '게임이 일시정지되었습니다. 재개될 때까지 거래할 수 없습니다.', FINISHED: '게임이 종료되었습니다. 자산 현황을 확인하세요.',
}
export default function UserDashboard({ game, snapshot, selectedCompanyId, onSelectCompany, onOrder, showMarket = true, showHoldings = true }) {
  const account = snapshot?.account
  const stocks = snapshot?.stocks
  const holdings = snapshot?.holdings
  return <>
    <section className="game-summary" aria-label="게임 진행 상태">
      <strong>{statusLabels[game?.status] || '확인 전'}</strong>
      <p>{messages[game?.status] || '게임 정보를 확인하면 투자 현황이 표시됩니다.'}</p>
      {game?.status === 'RUNNING' && <span>{game.tradingEnabled === true ? '거래 가능' : game.tradingEnabled === false ? '거래 마감 · 사건 결과를 확인하세요.' : '거래 상태 확인 전'}</span>}
    </section>
    <div className="stats-grid">
      <StatCard label="현재 월" value={Number.isInteger(game?.currentRound) && game.currentRound > 0 ? `${game.currentRound}월` : '—'} tone="accent" />
      <StatCard label="보유 현금" value={money(account?.cash)} />
      <StatCard label="주식 평가액" value={money(account?.stockValue)} />
      <StatCard label="총자산" value={money(account?.totalAssets)} tone="accent" />
    </div>
    <div className="portfolio-grid">
      {showMarket && <Panel title="시장 종목">
        {!Array.isArray(stocks) ? <p className="empty-state">종목 정보를 기다리고 있습니다.</p> : stocks.length === 0 ? <p className="empty-state">등록된 종목이 없습니다.</p> : <div className="table-wrap"><table>
          <caption>종목별 현재 주가 · 종목을 누르면 주문 화면으로 이동합니다.</caption>
          <thead><tr><th scope="col">기업</th><th scope="col">현재가</th><th scope="col">초기 대비</th></tr></thead>
          <tbody>{stocks.map((stock) => <tr key={stock.id} className={selectedCompanyId === stock.id ? 'stock-row--selected' : undefined}>
            <th scope="row"><button type="button" className="stock-select" aria-pressed={selectedCompanyId === stock.id} onClick={() => onSelectCompany?.(stock.id)}>{stock.name}<small>{stock.id}</small></button></th>
            <td>{money(stock.currentPrice)}</td>
            <td className={stock.changeRate > 0 ? 'market-up' : stock.changeRate < 0 ? 'market-down' : ''}>{Number.isFinite(stock.changeRate) ? `${stock.changeRate > 0 ? '+' : ''}${stock.changeRate}%` : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      </Panel>}
      {showHoldings && <Panel title="내 포트폴리오">
        {!Array.isArray(holdings) ? <p className="empty-state">보유 주식 정보를 기다리고 있습니다.</p> : holdings.length === 0 ? <p className="empty-state">아직 보유한 주식이 없습니다.</p> : <ul className="holdings-list portfolio-holdings">{holdings.map((item) => {
          const tradable = Array.isArray(stocks) && stocks.some(stock => stock.id === item.companyId)
          return <li key={item.companyId}>
            <div className="holding-description"><strong>{item.name}</strong><span>{Number.isInteger(item.quantity) && item.quantity >= 0 ? `${item.quantity.toLocaleString('ko-KR')}주 · 현재가 ${money(item.currentPrice)}` : '—'}</span></div>
            <strong className="holding-value">{money(item.marketValue)}</strong>
            <div className="holding-actions"><button type="button" className="secondary-button" disabled={!tradable} onClick={() => onOrder?.(item.companyId, 'BUY')}>추가 매수</button><button type="button" className="secondary-button" disabled={!tradable} onClick={() => onOrder?.(item.companyId, 'SELL')}>매도</button></div>
            {!tradable && <span className="trading-help">현재 거래가 중단된 종목입니다.</span>}
          </li>
        })}</ul>}
      </Panel>}
    </div>
  </>
}
