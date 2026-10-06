/**
 * Did `payload migrate` really migrate? Exits 0 only when every migration in
 * src/migrations/index.ts is recorded in the database's payload_migrations
 * table; otherwise lists what is missing and exits 1.
 *
 * Why it exists: `payload migrate` has exited 0 having done nothing at all,
 * not even its start-up log, and the build then died on "no such table"
 * (CI on #49 and Railway's build of #51, 2026-10-02). The CLI starts its work
 * with `void start()` behind tsx's loader thread; if that stalls, Node finds
 * nothing left to wait for and exits 0. An exit code can't be trusted there, so
 * scripts/migrate.sh asks the database instead, and retries.
 *
 * Plain JS on Node's built-in SQLite: it must run without tsx, and without the
 * libsql driver, which has segfaulted on exit in this image (src/lib/auth-migrate.ts).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The names Payload records, in the order index.ts lists them. */
export function expectedMigrations(indexSource) {
  return [...indexSource.matchAll(/^\s*name:\s*'([^']+)'/gm)].map((m) => m[1])
}

/** `file:/data/content.db` → `/data/content.db`; null for a non-file database. */
export function sqlitePath(url) {
  if (!url?.startsWith('file:')) return null
  const path = url.slice('file:'.length).replace(/^\/\/(?=\/)/, '')
  return path || null
}

function main() {
  const expected = expectedMigrations(readFileSync(join(root, 'src/migrations/index.ts'), 'utf8'))
  if (!expected.length) {
    console.error('check-migrated: found no migrations in src/migrations/index.ts')
    return 1
  }

  // Payload reads .env itself when the variable isn't set; read the same file,
  // or this would check a different database than the one just migrated.
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(join(root, '.env'))
    } catch {
      // No .env: the image passes DATABASE_URL in the environment.
    }
  }
  const path = sqlitePath(process.env.DATABASE_URL)
  if (!path) {
    console.log('check-migrated: DATABASE_URL is not a local SQLite file; skipped')
    return 0
  }

  let recorded = new Set()
  try {
    const db = new DatabaseSync(path, { readOnly: true })
    try {
      recorded = new Set(db.prepare('select name from payload_migrations').all().map((r) => r.name))
    } finally {
      db.close()
    }
  } catch (err) {
    // No file or no table: nothing was migrated.
    console.error(`check-migrated: could not read migrations from ${path}: ${err.message}`)
  }

  const missing = expected.filter((name) => !recorded.has(name))
  if (missing.length) {
    const shown = missing.length > 3 ? `${missing.slice(0, 3).join(', ')}, …` : missing.join(', ')
    console.error(`check-migrated: ${missing.length} of ${expected.length} migrations not applied: ${shown}`)
    return 1
  }
  console.log(`check-migrated: all ${expected.length} migrations applied`)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main())
