import { spawnSync } from 'node:child_process'

// QA/CI must never report success with PostgreSQL integration tests skipped.
if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL must point to a disposable PostgreSQL database.')
  process.exit(1)
}
const result = spawnSync(process.execPath, ['--test'], { stdio: 'inherit', env: process.env })
if (result.error) console.error('Unable to start integration test runner')
process.exit(result.status ?? 1)
