'use client'

import { useSaved } from '../lib/saved'
import s from './chrome.module.css'

const btn = {
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: '1.2px',
  lineHeight: 1.15,
  height: 44,
  padding: '0 8px',
  border: '3px solid var(--ink)',
  // Equal halves, fixed height: a longer label wraps to two lines inside the
  // button instead of widening it.
  flex: '1 1 0',
  minWidth: 0,
  textAlign: 'center',
} as const

/**
 * The going / save / add-to-calendar row at the foot of an event card.
 *
 * Two fixed lines: GOING and + MY WEEK split the first, + CALENDAR takes the
 * whole second. Both toggles change their label when tapped ("YOU'RE GOING ·
 * 13", "IN MY WEEK"), and when the row wrapped on text width that pushed
 * + CALENDAR down a line mid-tap on phones. Nothing here depends on label
 * length any more.
 *
 * Only this strip is a client component — the card around it stays on the
 * server, so no event's copy ends up in the JS bundle.
 *
 * The going count is the seeded number plus one when *this* visitor is going,
 * exactly as the source computed it. It is not a real tally; there are no
 * accounts, and the seed integer is baked into the record.
 */
export function EventActions({
  slug,
  going,
  icsHref,
  t,
}: {
  slug: string
  going: number
  icsHref: string
  t: { going: string; youreGoing: string; save: string; saved: string; addCal: string }
}) {
  const { ready, isGoing, isSaved, toggleGoing, toggleSaved } = useSaved()
  const on = ready && isGoing(slug)
  const inWeek = ready && isSaved(slug)
  const total = going + (on ? 1 : 0)

  return (
    <div
      style={{
        marginTop: 'auto',
        paddingTop: 11,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 7,
        alignItems: 'center',
        borderTop: '3px dotted var(--ink)',
      }}
    >
      <button
        type="button"
        onClick={() => toggleGoing(slug)}
        aria-pressed={on}
        className={s.chipLift}
        style={{
          ...btn,
          background: on ? 'var(--ink)' : 'var(--grad-cream)',
          color: on ? 'var(--cyan)' : 'var(--ink)',
        }}
      >
        {on ? `${t.youreGoing} ${total}` : `${total} ${t.going}`}
      </button>
      <button
        type="button"
        onClick={() => toggleSaved(slug)}
        aria-pressed={inWeek}
        className={s.chipLift}
        style={{
          ...btn,
          background: inWeek ? 'var(--yellow)' : 'var(--grad-cream)',
          color: 'var(--ink)',
        }}
      >
        {inWeek ? t.saved : t.save}
      </button>
      <a
        href={icsHref}
        download={`${slug}.ics`}
        className={s.chipLift}
        style={{
          flex: '1 1 100%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: '1.2px',
          minHeight: 44,
          padding: '8px 10px',
          border: '3px solid var(--ink)',
          background: 'var(--grad-cyan)',
          color: 'var(--ink)',
        }}
      >
        {t.addCal}
      </a>
    </div>
  )
}
