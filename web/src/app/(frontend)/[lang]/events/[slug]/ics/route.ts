import { notFound } from 'next/navigation'
import { isLang } from '../../../../../../i18n'
import { getEvent } from '../../../../../../lib/data'
import { dateOnly, utcStamp } from '../../../../../../lib/dates'
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
 * 2. **All-day, unless the event says otherwise.** `timeLabel` is free-text
 *    display copy ("9PM–1AM", "6AM–NOON", "Por confirmar") and was never
 *    parseable, so every entry used to be VALUE=DATE with no time on it. An
 *    event that fills in `startTime` gets a real UTC instant instead; one that
 *    leaves it empty still gets the all-day shape, which is the honest form
 *    for an hour nobody has settled.
 *
 * `DTSTAMP` was missing and is mandatory — RFC 5545 §3.6.1 lists it as
 * REQUIRED in a VEVENT, and strict parsers reject a file without one. It is
 * written from `updatedAt` rather than `Date.now()` so the same event produces
 * the same bytes on every request, which is what makes the 300s cache header
 * safe.
 *
 * `SEQUENCE` is what lets a change actually land. The UID is stable by design
 * (above), so a calendar that already holds this event treats a re-import as
 * an update — but only if the revision number went up; equal or lower and the
 * new version is discarded without a word. Minutes-since-2020 from `updatedAt`
 * is monotonic across edits and stays comfortably inside the 32-bit integer
 * the spec allows. This matters right now: anyone who added this event while
 * it was all-day needs the 9am version to replace it, not sit beside it.
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
  const iso = dateOnly(ev.date)
  const day = iso.replace(/-/g, '')

  // An hour is the length the calendar draws when the event publishes a start
  // and no finish. It is not a claim that the thing ends then — the page never
  // shows it — it is the difference between a block somebody can see in a week
  // view and a zero-length sliver they scroll past.
  const when = ev.startTime
    ? [
        `DTSTART:${utcStamp(iso, ev.startTime)}`,
        ev.endTime
          ? `DTEND:${utcStamp(iso, ev.endTime)}`
          : `DTEND:${utcStamp(iso, ev.startTime, 60)}`,
      ]
    : [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${day}`]

  const updated = new Date(ev.updatedAt ?? Date.now())
  const stamp = updated.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const sequence = Math.max(
    0,
    Math.floor((updated.getTime() - Date.UTC(2020, 0, 1)) / 60000),
  )

  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flamingo County//Events//EN',
    'BEGIN:VEVENT',
    `UID:${ev.slug}@flamingocounty.com`,
    `DTSTAMP:${stamp}`,
    `SEQUENCE:${sequence}`,
    ...when,
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
