import Link from 'next/link'
import type { City, Event, EventKind, Listing, Media } from '../payload-types'
import { rel } from '../lib/data'
import { routes } from '../lib/routes'
import { dateOnly, shortWeekday } from '../lib/dates'
import type { Lang } from '../i18n'
import { MediaSlot } from './MediaSlot'
import { EventActions } from './EventActions'

/** Where an event happens: a listed business, or a named place. */
export function eventVenue(ev: Event) {
  const listing = ev.venueType === 'listing' ? rel<Listing>(ev.listing) : null
  const city = listing ? rel<City>(listing.city) : rel<City>(ev.city)
  return {
    listing,
    city,
    name: listing?.name ?? ev.place ?? '',
    hood: listing?.hood ?? ev.hood ?? '',
  }
}

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
 * The event card, shared by the events board's on-deck strip, the event page's
 * same-day rail and My Week.
 *
 * `feature` HAS NO CALLER. It was the variant the board's HEADLINERS strip
 * used, and that strip is gone. Left in place rather than deleted: it is the
 * only code that knows how the tall card was built, and it costs nothing while
 * nobody passes the prop.
 *
 * `feature` is the taller variant used for starred events on the board — a 4:3
 * photo, the mascot leaning in and a rotated date flag.
 */
export function EventCard({
  lang,
  ev,
  t,
  feature,
}: {
  lang: Lang
  ev: Event
  t: (s: string) => string
  feature?: boolean
}) {
  const kind = rel<EventKind>(ev.kind)
  const { listing, city, name, hood } = eventVenue(ev)
  const mascot = city ? rel<Media>(city.solo) : null
  const iso = dateOnly(ev.date)

  return (
    <article
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: feature ? '7px 7px 0 var(--cyan)' : '7px 7px 0 var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      {feature ? (
        <div
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            borderBottom: '4px solid var(--ink)',
            overflow: 'hidden',
          }}
        >
          <MediaSlot
            media={ev.image}
            sizes="(max-width: 700px) 100vw, 330px"
          />
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 6,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: 'var(--ink)',
                color: 'var(--cyan)',
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: '1.4px',
                padding: '5px 8px',
              }}
            >
              {city?.name}
            </div>
            <div
              style={{
                background: kind?.bg ?? 'var(--grad-pink)',
                color: kind?.ink ?? 'var(--cream)',
                border: '2px solid var(--ink)',
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: '1.4px',
                padding: '5px 8px',
              }}
            >
              {kind?.label}
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              right: 10,
              top: 10,
              background: 'var(--yellow)',
              border: '3px solid var(--ink)',
              padding: '6px 10px 4px',
              fontFamily: 'var(--display)',
              fontSize: 17,
              lineHeight: 1,
              transform: 'rotate(3deg)',
              pointerEvents: 'none',
            }}
          >
            {shortWeekday(iso, lang)} {new Date(`${iso}T12:00:00Z`).getUTCDate()}
          </div>
          {mascot?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mascot.url}
              alt=""
              style={{
                position: 'absolute',
                right: 4,
                bottom: -8,
                height: 132,
                width: 'auto',
                pointerEvents: 'none',
                filter: 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))',
              }}
            />
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          padding: feature ? '15px 16px 17px' : '14px 15px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          flex: 1,
        }}
      >
        {!feature ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div
              style={{
                background: kind?.bg ?? 'var(--grad-pink)',
                color: kind?.ink ?? 'var(--cream)',
                border: '2px solid var(--ink)',
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: '1.4px',
                padding: '5px 8px',
              }}
            >
              {kind?.label}
            </div>
            <div
              style={{
                background: 'var(--ink)',
                color: 'var(--cyan)',
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: '1.4px',
                padding: '5px 8px',
              }}
            >
              {city?.name}
            </div>
          </div>
        ) : null}

        <Link
          href={routes.event(lang, ev.slug)}
          style={{
            textDecoration: 'none',
            color: 'inherit',
            fontFamily: 'var(--display)',
            fontSize: feature ? 'clamp(20px,2.1vw,24px)' : 20,
            lineHeight: 1.03,
          }}
        >
          {ev.title}
        </Link>

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
          {hood ? ` · ${hood}` : ''}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
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
