// Text-only local update; never replaces the schedule or changes prices/game progress.
import '../src/config.js'
import pg from 'pg'
import assert from 'node:assert/strict'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {validateEventInput} from '../src/events.js'
import {validateClue} from '../src/intelligence.js'
const target=new URL(process.env.DATABASE_URL||'')
if(!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.pathname!=='/infosys_investking')throw new Error('Local infosys_investking DB required')
const data=JSON.parse(await readFile(new URL('../../content/event-day-2026-09-27/content.json',import.meta.url),'utf8'))
assert.equal(data.events.length,48);assert.equal(data.clues.length,24)
for(const e of data.events){validateEventInput(e);assert(!data.companies.some(c=>(e.title+e.news).includes(c.name)));assert(!e.news.includes('영향 대상'))}
for(const c of data.clues)validateClue(c,12)
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});const c=await pool.connect()
const dry=process.argv.includes('--dry-run')
let paused=false
const api='http://localhost:3000/api/game'
async function action(name){const r=await fetch(`${api}/admin/${name}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.ADMIN_PASSWORD}`}});if(!r.ok)throw new Error(`Game ${name} failed: ${r.status}`)}
async function snapshot(){return {events:(await c.query('SELECT * FROM events ORDER BY id')).rows,clues:(await c.query('SELECT * FROM intelligence_clues ORDER BY id')).rows,purchases:(await c.query('SELECT * FROM intelligence_purchases ORDER BY game_id,user_id,clue_id')).rows}}
try{
 if(!dry){const r=await fetch(api);if(!r.ok)throw new Error('Game status unavailable');const {game}=await r.json();if(game.status==='RUNNING'){await action('pause');paused=true}}
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'")
 await c.query('LOCK TABLE events,intelligence_clues,intelligence_purchases IN SHARE ROW EXCLUSIVE MODE')
 const before=await snapshot();assert.equal(before.events.length,48);assert.equal(before.clues.length,24)
 const dir=new URL('../../../DB-backups/',import.meta.url);await mkdir(dir,{recursive:true,mode:0o700})
 const backup=new URL(`before-editorial-content-${Date.now()}.json`,dir)
 await writeFile(backup,JSON.stringify(before,null,2),{flag:'wx',mode:0o600})
 for(const e of data.events){const matches=before.events.filter(x=>x.title===e.title);assert.equal(matches.length,1);await c.query('UPDATE events SET news=$1,result=$2,updated_at=NOW() WHERE id=$3',[e.news,e.result,matches[0].id])}
 for(const clue of data.clues){const matches=before.clues.filter(x=>x.title===clue.title);assert.equal(matches.length,1);await c.query('UPDATE intelligence_clues SET content=$1,updated_at=NOW() WHERE id=$2',[clue.content,matches[0].id]);await c.query('UPDATE intelligence_purchases SET content=$1 WHERE clue_id=$2',[clue.content,matches[0].id])}
 const after=await snapshot()
 const strip=(rows,keys)=>rows.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key))))
 assert.deepEqual(strip(before.events,['news','result','updated_at']),strip(after.events,['news','result','updated_at']))
 assert.deepEqual(strip(before.clues,['content','updated_at']),strip(after.clues,['content','updated_at']))
 assert.deepEqual(strip(before.purchases,['content']),strip(after.purchases,['content']))
 for(const e of data.events){const row=after.events.find(x=>x.title===e.title);assert.equal(row.news,e.news);assert.equal(row.result,e.result)}
 for(const clue of data.clues){const row=after.clues.find(x=>x.title===clue.title);assert.equal(row.content,clue.content);for(const p of after.purchases.filter(x=>x.clue_id===row.id))assert.equal(p.content,clue.content)}
 await c.query(dry?'ROLLBACK':'COMMIT')
 console.log(JSON.stringify({dryRun:dry,news:48,results:48,clues:24,purchasedCopies:after.purchases.length,nonTextFieldsUnchanged:true,backup:backup.pathname}))
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error(e.message);process.exitCode=1}
finally{if(paused)await action('resume').catch(e=>{console.error(e.message);process.exitCode=1});c.release();await pool.end()}
