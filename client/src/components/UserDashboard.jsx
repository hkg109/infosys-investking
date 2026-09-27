import { useState } from 'react'
import Panel from './Panel'
import CompanyInfoPopover from './CompanyInfoPopover'
import { money } from '../game/model'
export default function UserDashboard({ game, snapshot, selectedCompanyId, onSelectCompany, onOrder, showMarket = true, showHoldings = true }) {
  const [openCompanyId, setOpenCompanyId] = useState('')
  const account = snapshot?.account
  const stocks = snapshot?.stocks
  const holdings = snapshot?.holdings
  return <>
    <div className="portfolio-grid">
      {showMarket && <Panel title="시장 종목">
        {!Array.isArray(stocks) ? <p className="empty-state">종목 정보를 기다리고 있습니다.</p> : stocks.length === 0 ? <p className="empty-state">등록된 종목이 없습니다.</p> : <div className="table-wrap"><table>
          <caption>종목별 현재 주가 · 기업 이름을 누르면 상세 설명을 확인할 수 있습니다.</caption>
          <thead><tr><th scope="col">기업</th><th scope="col">현재가</th><th scope="col">초기 대비</th></tr></thead>
          <tbody>{stocks.map((stock) => <tr key={stock.id} className={selectedCompanyId === stock.id ? 'stock-row--selected' : undefined}>
            <th scope="row"><CompanyInfoPopover company={stock} selected={selectedCompanyId === stock.id} open={openCompanyId === stock.id} onToggle={() => setOpenCompanyId(current => current === stock.id ? '' : stock.id)} onClose={() => setOpenCompanyId('')} onTrade={onSelectCompany} /></th>
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
