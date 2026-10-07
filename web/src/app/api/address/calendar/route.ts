import { notFound } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { isLang } from '../../../../i18n'
import { addressReport, prettyAddress, rrule, type Pickup } from '../../../../lib/civic'
import { addressCopy } from '../../../../lib/addressCopy'
import { addDays } from '../../../../lib/dates'

/** RFC 5545 escaping for text values. */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 octets are folded (RFC 5545 §3.1). */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (Buffer.byteLength(rest) > 75) {
    let cut = 74
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--
    out.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  out.push(rest)
  return out.join('\r\n')
}

/**
 * An address's garbage, recycling and bulk days as a calendar file:
 * `?a=<address slug>&lang=es`. Each is one all-day event that repeats by the
 * city's rule (RRULE), with a reminder at 7 PM the evening before, so the
 * phone does the reminding and nobody has to agree to texts. Not every
 * calendar keeps the reminder (Google's import drops VALARM), which is why the
 * page asks people to add an alert if none appears.
 *
 * The UID is the address and the kind of pickup, so adding it again updates
 * the entries instead of doubling them.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('a') ?? ''
  const langParam = req.nextUrl.searchParams.get('lang') ?? 'es'
  const lang = isLang(langParam) ? langParam : 'es'
  const r = await addressReport(slug)
  if (!r) notFound()
  const c = addressCopy(lang)
  const where = `${prettyAddress(r.label)}, ${r.city}, FL ${r.zip}`
  const stamp = `${r.fetchedAt.replace(/-/g, '')}T000000Z`
  // Days since 2020 at the last sync: goes up whenever the data is refreshed,
  // so a re-add replaces an entry whose rule changed instead of being ignored.
  const sequence = Math.floor((Date.parse(r.fetchedAt) - Date.parse('2020-01-01')) / 86_400_000)

  const event = (kind: 'garbage' | 'recycling' | 'bulk', p: Pickup | null, note: string) => {
    const rule = p?.rule ? rrule(p.rule) : null
    if (!p?.next[0] || !rule) return []
    const day = p.next[0].replace(/-/g, '')
    return [
      'BEGIN:VEVENT',
      `UID:${slug}-${kind}@flamingocounty.com`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${sequence}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${addDays(p.next[0], 1).replace(/-/g, '')}`,
      `RRULE:${rule}`,
      `SUMMARY:${esc(`🦩 ${c[kind]}`)}`,
      `LOCATION:${esc(where)}`,
      `DESCRIPTION:${esc([note, c.holidays, `flamingocounty.com/${lang}/address?a=${slug}`].filter(Boolean).join('\n'))}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(c[kind])}`,
      // All-day events start at midnight; five hours before is 7 PM the evening before.
      'TRIGGER:-PT5H',
      'END:VALARM',
      'END:VEVENT',
    ]
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flamingo County//Address//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`${c.trash} · ${prettyAddress(r.label)}`)}`,
    ...event('garbage', r.trash.garbage, ''),
    ...event('recycling', r.trash.recycling, ''),
    ...event('bulk', r.trash.bulk, r.trash.bulk?.by === 'hialeah' ? c.bulkShort : ''),
    'END:VCALENDAR',
  ]
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.ics"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
