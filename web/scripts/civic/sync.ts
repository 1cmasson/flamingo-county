/**
 * Builds the address database by hand: `pnpm civic:sync` (add `--force` to
 * download the big layers even when the county says they haven't changed).
 * Writes to civicDir(): CIVIC_DIR, else beside the SQLite file in DATABASE_URL
 * (the data volume in production), else web/.civic. See src/lib/civicSync.ts.
 */
import { civicDir, syncCivic } from '../../src/lib/civicSync'

syncCivic({ force: process.argv.includes('--force') })
  .then((r) => console.log(`[civic] ${r.addresses} addresses in ${civicDir()}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
