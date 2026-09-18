import { useEffect, useState } from 'react'
import Panel from '../components/Panel'
import { missionRequest, missionTypes, privateFailure } from './api'
export default function MissionPanel({userId, game, revision}) {
  const [state,setState]=useState({userId,data:null,error:''})
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    let active=true
    const controller=new AbortController()
    missionRequest('/me',{signal:controller.signal}).then(data=>{if(active)setState({userId,data,error:''})}).catch(error=>{if(active)setState(previous=>privateFailure(previous,userId,error))})
    return ()=>{active=false;controller.abort()}
  },[userId,revision,retry])
  const current=state.userId === userId ? state : {data:null,error:''}
  return <Panel title="내 비밀 미션">
    <p className="trading-help">미션과 진행도는 본인과 관리자만 볼 수 있습니다.</p>
    {current.error && <p role="alert" className="form-error">{current.error}{current.data && ' 아래는 마지막으로 확인한 정보입니다.'}</p>}
    {current.data ? <MissionResult data={current.data} status={game?.status}/> : <p>{current.error ? '확인된 미션 정보가 없습니다.' : '미션을 불러오고 있습니다.'}</p>}
    <button type="button" className="secondary-button" onClick={()=>setRetry(n=>n+1)}>미션 다시 확인</button>
  </Panel>
}
export function MissionResult({data,status}) {
  const m=data.mission
  return <div className="mission-result">
    <p className="mission-points">보유 정보 포인트 <strong>{data.points.toLocaleString('ko-KR')} P</strong></p>
    <p className="trading-help">포인트는 투자 현금과 별개이며 추가 시장정보 구매에 사용됩니다.</p>
    {!m ? <p>{status === 'WAITING' ? '게임 시작 시 활성 미션이 배정됩니다. 활성 미션이 없으면 미션 없이 진행합니다.' : '이 계정에 배정된 미션이 없습니다.'}</p> : <>
      <h3>{m.title}</h3><p>{m.description}</p>
      <p>{missionTypes[m.missionType][0]} · {missionTypes[m.missionType][3]} 서버 판정</p>
      <label>미션 진행도 <progress max={m.targetValue} value={Math.min(m.progress,m.targetValue)}/></label>
      <p>{m.progress.toLocaleString('ko-KR')} / {m.targetValue.toLocaleString('ko-KR')} {missionTypes[m.missionType][2]}</p>
      <p>완료 보상 {m.rewardPoints.toLocaleString('ko-KR')} P</p>
      <p className={m.status === 'COMPLETED' ? 'mission-completed' : ''}>{m.status === 'COMPLETED' ? '미션 완료 · 보상 지급 완료' : status === 'FINISHED' ? '게임 종료 · 미션 미완료' : '미션 진행 중'}</p>
      {m.rewardedAt && <p>보상 지급 시각 <time dateTime={m.rewardedAt}>{new Date(m.rewardedAt).toLocaleString('ko-KR')}</time></p>}
    </>}
  </div>
}
