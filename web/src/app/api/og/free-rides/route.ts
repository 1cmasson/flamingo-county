import type { NextRequest } from 'next/server'

import { DEFAULT_LANG, isLang } from '../../../../i18n'
import { renderFreeRidesCard } from '../../../../lib/freeRidesCard'
import { getRoute } from '../../../../lib/transit'

/**
 * `/api/og/free-rides?lang=es|en[&route=flamingo|marlin]&v=<version>`: the
 * free-rides hub's link card, or with `route` that line's (lib/freeRidesCard.tsx).
 * An unknown line is a 404.
 *
 * Under /api/og/ for the same reasons as the event card: the language proxy
 * leaves it alone and robots.ts lets crawlers fetch it. It is drawn from the
 * committed line data and fixed copy only, so a long cache is safe; `v`
 * changes when either does.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const l = q.get('lang') ?? undefined
  const lang = isLang(l) ? l : DEFAULT_LANG
  const slug = q.get('route')
  const route = slug ? getRoute(slug) : undefined
  if (route === null) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const png = await renderFreeRidesCard(lang, route)
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    console.error('[og] free-rides card failed:', err instanceof Error ? err.message : err)
    return new Response('Could not draw the card', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
