import { money } from '../game/model'

export default function AssetStatusBar({ game, account, muted, onToggleMuted }) {
  const round = Number.isInteger(game?.currentRound) && game.currentRound > 0 ? `${game.currentRound} / ${game.totalRounds}월` : '대기'
  return <section className="asset-status-bar" aria-label="내 투자 현황">
    <dl>
      <div><dt>현재 월</dt><dd>{round}</dd></div>
      <div><dt>보유 현금</dt><dd>{money(account?.cash)}</dd></div>
      <div><dt>주식 평가액</dt><dd>{money(account?.stockValue)}</dd></div>
      <div><dt>총자산</dt><dd>{money(account?.totalAssets)}</dd></div>
    </dl>
    <button type="button" className="sound-toggle" aria-pressed={muted} onClick={onToggleMuted}>{muted ? '효과음 켜기' : '효과음 끄기'}</button>
  </section>
}
