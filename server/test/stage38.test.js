import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {validateMonthlyEffects,validateSchedule,validateCompleteSchedule,validateEventInput} from '../src/events.js'
test('monthly rate limits include boundary values and reject either sign outside them',()=>{
 for(const [month,limit] of [[1,30],[6,30],[7,50],[12,50]]){
  for(const sign of [-1,1]){assert.doesNotThrow(()=>validateMonthlyEffects([{changeRate:sign*limit}],month));assert.throws(()=>validateMonthlyEffects([{changeRate:sign*(limit+1)}],month),{code:'EVENT_RATE_LIMIT'})}
 }
})
test('48-event content has unique 2-4 intraday assignments, safe timing, rates and public news',async()=>{
 const d=JSON.parse(await readFile(new URL('../../content/event-day-2026-09-27/content.json',import.meta.url),'utf8'))
 assert.equal(d.events.length,48)
 const keys=new Map(d.events.map(e=>[e.key,{...e,eventId:randomUUID()}]))
 const rounds=d.schedule.map(r=>({round:r.round,events:r.events.map(e=>({...e,eventId:keys.get(e.key).eventId}))}))
 assert.equal(validateSchedule({rounds},{...d.game,haltDurationMs:3000}).length,48)
 const flat=rounds.flatMap(r=>r.events.map(e=>({...e,round:r.round})))
 validateCompleteSchedule(flat,12)
 assert.equal(flat.filter(e=>e.triggerPhase==='INTRADAY').length,36)
 for(const r of d.schedule)for(const assignment of r.events){const e=keys.get(assignment.key);assert.equal(e.eventType,assignment.triggerPhase);validateMonthlyEffects(e.effects,r.round);validateEventInput(e);assert.ok(!d.companies.some(c=>e.news.includes(c.name)));if(e.eventType==='INTRADAY')assert.equal(assignment.triggerOffsetSeconds-assignment.newsRevealOffsetSeconds,30)}
 assert.throws(()=>validateCompleteSchedule(flat.filter(e=>e.round!==1),12),{code:'INTRADAY_COUNT_REQUIRED'})
 for(const c of d.clues){assert.ok(keys.has(c.eventKey));const target=d.schedule.find(r=>r.events.some(e=>e.key===c.eventKey));assert.ok(c.availableRound<=target.round)}
})
