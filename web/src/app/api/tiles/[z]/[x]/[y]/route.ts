import { tileAt } from '../../../../../../lib/civic'

/**
 * A map tile: every layer of the address map for one square of the county,
 * cut and gzipped when the data was refreshed (src/lib/civicTiles.ts). The
 * URL carries the data's version (`?v=`), so a tile can be kept for a year.
 */
export const dynamic = 'force-dynamic'

const FOREVER = 'public, max-age=31536000, s-maxage=31536000, immutable'

export async function GET(_req: Request, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const { z, x, y } = await params
  const [zi, xi, yi] = [Number(z), Number(x), Number(y.replace(/\.(pbf|mvt)$/, ''))]
  if (![zi, xi, yi].every(Number.isInteger) || zi < 0 || zi > 14) return new Response(null, { status: 400 })
  const data = await tileAt(zi, xi, yi)
  // Nothing here is as permanent as something here: the map draws no tile.
  if (!data) return new Response(null, { status: 204, headers: { 'Cache-Control': FOREVER } })
  return new Response(data as BodyInit, {
    headers: {
      'Content-Type': 'application/x-protobuf',
      'Content-Encoding': 'gzip',
      'Cache-Control': FOREVER,
    },
  })
}
