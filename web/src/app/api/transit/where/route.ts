import { NextResponse, type NextRequest } from 'next/server'
import { isLang } from '../../../../i18n'
import { suggestPoints } from '../../../../lib/civic'
import { directoryPoints } from '../../../../lib/busPlaces'

/**
 * "Where are you going?" for the bus trip planner: `?q=morro&lang=es`.
 * Places from the directory whose name matches, then county addresses (the
 * same synced address data as the address page). Only the typed text comes
 * here and nothing is kept; where the visitor is never does.
 */
export const dynamic = 'force-dynamic'

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 120)
  const langParam = req.nextUrl.searchParams.get('lang') ?? 'es'
  const lang = isLang(langParam) ? langParam : 'es'
  const want = fold(q)
  if (want.length < 2) return NextResponse.json({ results: [] })

  const [places, addresses] = await Promise.all([
    directoryPoints(lang).then((all) =>
      all
        .filter((p) =>
          fold(p.name)
            .split(' ')
            .some((w, k, ws) => ws.slice(k).join(' ').startsWith(want)),
        )
        .slice(0, 5),
    ),
    /^\d/.test(want) || want.length >= 4 ? suggestPoints(q, 5) : Promise.resolve([]),
  ])
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
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  )
}
