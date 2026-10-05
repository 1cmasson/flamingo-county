import Link from 'next/link'
import type { Event } from '../payload-types'
import type { Lang } from '../i18n'
import { eventSource } from '../lib/eventVenue'

const linkStyle = { color: 'var(--magenta)', textUnderlineOffset: 3, textDecorationThickness: 2 } as const

/**
 * Where an event comes from, so a reader can check it with whoever puts it
 * on: "Más info: City of Hialeah ↗". A listing organizer links to its page
 * here; anything else links out to its own site; a name with no site is just
 * the name. Nothing when the event names no organizer (`eventSource`).
 *
 * Used by the event page and by the seasonal guides' cards.
 */
export function EventSource({
  ev,
  lang,
  t,
  fontSize = 13,
}: {
  ev: Pick<Event, 'organizer' | 'organizerName' | 'organizerUrl'>
  lang: Lang
  t: (s: string) => string
  fontSize?: number
}) {
  const source = eventSource(ev, lang)
  if (!source) return null
  return (
    <p
      style={{
        margin: 0,
        fontWeight: 800,
        fontSize,
        letterSpacing: '0.6px',
        overflowWrap: 'anywhere',
      }}
    >
      {source.href ? t('More info:') : t('Organized by')}{' '}
      {source.href && source.external ? (
        <a href={source.href} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {source.name}&nbsp;↗
        </a>
      ) : source.href ? (
        <Link href={source.href} style={linkStyle}>
          {source.name}&nbsp;→
        </Link>
      ) : (
        source.name
      )}
    </p>
  )
}
