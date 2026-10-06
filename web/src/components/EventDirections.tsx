import type { Event } from '../payload-types'
import { eventDirections } from '../lib/eventVenue'
import { DirectionsLink } from './DirectionsLink'
import s from './chrome.module.css'

/**
 * Where the event is and how to get there: the street address in text, then
 * one directions button that opens the phone's own map with the venue as the
 * destination (`eventDirections`, `DirectionsLink`).
 *
 * The address is written out on the page, not only inside the map link: it is
 * what a search for the venue matches, and it is the same address the
 * structured data gives. An event with no address on file still gets the
 * button, searched by the venue's name and city. Nothing when the event names
 * no venue at all.
 */
export function EventDirections({ ev, t }: { ev: Event; t: (s: string) => string }) {
  const directions = eventDirections(ev)
  if (!directions) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {directions.address ? (
        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
          {directions.address}
        </p>
      ) : null}
      <DirectionsLink
        google={directions.google}
        apple={directions.apple}
        className={s.chipLift}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: '1.2px',
          minHeight: 44,
          padding: '8px 14px',
          border: '3px solid var(--ink)',
          background: 'var(--yellow)',
          color: 'var(--ink)',
          textDecoration: 'none',
        }}
      >
        {t('GET DIRECTIONS ↗')}
      </DirectionsLink>
    </div>
  )
}
