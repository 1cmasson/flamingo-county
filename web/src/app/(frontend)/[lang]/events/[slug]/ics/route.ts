import { notFound } from 'next/navigation'
import { isLang } from '../../../../../../i18n'
import { getEvent } from '../../../../../../lib/data'
import { dateOnly } from '../../../../../../lib/dates'
import { eventVenue } from '../../../../../../components/EventCard'

/** RFC 5545 escaping for text values. */
const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/**
 * The calendar file for an event.
 *
 * The static site built this as a `data:` URI in the browser. A route handler
 * is cleaner — a real Content-Type and filename, and nothing to generate on the
 * client — but two things about the payload must not change:
 *
 * 1. **The UID scheme.** `<slug>@flamingocounty.com` is what the live site has
 *    been emitting. Anyone who already added an event has that UID sitting in
 *    their calendar; change it and re-adding creates a duplicate instead of
 *    updating the existing entry in place.
 *
 * 2. **All-day.** `DTSTART`/`DTEND` are VALUE=DATE with no time component. The
 *    `time` field is free-text display copy ("9PM–1AM", "6AM–NOON") and was
 *    never parseable, so there is nothing to promote to a real start time.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lang: string; slug: string }> },
) {
  const { lang, slug } = await params
  if (!isLang(lang)) notFound()

  const ev = await getEvent(lang, slug)
  if (!ev) notFound()

  const { name: venue } = eventVenue(ev)
  const day = dateOnly(ev.date).replace(/-/g, '')

  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flamingo County//Events//EN',
    'BEGIN:VEVENT',
    `UID:${ev.slug}@flamingocounty.com`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${day}`,
    `SUMMARY:${esc(ev.title ?? '')}`,
    `LOCATION:${esc(venue)}`,
    `DESCRIPTION:${esc(`${ev.timeLabel ?? ''} · Flamingo County`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${ev.slug}.ics"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
