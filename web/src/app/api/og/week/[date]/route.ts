import type { NextRequest } from 'next/server'

import { getEvents } from '../../../../../lib/data'
import { renderWeekCover, weekCoverData } from '../../../../../lib/weekCover'
import { parseWeek } from '../../../../../lib/week'

/**
 * `/api/og/week/<YYYY-MM-DD>?size=social&v=<stamp>`: the cover of the Monday
 * roundup (lib/weekCover.tsx) for the week holding that date, Monday to
 * Sunday. Any day of the week draws that week's cover; a string that is not
 * a date is a 404.
 *
 * Only `social` (Instagram's 4:5) exists, the size of the event cards it
 * opens the carousel for. Under /api/og/ for the same reasons as the event
 * card: the language proxy leaves it alone and robots.ts lets crawlers fetch
 * it. Drawn from published events only (`getEvents`). The week's count moves
 * as events are published, so a day's cache, as for the event card.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const monday = parseWeek(date)
  if (!monday) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const png = await renderWeekCover(weekCoverData(monday, await getEvents('es')))
    return new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    console.error('[og] week cover failed:', err instanceof Error ? err.message : err)
    return new Response('Could not draw the card', { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
