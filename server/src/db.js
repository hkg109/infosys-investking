import './config.js'
import pg from 'pg'

export const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 })
  : null

pool?.on('error', () => console.error('PostgreSQL idle connection error'))
