import { Link } from 'react-router-dom'
import { formatTime, money } from '../game/model.js'
import { sceneFor } from './model.js'
import { useBroadcast } from './useBroadcast.js'
import './broadcast.css'

const signedRate = value => `${value > 0 ? '+' : ''}${value}%`

function StockBoard({ market }) {
  return <section className="cast-card cast-market" tabIndex={0} aria-label="실시간 주가">
    <div className="cast-section-heading"><span>MARKET WATCH</span><h2>실시간 주가</h2></div>
    {market.length ? <ul>{market.map(stock => <li key={stock.companyId}>
      <span className="cast-stock-name"><strong>{stock.name}</strong><small>{stock.companyId}</small></span>
      <strong>{money(stock.currentPrice)}</strong>
      <span className={stock.changeRate > 0 ? 'cast-up' : stock.changeRate < 0 ? 'cast-down' : ''}>{signedRate(stock.changeRate)}</span>
    </li>)}</ul> : <p className="cast-empty">등록된 종목이 없습니다.</p>}
  </section>
}

function RankingBoard({ ranking, final = false }) {
  return <section className="cast-card cast-ranking" tabIndex={0} aria-label={final ? '최종 순위' : '실시간 순위'}>
    <div className="cast-section-heading"><span>{final ? 'FINAL LEADERBOARD' : 'LIVE LEADERBOARD'}</span><h2>{final ? '최종 순위' : '실시간 TOP 3'}</h2></div>
    <p className="cast-meta">참가자 {ranking.totalParticipants}명 · 이름 비공개</p>
    {ranking.top3.length ? <ol>{ranking.top3.map((person, index) => <li key={`${person.rank}-${index}`}>
      <span>{person.rank}위</span><strong>{money(person.totalAssets)}</strong>
    </li>)}</ol> : <p className="cast-empty">집계된 순위가 없습니다.</p>}
    {final && ranking.rankings.length > ranking.top3.length && <p className="cast-meta">전체 {ranking.totalParticipants}명 중 공동 3위까지 표시</p>}
  </section>
}

function NewsBoard({ news }) {
  return <section className="cast-card cast-news" aria-label="공개 뉴스">
    <div className="cast-section-heading"><span>NEWS DESK</span><h2>시장 뉴스</h2></div>
    {news.length ? <ul>{news.slice(-3).reverse().map(item => <li key={item.gameEventId}>
      <span>{item.triggerPhase === 'INTRADAY' ? '장중 속보' : '마감 뉴스'}</span>
      <strong>{item.title}</strong><p>{item.news}</p>
    </li>)}</ul> : <p className="cast-empty">공개된 뉴스가 없습니다.</p>}
  </section>
}

function ImpactList({ changes, market }) {
  if (!changes.length) return <p className="cast-empty">이번 사건으로 변동된 종목이 없습니다.</p>
  return <ul className="cast-impacts">{changes.map(change => <li key={change.companyId}>
    <span>{market.find(stock => stock.companyId === change.companyId)?.name || change.companyId}</span>
    <span>{money(change.previousPrice)} → {money(change.newPrice)}</span>
    <strong className={change.changeRate > 0 ? 'cast-up' : change.changeRate < 0 ? 'cast-down' : ''}>{signedRate(change.changeRate)}</strong>
  </li>)}</ul>
}

function MainScene({ data, scene, spotlight }) {
  const { game, market, ranking, news, results, warnings } = data
  if (scene === 'waiting') return <div className="cast-feature cast-feature--center"><p className="cast-kicker">READY TO INVEST</p><h1>곧 투자가 시작됩니다</h1><p>뉴스를 읽고 시장의 변화를 예측하세요.</p><RankingBoard ranking={ranking} /></div>
  if (scene === 'finalizing') return <div className="cast-feature cast-feature--center"><p className="cast-kicker">FINAL COUNTDOWN</p><h1>최종 순위 집계 중</h1><p>마지막 거래와 사건 결과를 반영하고 있습니다.</p><StockBoard market={market} /></div>
  if (scene === 'final') return <div className="cast-feature cast-feature--final"><p className="cast-kicker">THE FINAL RESULT</p><h1>투자왕이 결정되었습니다</h1><RankingBoard ranking={ranking} final /><p className="cast-footnote">총자산 기준 · 동점자는 같은 순위</p></div>
  if (scene === 'paused') return <div className="cast-feature cast-feature--center"><p className="cast-kicker">GAME PAUSED</p><h1>게임 일시정지</h1><p>진행자의 안내를 기다려 주세요. 남은 시간은 멈춰 있습니다.</p><div className="cast-two"><StockBoard market={market} /><RankingBoard ranking={ranking} /></div></div>
  if (scene === 'warning') {
    const warning = warnings.find(item => item.gameEventId === spotlight.eventId)
    return <div className="cast-feature cast-feature--alert"><p className="cast-kicker">BREAKING ALERT</p><h1>장중 사건 발생 예고</h1><p>시장에 영향을 줄 새로운 사건이 곧 공개됩니다.</p><p className="cast-alert-time">예정 시각 {warning ? new Date(warning.scheduledAt).toLocaleTimeString('ko-KR') : '확인 중'}</p><StockBoard market={market} /></div>
  }
  if (scene === 'breaking') {
    const result = results.find(item => item.gameEventId === spotlight.eventId)
    return <div className="cast-feature cast-feature--alert"><p className="cast-kicker">BREAKING NEWS</p><h1>{result?.title || '사건 결과 공개'}</h1><p>{result?.result}</p><ImpactList changes={result?.changes || []} market={market} /></div>
  }
  if (scene === 'result') return <div className="cast-grid cast-grid--result"><section className="cast-card cast-results" tabIndex={0} aria-label="월별 사건 결과"><div className="cast-section-heading"><span>MONTHLY CLOSE</span><h2>{game.currentRound}월 사건 결과</h2></div>{results.length ? results.map(item => <article key={item.gameEventId}><h3>{item.title}</h3><p>{item.result}</p><ImpactList changes={item.changes} market={market} /></article>) : <p className="cast-empty">이번 달 결과를 집계하고 있습니다.</p>}</section><div className="cast-side"><StockBoard market={market} /><RankingBoard ranking={ranking} /></div></div>
  return <div className="cast-grid"><StockBoard market={market} /><div className="cast-side"><RankingBoard ranking={ranking} /><NewsBoard news={news} /></div></div>
}

export function BroadcastScreen({ data, error, spotlight, remainingSeconds }) {
  const scene = sceneFor(data, spotlight)
  const round = data?.game.currentRound ? `${data.game.currentRound}월` : '시작 전'
  const stateLabel = ({ waiting: '대기', market: data?.game.tradingHalted ? '거래 일시중단' : '거래 진행', warning: '사건 예고', breaking: '속보', result: '월 결과', paused: '일시정지', finalizing: '최종 집계', final: '게임 종료' })[scene] || '연결 중'
  return <div className={`cast-stage cast-stage--${scene}`}>
    <header className="cast-header"><div className="cast-brand"><span>INFOSYS</span><strong>INVEST<span>KING</span></strong></div><div className="cast-round"><span>MARKET SESSION</span><strong>{round} · {stateLabel}</strong></div><div className="cast-clock"><span>남은 시간</span><strong>{error ? '—' : formatTime(remainingSeconds)}</strong></div></header>
    {error && <div className="cast-connection" role="alert">{error} · 마지막 확인된 화면을 표시 중</div>}
    <main className="cast-main" aria-live="polite">{data ? <MainScene data={data} scene={scene} spotlight={spotlight} /> : <div className="cast-feature cast-feature--center"><p className="cast-kicker">INVESTKING LIVE</p><h1>중계 화면 연결 중</h1><p>{error || '실시간 시장 정보를 불러오고 있습니다.'}</p></div>}</main>
    <footer className="cast-footer"><span className="cast-live-dot" /> <strong>LIVE</strong><span>익명 중계 · 개인 정보는 표시하지 않습니다</span><span>{data ? `참가자 ${data.ranking.totalParticipants}명` : '연결 대기'}</span></footer>
  </div>
}

export default function BroadcastPage() {
  const state = useBroadcast()
  const fullscreen = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()
  return <div className="broadcast-page"><nav className="cast-controls" aria-label="중계 화면 제어"><Link to="/">참가 화면</Link><button type="button" onClick={fullscreen}>전체 화면 전환</button></nav><BroadcastScreen {...state} /></div>
}
