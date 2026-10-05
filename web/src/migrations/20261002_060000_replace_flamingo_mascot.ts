import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-sqlite'

/**
 * Data only, no schema: swap the Hialeah flamingo's picture for the clean
 * cutout, in place.
 *
 * The old `mascots/flamingo-hialeah.png` had an opaque cyan patch between the
 * legs. The repo file is now the trimmed transparent cutout of the same
 * character, which a fresh seed picks up, but the seed's `upsertMedia` keys on
 * the file's name and keeps an existing `media` doc as it is, so a database
 * that has already been seeded (production) would go on serving the old one.
 *
 * This replaces the FILE of that `media` doc, keeping its id, so everything
 * that points at it (Hialeah's `solo` mascot, any cast entry) shows the new
 * picture without being touched. Payload stores it as WebP like every upload
 * and regenerates the sizes; the doc's filename may change (production's is
 * still `flamingo-hialeah.png` from before uploads became WebP), which also
 * gives browsers a new URL.
 *
 * The source is the repo file, which the production image carries at
 * `/app/mascots` (web/Dockerfile copies `mascots/` for the seed), next to this
 * migration's own `/app/web/src/migrations`.
 *
 * Safe to run on any database:
 * - no flamingo doc (an empty database: CI, the Docker build): nothing to do;
 * - a doc already the new picture's size: nothing to do, so a re-run is a no-op;
 * - the source file missing: logged as an error and skipped rather than failing
 *   the boot over a picture. `docker-entrypoint.sh` stops the server on a
 *   failed migration.
 */

/** The seeded doc's names: the PNG of the first seed, the WebP of later ones, and Payload's `-1` suffixes. */
const FLAMINGO = /^flamingo-hialeah(-\d+)?\.(png|webp)$/

function sourceFile(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../../mascots/flamingo-hialeah.png'),
    path.resolve(process.cwd(), '../mascots/flamingo-hialeah.png'),
  ]
  return candidates.find((p) => fs.existsSync(p)) ?? null
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Plain SQL, not payload.find: Payload selects every column the CURRENT
  // config declares, and on a fresh database (CI, a new environment) this
  // migration runs before later ones add their media columns (license, …), so
  // a Payload read here would fail with "no such column". An empty database
  // has no flamingo, so it stops at the first query.
  const rows = (await db.all(
    sql`SELECT id, filename, width, height FROM media WHERE filename LIKE '%flamingo-hialeah%' LIMIT 50`,
  )) as { id: number; filename: string | null; width: number | null; height: number | null }[]
  const docs = rows.map((r) => ({ id: r.id, filename: r.filename, width: r.width, height: r.height }))
  const targets = docs.filter((d) => d.filename && FLAMINGO.test(d.filename))
  if (!targets.length) {
    payload.logger.info('[migrate] flamingo mascot: no media doc to replace')
    return
  }

  // payload.update reads and writes every column the current config declares.
  // A database that has the old flamingo but not yet the later media columns
  // (an old backup migrated in one go) cannot take it, so skip with a warning:
  // the seed's own file is already the cutout, and this can be re-run by hand.
  const cols = (await db.all(sql`PRAGMA table_info(media)`)) as { name: string }[]
  if (!cols.some((c) => c.name === 'license')) {
    payload.logger.warn('[migrate] flamingo mascot: media lacks columns from later migrations; skipped, replace it after migrating')
    return
  }

  const file = sourceFile()
  if (!file) {
    payload.logger.error('[migrate] flamingo mascot: mascots/flamingo-hialeah.png not found; left the old picture in place')
    return
  }
  const { width, height } = await sharp(file).metadata()

  for (const doc of targets) {
    if (doc.width === width && doc.height === height) {
      payload.logger.info(`[migrate] flamingo mascot: media #${doc.id} is already the cutout`)
      continue
    }
    const updated = await payload.update({
      collection: 'media',
      id: doc.id,
      data: {},
      filePath: file,
      depth: 0,
      overrideAccess: true,
      req,
    })
    payload.logger.info(
      `[migrate] flamingo mascot: media #${doc.id} ${doc.filename} (${doc.width}×${doc.height}) → ${updated.filename} (${updated.width}×${updated.height})`,
    )
  }
}

/** Nothing to undo: the old picture is not kept, and the new one is the same character. */
export async function down({ payload }: MigrateDownArgs): Promise<void> {
  payload.logger.info('[migrate] flamingo mascot: down is a no-op')
}
