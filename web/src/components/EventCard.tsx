import Link from 'next/link'
import type { City, Event, EventKind, Listing, Media } from '../payload-types'
import { rel } from '../lib/data'
import { routes } from '../lib/routes'
import { dateOnly, shortWeekday } from '../lib/dates'
import type { Lang } from '../i18n'
import { MediaSlot } from './MediaSlot'
import { EventActions } from './EventActions'
import s from './chrome.module.css'

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
 * The event card on the events board.
 *
 * The top half — the picture and the title — is one link to the event, so the
 * whole thing is a tap target rather than just the title's text. The venue
 * line sits below it because it can be a link of its own (to the business),
 * and anchors cannot nest.
 *
 * Every card gets a picture. Most events have no photo, so the frame falls back
 * to the event kind's colour with the city mascot leaning in; the badges and
 * the date flag sit on top either way, so the grid keeps one shape.
 */
export function EventCard({
  lang,
  ev,
  t,
}: {
  lang: Lang
  ev: Event
  t: (s: string) => string
}) {
  const kind = rel<EventKind>(ev.kind)
  const { listing, city, name, hood } = eventVenue(ev)
  const mascot = city ? rel<Media>(city.solo) : null
  const photo = rel<Media>(ev.image)
  const iso = dateOnly(ev.date)

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
            background: photo?.url ? 'var(--ink)' : (kind?.bg ?? 'var(--grad-pink)'),
          }}
        >
          {photo?.url ? (
            <MediaSlot media={photo} sizes="(max-width: 700px) 100vw, 330px" />
          ) : mascot?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mascot.url}
              alt=""
              style={{
                position: 'absolute',
                right: 4,
                bottom: -8,
                height: '70%',
                width: 'auto',
                pointerEvents: 'none',
                filter: 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))',
              }}
            />
          ) : null}
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 6,
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
            }}
          >
            {shortWeekday(iso, lang)} {new Date(`${iso}T12:00:00Z`).getUTCDate()}
          </div>
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
