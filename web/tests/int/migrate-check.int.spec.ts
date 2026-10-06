// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { expectedMigrations, sqlitePath } from '../../scripts/check-migrated.mjs'

/**
 * scripts/check-migrated.mjs: the check that stands between a `payload migrate`
 * that exited 0 and a build or boot that believes it (scripts/migrate.sh).
 */
const dir = join(__dirname, '../../src/migrations')

describe('check-migrated', () => {
  it('expects every migration file, in index.ts order', () => {
    const names: string[] = expectedMigrations(readFileSync(join(dir, 'index.ts'), 'utf8'))
    const files = readdirSync(dir)
      .filter((f) => /^\d{8}_\d{6}_.+\.ts$/.test(f))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    expect(names).toEqual(files)
  })

  it('reads a local SQLite path out of DATABASE_URL', () => {
    expect(sqlitePath('file:/data/content.db')).toBe('/data/content.db')
    expect(sqlitePath('file:///data/content.db')).toBe('/data/content.db')
    expect(sqlitePath('file:./content.db')).toBe('./content.db')
    expect(sqlitePath('libsql://db.example.com')).toBeNull()
    expect(sqlitePath(undefined)).toBeNull()
  })
})
