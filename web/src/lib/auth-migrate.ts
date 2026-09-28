import 'dotenv/config'
import { getMigrations } from 'better-auth/db/migration'
import { auth } from './auth'

/**
 * Creates or extends Better Auth's tables in auth.db. Run on every boot, after
 * `payload migrate` (docker-entrypoint.sh) — it only adds what is missing, so a
 * second run is a no-op.
 *
 * Programmatic rather than `@better-auth/cli migrate` because the runtime image
 * has no CLI, and this needs nothing beyond the auth config.
 */
const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options)
const pending = [...toBeCreated.map((t) => t.table), ...toBeAdded.map((t) => `${t.table} (columns)`)]
if (pending.length) {
  console.log(`auth: migrating ${pending.join(', ')}`)
  await runMigrations()
}
console.log('auth: schema up to date')
