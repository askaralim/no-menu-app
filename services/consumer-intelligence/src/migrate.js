import { readFile } from 'node:fs/promises'
import { createPool, transaction, lock } from './db.js'
import { loadConfig } from './config.js'

export async function migrate(pool) {
  await transaction(pool, async client => {
    await lock(client, 'ci:migrate')
    await client.query('CREATE SCHEMA IF NOT EXISTS ci')
    await client.query('CREATE TABLE IF NOT EXISTS ci.schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const version of ['001_initial', '002_assisted_visits', '003_data_maintenance', '004_e1_withdrawals', '005_e1_routing', '006_admin_report']) {
      const existing = await client.query('SELECT 1 FROM ci.schema_migrations WHERE version=$1', [version])
      if (!existing.rowCount) {
        await client.query(await readFile(new URL(`../db/${version}.sql`, import.meta.url), 'utf8'))
        await client.query('INSERT INTO ci.schema_migrations(version) VALUES($1)', [version])
      }
    }
  })
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const pool = createPool(loadConfig())
  try { await migrate(pool); console.log('Consumer Intelligence schema ready') }
  finally { await pool.end() }
}
