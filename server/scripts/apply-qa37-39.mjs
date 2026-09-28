// Apply only to a reset, waiting local game. Does not erase participants or trades.
import '../src/config.js'
import pg from 'pg'
import {readFile,mkdir,chmod} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {validateEventInput,validateMonthlyEffects,validateSchedule,validateCompleteSchedule} from '../src/events.js'
import {ACTIVE_GAME_ID} from '../src/game-store.js'
const target=new URL(process.env.DATABASE_URL||'')
if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.pathname!=='/infosys_investking')throw new Error('Expected local infosys_investking DB')
const data=JSON.parse(await readFile(new URL('../../content/event-day-2026-09-27/content.json',import.meta.url),'utf8'))
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});const c=await pool.connect()
try{
 const game=(await c.query('SELECT * FROM games WHERE id=$1',[ACTIVE_GAME_ID])).rows[0]
 if(game.status!=='WAITING'||game.current_round!==0)throw new Error('Reset the finished game before applying; no data changed')
 const dir=fileURLToPath(new URL('../../../DB-backups/',import.meta.url));await mkdir(dir,{recursive:true,mode:0o700})
 const backup=`${dir}before-qa37-39-${Date.now()}.dump`
 const dumped=spawnSync(process.env.PG_DUMP_PATH||'/opt/homebrew/opt/postgresql@17/bin/pg_dump',['--format=custom','--no-owner','--no-privileges','--file',backup],{env:{...process.env,PGHOST:target.hostname,PGPORT:target.port||'5432',PGUSER:decodeURIComponent(target.username),PGPASSWORD:decodeURIComponent(target.password),PGDATABASE:target.pathname.slice(1)}})
 if(dumped.status!==0)throw new Error('Backup failed');await chmod(backup,0o600)
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'")
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`game-reset:${ACTIVE_GAME_ID}`])
 const locked=(await c.query('SELECT status,current_round FROM games WHERE id=$1 FOR UPDATE',[ACTIVE_GAME_ID])).rows[0]
 if(locked.status!=='WAITING'||locked.current_round!==0)throw new Error('Game state changed')
 await c.query(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'))
 await c.query('LOCK TABLE events,game_events,intelligence_clues IN SHARE ROW EXCLUSIVE MODE')
 if((await c.query('SELECT 1 FROM game_events WHERE game_id=$1 AND applied_at IS NOT NULL',[ACTIVE_GAME_ID])).rowCount)throw new Error('Applied event history exists')
 const ids=new Map()
 for(const raw of data.events){
  const e=validateEventInput(raw)
  if(data.companies.some(company=>e.news.includes(company.name)))throw new Error('Public news contains company name')
  const found=(await c.query('SELECT id FROM events WHERE title=$1',[e.title])).rows
  if(found.length>1)throw new Error('Duplicate event title')
  const id=found[0]?.id||randomUUID();ids.set(raw.key,id)
  await c.query(`INSERT INTO events(id,title,news,result,event_type) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(id) DO UPDATE SET news=EXCLUDED.news,result=EXCLUDED.result,event_type=EXCLUDED.event_type,updated_at=NOW()`,[id,e.title,e.news,e.result,e.eventType])
  await c.query('DELETE FROM event_effects WHERE event_id=$1',[id])
  for(const x of e.effects)await c.query('INSERT INTO event_effects(event_id,company_id,change_rate) VALUES($1,$2,$3)',[id,x.companyId,x.changeRate])
 }
 const rounds=data.schedule.map(r=>({round:r.round,events:r.events.map(e=>({...e,eventId:ids.get(e.key)}))}))
 for(const r of data.schedule)for(const e of r.events){const content=data.events.find(x=>x.key===e.key);if(content.eventType!==e.triggerPhase)throw new Error('Wrong event phase');validateMonthlyEffects(content.effects,r.round)}
 const rows=validateSchedule({rounds},{...data.game,haltDurationMs:3000})
 validateCompleteSchedule(rounds.flatMap(r=>r.events.map(e=>({...e,round:r.round}))),data.game.totalRounds)
 if(rows.length!==48||rows.filter(r=>r.triggerPhase==='INTRADAY').length!==36)throw new Error('Wrong allocation')
 await c.query('DELETE FROM game_events WHERE game_id=$1',[ACTIVE_GAME_ID])
 for(const r of rows)await c.query(`INSERT INTO game_events(id,game_id,event_id,round_number,display_order,trigger_phase,trigger_offset_ms,preannounce_ms,news_reveal_offset_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),ACTIVE_GAME_ID,r.eventId,r.round,r.displayOrder,r.triggerPhase,r.triggerOffsetMs,r.preannounceMs,r.newsRevealOffsetMs])
 for(const clue of data.clues){const result=await c.query('UPDATE intelligence_clues SET content=$1,available_round=$2,event_id=$3,updated_at=NOW() WHERE title=$4',[clue.content,clue.availableRound,ids.get(clue.eventKey),clue.title]);if(result.rowCount!==1)throw new Error('Clue mapping mismatch')}
 await c.query('UPDATE games SET round_duration_ms=$1,trading_duration_ms=$2 WHERE id=$3',[data.game.roundDurationMs,data.game.tradingDurationMs,ACTIVE_GAME_ID])
 await c.query("INSERT INTO event_schedule_states(game_id,mode) VALUES($1,'MANUAL') ON CONFLICT(game_id) DO UPDATE SET mode='MANUAL',configured_at=NOW()",[ACTIVE_GAME_ID])
 if(process.argv.includes('--dry-run')){await c.query('ROLLBACK');console.log('Dry run passed; rolled back')}
 else{await c.query('COMMIT');console.log('Applied 48 events, 36 intraday assignments and 24 clue links')}
 console.log(`Backup: ${backup}`)
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1}finally{c.release();await pool.end()}
