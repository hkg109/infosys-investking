import { useEffect, useState } from 'react'
import { getBroadcast } from '../broadcast/api'
import { money } from '../game/model'
import Panel from '../components/Panel'
export default function AdminResults({ revision }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    getBroadcast(controller.signal).then(value => { if (active) { setData(value); setError('') } })
      .catch(() => { if (active) setError('결과를 확인하지 못했습니다. 다시 조회해 주세요.') })
      .finally(() => clearTimeout(timeout))
    return () => { active = false; controller.abort(); clearTimeout(timeout) }
  }, [revision, retry])
  return <>
    <Panel title="이번 달 공개된 사건 결과">
      {error && <p role="alert">{error}</p>}
      {!data ? <p>결과를 불러오고 있습니다.</p> : !data.results.length ? <p>공개된 결과가 없습니다.</p> : data.results.map(result => <article key={result.gameEventId}><h3>{result.title}</h3><p>{result.result}</p><ul>{result.changes.map(change => <li key={change.companyId}>{change.companyId} · {money(change.previousPrice)} → {money(change.newPrice)}</li>)}</ul></article>)}
    </Panel>
    <Panel title={data?.ranking.final ? '확정된 최종 순위' : '현재 순위'}>
      <p>초기화 전에 결과를 확인하세요. 이름은 참가자 메뉴에서 확인할 수 있습니다.</p>
      {data?.ranking.rankings.length ? <ol>{data.ranking.rankings.map((row, index) => <li key={index}>{row.rank}위 · {money(row.totalAssets)}</li>)}</ol> : <p>집계된 순위가 없습니다.</p>}
      <button type="button" className="secondary-button" onClick={() => setRetry(n => n + 1)}>결과 업데이트</button>
    </Panel>
  </>
}
