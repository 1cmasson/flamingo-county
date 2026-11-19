import type { NextRequest } from 'next/server'

import { DEFAULT_LANG, isLang } from '../../../../../i18n'
import { renderGuideCard } from '../../../../../lib/eventCard'
import { isEventCardSize } from '../../../../../lib/eventCardUrl'
import { getGuide } from '../../../../../lib/guides'

/**
 * `/api/og/guide/<key>?lang=es|en&size=link|social|page|card&v=<version>`: a
 * food guide's card (lib/guides.ts), drawn by the event card's renderer in a
 * season palette. The guide's og:image is `link`; `social` is the 4:5 poster
 * for posts.
 *
 * Under /api/og/ like the event and season cards: the language proxy leaves it
 * alone and robots.ts lets crawlers fetch it. An unknown guide is a 404. The
 * card is the guide's own copy only, so a long cache is safe; `v` carries the
 * design version (GUIDE_CARD_VERSION).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const guide = getGuide(key)
  if (!guide) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const q = req.nextUrl.searchParams
  const lang = isLang(q.get('lang') ?? undefined) ? (q.get('lang') as 'en' | 'es') : DEFAULT_LANG
  const sizeParam = q.get('size')
  const size = isEventCardSize(sizeParam) ? sizeParam : 'link'

  try {
    const png = await renderGuideCard(guide, lang, size)
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    console.error('[og] guide card failed:', err instanceof Error ? err.message : err)
    return new Response('Could not draw the card', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
