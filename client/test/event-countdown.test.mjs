import {test} from 'node:test'
import assert from 'node:assert/strict'
import {eventCountdown} from '../src/events/countdown.js'
const game={status:'RUNNING',phase:'TRADING',remainingSeconds:200,tradingDurationSeconds:270,currentRound:1}
test('news uses event deadline and freezes while paused, never showing negative time',()=>{
 const e={triggerPhase:'INTRADAY',triggerOffsetSeconds:139,round:1}
 assert.equal(eventCountdown(e,game,9),'사건 반영까지 60초')
 assert.equal(eventCountdown(e,{...game,status:'PAUSED',phase:'PAUSED',phaseBeforePause:'TRADING'},99),'일시정지 · 사건 반영까지 69초')
 assert.equal(eventCountdown({...e,triggerPhase:'CLOSE'},game,9),'거래 마감까지 191초')
 assert.equal(eventCountdown(e,game,500),'주가 반영 확인 중')
 assert.equal(eventCountdown({...e,applied:true},game),'반영 완료')
})
