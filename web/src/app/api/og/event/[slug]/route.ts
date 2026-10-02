import type { NextRequest } from 'next/server'

import { DEFAULT_LANG, isLang } from '../../../../../i18n'
import { getEvent } from '../../../../../lib/data'
import { renderEventCard } from '../../../../../lib/eventCard'
import { isEventCardSize } from '../../../../../lib/eventCardUrl'

/**
 * `/api/og/event/<slug>?lang=es|en&size=link|social|page|card&v=<stamp>`:
 * the generated card of a published event (lib/eventCard.tsx).
 *
 * Under /api/ so the language proxy (src/proxy.ts) leaves it alone: no
 * redirect, which some crawlers will not follow for an image. robots.ts
 * allows /api/og/ while keeping the rest of /api/ closed.
 *
 * `getEvent` reads published events only, so a draft or a missing slug is a
 * 404 and its card is never drawn. `v` is a cache key the pages put in the
 * URL (the event's `updatedAt` and the card's design version); the image is
 * always drawn from the event as it is now, so a long cache is safe. The one
 * thing that changes without an edit is the date line's wording once a run
 * has started, and both wordings are true; a day's cache is plenty.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const q = req.nextUrl.searchParams
  const lang = isLang(q.get('lang') ?? undefined) ? (q.get('lang') as 'en' | 'es') : DEFAULT_LANG
  const sizeParam = q.get('size')
  const size = isEventCardSize(sizeParam) ? sizeParam : 'link'

  const ev = await getEvent(lang, slug)
  if (!ev) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  try {
    const png = await renderEventCard(ev, lang, size)
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    console.error('[og] event card failed:', err instanceof Error ? err.message : err)
    return new Response('Could not draw the card', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
