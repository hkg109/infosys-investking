import { readFile } from 'node:fs/promises'
import { pool } from './db.js'

if (!pool) throw new Error('DATABASE_URL is required. Configure the root .env first.')
try {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  await pool.query(sql)
  console.log('User, game, market, trading, event and ranking tables are ready.')
} finally {
  await pool.end()
}
