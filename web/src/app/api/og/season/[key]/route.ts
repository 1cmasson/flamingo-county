import type { NextRequest } from 'next/server'

import { DEFAULT_LANG, isLang } from '../../../../../i18n'
import { todayISO } from '../../../../../lib/dates'
import { renderSeasonCard } from '../../../../../lib/eventCard'
import { isEventCardSize } from '../../../../../lib/eventCardUrl'
import { getSeason, seasonWindow } from '../../../../../lib/seasons'

/**
 * `/api/og/season/<key>?lang=es|en&size=link|social|page&v=<stamp>`: a
 * seasonal guide's card (lib/seasons.ts), drawn by the event card's renderer
 * in the season's palette. The guide's hero (`page`) and its og:image
 * (`link`); `social` is the 4:5 poster for posts.
 *
 * Under /api/og/ for the same reasons as the event card: the language proxy
 * leaves it alone and robots.ts lets crawlers fetch it. An unknown season is a
 * 404. The card names no event, only the guide's own copy and the year, so a
 * long cache is safe; `v` carries the year and the design version.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const season = getSeason(key)
  if (!season) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const q = req.nextUrl.searchParams
  const lang = isLang(q.get('lang') ?? undefined) ? (q.get('lang') as 'en' | 'es') : DEFAULT_LANG
  const sizeParam = q.get('size')
  const size = isEventCardSize(sizeParam) ? sizeParam : 'link'

  try {
    const png = await renderSeasonCard(season, lang, size, seasonWindow(season, todayISO()).year)
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    console.error('[og] season card failed:', err instanceof Error ? err.message : err)
    return new Response('Could not draw the card', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
