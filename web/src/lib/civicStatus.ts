import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where the address database lives and whether it is the current layout.
 *
 * Kept apart from civicSync.ts, which pulls in the database client and the
 * tile builder, so that `proxy.ts` can ask "is the data ready?" without
 * loading any of that.
 */

/** Where the database and its raw caches live: the data volume in production. */
export function civicDir(): string {
  if (process.env.CIVIC_DIR) return process.env.CIVIC_DIR
  const db = process.env.DATABASE_URL ?? ''
  if (db.startsWith('file:')) return join(db.slice(5).replace(/[^/]*$/, ''), 'civic')
  return join(process.cwd(), '.civic')
}

export const dbPath = (dir = civicDir()) => join(dir, 'civic.db')

/**
 * The layout of what civicSync.ts builds. Bump it whenever the database
 * changes shape, and every server rebuilds on its next boot instead of waiting
 * a month.
 *
 * 5: the `vote` meta key (precincts by municipality and commission district).
 * 6: the `surge` meta key (addresses by storm-surge zone, city and ZIP).
 * 7: the `cities` and `districts` meta keys (the city and commission-district pages).
 */
export const SCHEMA = 7
export const schemaFile = (dir: string) => join(dir, 'schema')

/** The layout the database on disk was built with; 0 when there is none. */
export function civicSchemaOnDisk(dir = civicDir()): number {
  const f = schemaFile(dir)
  return existsSync(f) ? Number(readFileSync(f, 'utf8')) : 0
}

/**
 * True when a database in the current layout is on disk. While a deploy that
 * bumped SCHEMA rebuilds (about ten minutes), the old database stays readable
 * for the address page, but pages that need the new layout are not ready.
 */
export function civicCurrent(dir = civicDir()): boolean {
  return existsSync(dbPath(dir)) && civicSchemaOnDisk(dir) === SCHEMA
}
