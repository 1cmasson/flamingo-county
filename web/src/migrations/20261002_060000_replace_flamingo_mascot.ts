import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-sqlite'

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

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const { docs } = await payload.find({
    collection: 'media',
    where: { filename: { like: 'flamingo-hialeah' } },
    limit: 50,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const targets = docs.filter((d) => d.filename && FLAMINGO.test(d.filename))
  if (!targets.length) {
    payload.logger.info('[migrate] flamingo mascot: no media doc to replace')
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
