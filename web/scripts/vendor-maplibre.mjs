/**
 * Copies MapLibre's browser build into public/vendor/maplibre/.
 *
 * MapLibre 6 is three ES modules — the map, a shared chunk and a web worker —
 * that find each other by URL, relative to wherever the map module was loaded
 * from. A bundler renames and moves them, and the worker is then never found.
 * Served as plain files, side by side, they work as published. RideMap loads
 * them only when someone opens the street map.
 *
 * Runs before `dev` and `build`; the copy is gitignored.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const dist = dirname(require.resolve('maplibre-gl/package.json')) + '/dist'
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vendor', 'maplibre')
mkdirSync(out, { recursive: true })
for (const f of ['maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs']) copyFileSync(join(dist, f), join(out, f))
