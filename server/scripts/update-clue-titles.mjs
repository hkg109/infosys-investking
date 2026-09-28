// Rename local clue titles only; preserves game, schedule, prices and purchased content.
import '../src/config.js'
import pg from 'pg'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
const target = new URL(process.env.DATABASE_URL || '')
if (!['localhost','127.0.0.1','[::1]'].includes(target.hostname) || target.pathname !== '/infosys_investking') throw new Error('Expected local infosys_investking DB')
const updates = JSON.parse(await readFile(new URL('../../content/event-day-2026-09-27/clue-title-updates.json', import.meta.url),'utf8'))
const pool = new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000})
const c = await pool.connect()
try {
 await c.query('BEGIN')
 await c.query("SET LOCAL lock_timeout='5s'")
 await c.query('LOCK TABLE intelligence_clues, intelligence_purchases IN SHARE ROW EXCLUSIVE MODE')
 const before = {clues:(await c.query('SELECT id,title FROM intelligence_clues ORDER BY id')).rows,purchases:(await c.query('SELECT game_id,user_id,clue_id,title FROM intelligence_purchases ORDER BY game_id,user_id,clue_id')).rows}
 const dir = new URL('../../../DB-backups/',import.meta.url)
 await mkdir(dir,{recursive:true,mode:0o700})
 await writeFile(new URL(`clue-titles-before-${Date.now()}.json`,dir),JSON.stringify(before,null,2),{mode:0o600})
 for (const {previousTitle,title} of updates) {
  const found = await c.query('SELECT id FROM intelligence_clues WHERE title=$1 OR title=$2',[previousTitle,title])
  if(found.rowCount!==1) throw new Error(`Clue mapping mismatch: ${previousTitle}`)
  await c.query('UPDATE intelligence_clues SET title=$1,updated_at=NOW() WHERE id=$2',[title,found.rows[0].id])
  await c.query('UPDATE intelligence_purchases SET title=$1 WHERE clue_id=$2 AND (title=$3 OR title=$1)',[title,found.rows[0].id,previousTitle])
 }
 await c.query(process.argv.includes('--dry-run')?'ROLLBACK':'COMMIT')
 console.log(`${process.argv.includes('--dry-run')?'Validated':'Applied'} ${updates.length} clue titles; game and content unchanged`)
} catch(e) { await c.query('ROLLBACK'); console.error(e.message); process.exitCode=1 }
finally { c.release(); await pool.end() }
