/**
 * Prints the edition of a county feed zip (lib: gtfs.ts feedHash), for the
 * daily refresh to compare with the site's (src/data/transit/network.json).
 *
 *   tsx scripts/transit/feed-hash.ts feed.zip
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { feedHash } from './gtfs'

const zip = process.argv[2]
if (!zip) throw new Error('usage: feed-hash.ts <feed.zip>')
const dir = mkdtempSync(join(tmpdir(), 'mdt-hash-'))
execFileSync('unzip', ['-o', '-q', zip, '-d', dir])
console.log(feedHash(dir))
