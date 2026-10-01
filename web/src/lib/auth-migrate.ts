import 'dotenv/config'
import { writeFileSync } from 'fs'
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

/**
 * Success marker for docker-entrypoint.sh, then a prompt exit.
 *
 * On the x86-64 Alpine image this process has intermittently segfaulted
 * (exit 139) *after* printing "schema up to date" — during native teardown of
 * the libsql driver, with the migration already done. Seen twice in Lighthouse
 * CI on 2026-10-01; not reproducible on arm64 or macOS. Because the entrypoint
 * chains `auth:migrate && node server.js`, one such crash would keep the site
 * from starting. The marker lets the entrypoint tell "crashed after succeeding"
 * from a real failure, which throws before reaching this line.
 */
if (process.env.AUTH_MIGRATE_OK_FILE) writeFileSync(process.env.AUTH_MIGRATE_OK_FILE, new Date().toISOString())
process.exit(0)
