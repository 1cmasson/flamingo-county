import { NextResponse, type NextRequest } from 'next/server'
import { isLang } from '../../../../i18n'
import { suggestPoints } from '../../../../lib/civic'
import { directoryPoints } from '../../../../lib/busPlaces'
import { fold, searchPlaces } from '../../../../lib/placeSearch'
import { meters } from '../../../../lib/transitMath'
import { perMinute } from '../../../../lib/perMinute'

/**
 * "Where are you going?" for the bus trip planner: `?q=palmetto&lang=es`.
 * In order: places from the directory (they open our own pages), then places
 * anywhere in Miami-Dade from OpenStreetMap (lib/placeSearch.ts: Photon), then
 * county addresses (the address page's synced data). Only the typed text
 * comes here, and only it goes on to Photon; where the visitor is never does.
 *
 * Photon is a free service shared by everyone, so each visitor gets a modest
 * number of searches a minute through here.
 */
export const dynamic = 'force-dynamic'

/** Searches per address per minute: typing a few names is fine, a script isn't. */
const allowed = perMinute(40)

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 120)
  const langParam = req.nextUrl.searchParams.get('lang') ?? 'es'
  const lang = isLang(langParam) ? langParam : 'es'
  const want = fold(q)
  if (want.length < 2) return NextResponse.json({ results: [] })
  if (!allowed(req.headers))
    return NextResponse.json({ results: [], limited: true }, { status: 429 })

  const [places, osm, addresses] = await Promise.all([
    directoryPoints(lang).then((all) =>
      all
        .filter((p) =>
          fold(p.name)
            .split(' ')
            .some((w, k, ws) => ws.slice(k).join(' ').startsWith(want)),
        )
        .slice(0, 5),
    ),
    searchPlaces(q, 8),
    /^\d/.test(want) ? suggestPoints(q, 4) : Promise.resolve([]),
  ])
  // A place that's also in the directory shows once, as the directory's (it has our page).
  const osmOnly = (osm ?? []).filter(
    (o) =>
      !places.some(
        (p) => meters(p.at, o.at) < 100 && fold(p.name).includes(fold(o.name).split(' ')[0]),
      ),
  )
  const results = [
    ...places.map((p) => ({
      kind: 'place' as const,
      id: `p${p.id}`,
      name: p.name,
      // Categories are stored in caps for the cards' tags; a result line reads them as words.
      sub: [p.category && p.category.charAt(0) + p.category.slice(1).toLowerCase(), p.city]
        .filter(Boolean)
        .join(' · '),
      at: p.at,
      href: p.href,
    })),
    ...osmOnly.map((o) => ({
      kind: 'osm' as const,
      id: o.id,
      name: o.name,
      sub: o.sub,
      at: o.at,
      href: null,
    })),
    ...addresses.map((a) => ({
      kind: 'address' as const,
      id: `a${a.slug}`,
      name: a.label,
      sub: a.city,
      at: a.at,
      href: null,
    })),
  ]
  return NextResponse.json(
    { results },
    // Photon not answering isn't "nothing there": that answer mustn't be kept by the browser or the CDN.
    { headers: { 'Cache-Control': osm ? 'public, max-age=300, s-maxage=3600' : 'no-store' } },
  )
}
