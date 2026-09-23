import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { loadGameState } from '../../server/src/game-store.js'
import { createEvent, saveGameSchedule } from '../../server/src/events.js'
import { createMission } from '../../server/src/missions.js'
import { saveClue } from '../../server/src/intelligence.js'

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database')
const require = createRequire(new URL('../../server/package.json', import.meta.url))
const { Pool } = require('pg')
const schema = `ui_qa_${randomUUID().replaceAll('-', '')}`
const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
const url = new URL(process.env.TEST_DATABASE_URL)
url.searchParams.set('options', `-c search_path=${schema}`)
let database, child, vite, created = false, closing = false
async function close() {
  if (closing) return
  closing = true
  await vite?.close()
  if (child && child.exitCode === null && child.signalCode === null) {
    await new Promise(resolve => { child.once('exit', resolve); child.kill() })
  }
  await database?.end()
  if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
  await admin.end()
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => close().then(() => process.exit(0)))
try {
  await admin.query(`CREATE SCHEMA "${schema}"`); created = true
  database = new Pool({ connectionString: url.href })
  await database.query(await readFile(new URL('../../server/src/schema.sql', import.meta.url), 'utf8'))
  const defaults = { totalRounds: 1, roundDurationMs: 330000, tradingDurationMs: 300000 }
  await loadGameState(database, defaults)
  const first = await createEvent(database, {title:'QA 장중 수요 증가',news:'수요 증가 소식',result:'A 종목 10% 상승',effects:[{companyId:'A',changeRate:10}]})
  const last = await createEvent(database, {title:'QA 월 마감',news:'월말 실적 발표 예정',result:'A 종목 5% 하락',effects:[{companyId:'A',changeRate:-5}]})
  await saveGameSchedule(database,{rounds:[{round:1,events:[{eventId:first.eventId,triggerPhase:'INTRADAY',triggerOffsetSeconds:120,preannounceSeconds:10},{eventId:last.eventId,triggerPhase:'CLOSE'}]}]},{totalRounds:1,tradingDurationMs:300000,haltDurationMs:3000})
  await createMission(database,{title:'첫 종목 보유',description:'한 종목을 매수하세요.',missionType:'DIVERSIFIED_HOLDINGS',targetValue:1,rewardPoints:10,isActive:true})
  await saveClue(database,{getSnapshot:()=>({status:'WAITING',totalRounds:1})},null,{title:'QA 시장 단서',summary:'구매 후 확인',content:'QA 구매자 전용 내용',price:5,availableRound:1,isActive:true})
  child = spawn(process.execPath,[fileURLToPath(new URL('../../server/src/server.js',import.meta.url))],{env:{...process.env,DATABASE_URL:url.href,PORT:'0',CLIENT_URL:'http://127.0.0.1:4173',ADMIN_PASSWORD:'qa-ui-only',INITIAL_CASH:'1000000',NODE_ENV:'test'},stdio:['ignore','pipe','inherit']})
  const port = await new Promise((resolve,reject)=>{
    const timeout = setTimeout(() => reject(new Error('QA API startup timed out')), 15000)
    const done = value => { clearTimeout(timeout); resolve(value) }
    let output=''
    child.once('error',reject); child.once('exit',()=>reject(new Error('QA API exited')))
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/running on port (\d+)/);if(match)done(Number(match[1]))})
  })
  vite = await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{host:'127.0.0.1',port:4173,strictPort:true,proxy:{'/api/socket.io':{target:`http://127.0.0.1:${port}`,ws:true},'/api':`http://127.0.0.1:${port}`}}})
  await vite.listen()
  console.log('QA ready: http://127.0.0.1:4173 | admin: qa-ui-only | Ctrl+C cleans up the isolated schema')
} catch(error) { await close(); throw error }
