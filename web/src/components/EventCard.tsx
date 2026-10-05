import Link from 'next/link'
import type { Event, EventKind, Media } from '../payload-types'
import { rel } from '../lib/data'
import { routes } from '../lib/routes'
import { eventDateLine } from '../lib/dates'
import { eventCardUrl, EVENT_CARD_SIZES } from '../lib/eventCardUrl'
import { eventVenue } from '../lib/eventVenue'
import { photoCredit } from '../lib/photoLicense'
import type { Lang } from '../i18n'
import { EventActions } from './EventActions'
import { EventSource } from './EventSource'
import { PhotoCredit } from './PhotoCredit'
import s from './chrome.module.css'

export { eventVenue }

/**
 * The chip for an event that is not simply on, or null. Shown on the card and
 * the event page so the page says what the structured data says: a cancelled
 * event stays up, marked, rather than vanishing on the people who saved it.
 */
export function eventStatusLabel(ev: Pick<Event, 'eventStatus'>, t: (s: string) => string) {
  switch (ev.eventStatus) {
    case 'cancelled':
      return t('CANCELLED')
    case 'postponed':
      return t('POSTPONED')
    case 'rescheduled':
      return t('NEW DATE')
    default:
      return null
  }
}

const statusChip = { background: 'var(--ink)', color: 'var(--cream)', fontWeight: 800 } as const

export function eventActionStrings(t: (s: string) => string) {
  return {
    going: t('GOING'),
    youreGoing: t("YOU'RE GOING ·"),
    save: t('+ MY WEEK'),
    saved: t('IN MY WEEK'),
    addCal: t('+ CALENDAR'),
  }
}

/**
 * The event card on the events board.
 *
 * The top half — the picture and the title — is one link to the event, so the
 * whole thing is a tap target rather than just the title's text. The venue
 * line sits below it because it can be a link of its own (to the business),
 * and anchors cannot nest.
 *
 * Every card's picture is its generated card (lib/eventCard.tsx): the city's
 * colour, kind, title and date, with the event's photo framed beside them or,
 * with no photo, the mascot's arch. All 4:3, so the grid keeps one shape. A
 * photo's credit, with its links, sits under the picture.
 */
export function EventCard({
  lang,
  ev,
  t,
  guide = false,
}: {
  lang: Lang
  ev: Event
  t: (s: string) => string
  /**
   * The seasonal guides' fuller card: the date line and the city in text, and
   * the source link. The board leaves them off: its day headings carry the
   * date and the generated picture the city.
   */
  guide?: boolean
}) {
  const kind = rel<EventKind>(ev.kind)
  const { listing, city, name, hood } = eventVenue(ev)
  const photo = rel<Media>(ev.image)
  // The card crops the photo to its frame and sets type beside it.
  const credit = photo?.url ? photoCredit(photo, lang, { cropped: true, card: true }) : null

  return (
    <article
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '7px 7px 0 var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <Link
        href={routes.event(lang, ev.slug)}
        className={s.cardTop}
        style={{ display: 'block', textDecoration: 'none', color: 'var(--ink)' }}
      >
        <div
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            borderBottom: '4px solid var(--ink)',
            overflow: 'hidden',
            // The city's colour behind the card while it loads.
            background: city?.accent ?? kind?.bg ?? 'var(--grad-pink)',
          }}
        >
          {/* The generated card, in the 4:3 shape of this slot: the city,
              kind, date and title on the city's colour, with the event's
              photo framed on it (credit printed) or the mascot's arch. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={eventCardUrl(ev, lang, 'card')}
            alt={photo?.alt ?? ''}
            width={EVENT_CARD_SIZES.card.width}
            height={EVENT_CARD_SIZES.card.height}
            loading="lazy"
            decoding="async"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
          />
        </div>
        <div
          data-cardtitle
          style={{
            padding: '14px 15px 0',
            fontFamily: 'var(--display)',
            fontSize: 20,
            lineHeight: 1.03,
          }}
        >
          {ev.title}
        </div>
      </Link>

      <div
        style={{
          padding: '9px 15px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          flex: 1,
        }}
      >
        {/* Out here, not on the picture: it has links, and the picture is one. */}
        {credit ? <PhotoCredit credit={credit} style={{ fontSize: 10.5 }} /> : null}
        <div
          style={{
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: '1.4px',
            color: 'var(--magenta)',
          }}
        >
          {listing && city ? (
            <Link
              href={routes.business(lang, city.slug, listing.slug)}
              style={{ color: 'inherit' }}
            >
              {name}
            </Link>
          ) : (
            name
          )}
          {/* No leading separator when the venue has no name in this language. */}
          {hood ? `${name ? ' · ' : ''}${hood}` : ''}
          {guide && city?.name ? `${name || hood ? ' · ' : ''}${city.name}` : ''}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          {guide ? (
            <div
              style={{
                background: 'var(--yellow)',
                border: '2px solid var(--ink)',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '1px',
                padding: '5px 8px',
              }}
            >
              {eventDateLine(ev, lang)}
            </div>
          ) : null}
          {ev.timeLabel ? (
            <div
              style={{
                background: 'var(--ink)',
                color: 'var(--cream)',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '1.3px',
                padding: '6px 9px',
              }}
            >
              {ev.timeLabel}
            </div>
          ) : null}
          {eventStatusLabel(ev, t) ? (
            <div
              style={{
                ...statusChip,
                border: '2px solid var(--ink)',
                fontSize: 10,
                letterSpacing: '1.3px',
                padding: '5px 8px',
              }}
            >
              {eventStatusLabel(ev, t)}
            </div>
          ) : null}
          {ev.freeLabel ? (
            <div
              style={{
                background: 'var(--yellow)',
                border: '2px solid var(--ink)',
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: '1.3px',
                padding: '5px 8px',
              }}
            >
              {ev.freeLabel}
            </div>
          ) : null}
        </div>

        {ev.note ? (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: 1.5,
              fontWeight: 600,
              textWrap: 'pretty',
            }}
          >
            {ev.note}
          </p>
        ) : null}

        {guide ? <EventSource ev={ev} lang={lang} t={t} fontSize={12} /> : null}

        <EventActions
          slug={ev.slug}
          going={ev.going ?? 0}
          icsHref={routes.eventIcs(lang, ev.slug)}
          t={eventActionStrings(t)}
        />
      </div>
    </article>
  )
}
