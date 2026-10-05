import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { openGraph, twitterCard } from '../../../../../lib/site'
import { getCity, getEvent, getEvents, rel } from '../../../../../lib/data'
import { dateOnly, parseISO, shortMonth, shortWeekday } from '../../../../../lib/dates'
import type { City, EventKind, Media } from '../../../../../payload-types'
import { JsonLd } from '../../../../../components/JsonLd'
import { breadcrumbJsonLd, eventJsonLd, mediaUrl } from '../../../../../lib/jsonld'
import { PageShell } from '../../../../../components/PageShell'
import { MediaSlot } from '../../../../../components/MediaSlot'
import { FULL_WIDTH_SIZES } from '../../../../../lib/srcset'
import { EventActions } from '../../../../../components/EventActions'
import { eventActionStrings, eventStatusLabel, eventVenue } from '../../../../../components/EventCard'
import { EVENT_CARD_SIZES, eventCardUrl } from '../../../../../lib/eventCardUrl'
import { eventSource } from '../../../../../lib/eventVenue'
import s from '../../../../../components/chrome.module.css'

/**
 * Rendered per request, always.
 *
 * `generateStaticParams` below is kept because it is the way back to static
 * rendering if that is ever wanted (see CMS.md). But this page reads the
 * request header the nav uses for its active section, so Next must not attempt
 * to statically generate it — in a production build whose database is empty at
 * build time, `generateStaticParams` returns nothing and Next falls back to
 * generating on demand, where that header read throws DYNAMIC_SERVER_USAGE and
 * the route 500s. Dev and a locally-seeded build both hide this; the container
 * does not.
 */
export const dynamic = 'force-dynamic'


export async function generateStaticParams() {
  const events = await getEvents('en')
  return events.flatMap((e) => [
    { lang: 'en', slug: e.slug },
    { lang: 'es', slug: e.slug },
  ])
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLang(lang)) return {}
  const ev = await getEvent(lang, slug)
  if (!ev) return {}
  // No photo: the generated card, so a shared link still has a picture.
  const photo = mediaUrl(ev.image)
  const image = photo ?? eventCardUrl(ev, lang, 'link')
  return {
    title: ev.title,
    description: ev.note ?? undefined,
    openGraph: openGraph(lang, {
      title: ev.title,
      description: ev.note ?? undefined,
      url: routes.event(lang, slug),
      image,
      imageSize: photo ? undefined : EVENT_CARD_SIZES.link,
      imageAlt: photo ? undefined : ev.title,
    }),
    twitter: twitterCard(image),
    alternates: {
      canonical: routes.event(lang, slug),
      languages: { en: routes.event('en', slug), es: routes.event('es', slug) },
    },
  }
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)

  const ev = await getEvent(lang, slug)
  if (!ev) notFound()

  const kind = rel<EventKind>(ev.kind)
  const { listing, city: cityRef, name: venue, hood } = eventVenue(ev)
  const city = cityRef ? await getCity(lang, cityRef.slug) : null
  const mascot = city ? rel<Media>(city.solo) : null

  /**
   * The venue's own mark, drawn straight onto the event's photograph.
   *
   * An event photograph shows what happens; it does not always show where. The
   * club's lunch is a picture of the club, and nothing in it says Casa Marín —
   * so the venue's mark goes on top of it.
   *
   * `logo`, never `gallery[0]`. The storefront photo is a rectangle with its
   * own background, and a photo of one place pasted into the corner of a photo
   * of another reads as a mistake; `logo` is the mark on transparency, and the
   * field's admin description says so. A venue with no logo — which is nearly
   * all of them — renders nothing here and the badges sit where they always
   * did. `getEvent` reads at depth 3, so it arrives populated.
   */
  const venueMark = listing ? rel<Media>(listing.logo) : null

  /**
   * No photo: the generated event card fills the hero instead of an empty
   * frame. It is the `page` card, which leaves out the mascot and its arch
   * because this page draws its own mascot over the hero's right side, and
   * the card's text stops short of it (860 of 1200). The card carries the
   * city, kind and date itself, so the badges and the date flag the page
   * puts on a photograph are left off; a status or "who gets in" label moves
   * to the line under the title.
   */
  const hasPhoto = !!rel<Media>(ev.image)?.url
  const heroCard = hasPhoto ? null : eventCardUrl(ev, lang, 'page')
  const source = eventSource(ev, lang)

  const iso = dateOnly(ev.date)
  const day = parseISO(iso).getUTCDate()

  const others = (await getEvents(lang)).filter(
    (o) => o.slug !== ev.slug && dateOnly(o.date) === iso,
  )

  return (
    <PageShell>
      <JsonLd
        data={[
          eventJsonLd(lang, ev, { listing, city: cityRef, name: venue }),
          breadcrumbJsonLd([
            { name: 'Flamingo County', path: routes.home(lang) },
            { name: t('Events'), path: routes.events(lang) },
            { name: ev.title, path: routes.event(lang, slug) },
          ]),
        ]}
      />
      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: 'clamp(14px,3.5vw,22px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(16px,3vw,22px)',
        }}
      >
        <Link
          href={routes.events(lang)}
          className={s.chip}
          style={{
            textDecoration: 'none',
            color: 'var(--ink)',
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            fontFamily: 'var(--display)',
            fontSize: 15,
            padding: '9px 14px 7px',
            border: '4px solid var(--ink)',
            background: 'var(--grad-cream)',
            boxShadow: '4px 4px 0 var(--ink)',
          }}
        >
          {t('← ALL EVENTS')}
        </Link>

        <article
          style={{
            background: 'var(--grad-cream)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--ink)',
          }}
        >
          <div
            style={{
              position: 'relative',
              // The card keeps its own 1200:630 shape, so none of it is
              // cropped; a photograph fills the usual strip.
              ...(heroCard
                ? { aspectRatio: `${EVENT_CARD_SIZES.page.width} / ${EVENT_CARD_SIZES.page.height}` }
                : { height: 'clamp(190px,40vw,320px)' }),
              borderBottom: '4px solid var(--ink)',
              overflow: 'hidden',
              // The city's colour behind the card while it loads.
              background: hasPhoto ? 'var(--ink)' : (city?.accent ?? kind?.bg ?? 'var(--grad-pink)'),
            }}
          >
            {heroCard ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroCard}
                // Everything on it is also on the page, in text.
                alt=""
                width={EVENT_CARD_SIZES.page.width}
                height={EVENT_CARD_SIZES.page.height}
                fetchPriority="high"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
              />
            ) : (
              <MediaSlot media={ev.image} sizes={FULL_WIDTH_SIZES} priority />
            )}
            {heroCard ? null : (
            <div
              style={{
                position: 'absolute',
                left: 16,
                top: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 7,
                pointerEvents: 'none',
              }}
            >
              {venueMark?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={venueMark.url}
                  alt=""
                  style={{
                    /**
                     * Width only — the mark keeps its own proportions, and no
                     * frame is drawn around it. It is sized against the hero's
                     * `clamp(190px,40vw,320px)` so the column under it clears
                     * the bottom edge: at the 190px floor the mark is 70px wide
                     * and the three badges below come to ~160px from `top:16`.
                     */
                    width: 'clamp(70px,15vw,116px)',
                    height: 'auto',
                    display: 'block',
                    /**
                     * The photograph behind it is whatever the event supplied.
                     * The same ink shadow the date flag and the mascot carry
                     * keeps the mark off a light one.
                     */
                    filter: 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))',
                  }}
                />
              ) : null}
              <div
                style={{
                  background: 'var(--ink)',
                  color: 'var(--cyan)',
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '1.6px',
                  padding: '6px 9px',
                }}
              >
                {city?.name}
              </div>
              <div
                style={{
                  background: kind?.bg ?? 'var(--grad-pink)',
                  color: kind?.ink ?? 'var(--cream)',
                  border: '3px solid var(--ink)',
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '1.5px',
                  padding: '6px 9px',
                }}
              >
                {kind?.label}
              </div>
              {eventStatusLabel(ev, t) ? (
                <div
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--cream)',
                    border: '3px solid var(--ink)',
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '1.5px',
                    padding: '6px 9px',
                  }}
                >
                  {eventStatusLabel(ev, t)}
                </div>
              ) : null}
              {ev.freeLabel ? (
                <div
                  style={{
                    background: 'var(--yellow)',
                    border: '3px solid var(--ink)',
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '1.5px',
                    padding: '6px 9px',
                  }}
                >
                  {ev.freeLabel}
                </div>
              ) : null}
            </div>
            )}
            {heroCard ? null : (
            <div
              style={{
                position: 'absolute',
                right: 16,
                top: 16,
                background: 'var(--yellow)',
                border: '4px solid var(--ink)',
                padding: '9px 14px 6px',
                textAlign: 'center',
                transform: 'rotate(3deg)',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '2px' }}>
                {shortWeekday(iso, lang)}
              </div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 34, lineHeight: 1 }}>
                {day}
              </div>
              <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: '2px' }}>
                {shortMonth(iso, lang)}
              </div>
            </div>
            )}
            {mascot?.url && heroCard ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mascot.url}
                alt=""
                style={{
                  position: 'absolute',
                  // In the right 28% the card leaves clear. The hero keeps the
                  // card's proportions, so a share of its height scales with
                  // it at every width, and there is no date flag to clear.
                  right: '3%',
                  bottom: -14,
                  height: '72%',
                  width: 'auto',
                  maxWidth: '24%',
                  objectFit: 'contain',
                  objectPosition: 'bottom',
                  pointerEvents: 'none',
                  filter: 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))',
                }}
              />
            ) : mascot?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mascot.url}
                alt=""
                style={{
                  position: 'absolute',
                  right: 12,
                  bottom: -14,
                  /**
                   * Shrinks with the hero so it never reaches the date badge.
                   *
                   * Both are anchored to the same right edge, and the hero
                   * bottoms out at 190px while a fixed 170px mascot did not —
                   * so under ~800px wide the flamingo's head covered the day
                   * and month. `40vw - 100px` tracks the hero's own
                   * `clamp(190px,40vw,320px)` and keeps the mascot's top below
                   * the badge at every width. Nobody had seen it: the site had
                   * no events, so this page had nothing to render.
                   */
                  height: 'clamp(92px, calc(40vw - 100px), 170px)',
                  width: 'auto',
                  pointerEvents: 'none',
                  filter: 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))',
                }}
              />
            ) : null}
          </div>

          <div
            style={{
              padding: 'clamp(18px,3.5vw,26px) clamp(16px,3.5vw,26px) 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 13,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontSize: 'clamp(28px,6.5vw,50px)',
                lineHeight: 0.94,
                maxWidth: '26ch',
                textWrap: 'balance',
              }}
            >
              {ev.title}
            </h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {ev.timeLabel ? (
                <div
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--cream)',
                    fontWeight: 800,
                    fontSize: 12,
                    letterSpacing: '1.4px',
                    padding: '7px 10px',
                  }}
                >
                  {ev.timeLabel}
                </div>
              ) : null}
              {/* With the card as the hero, the labels that sat on the photo come here. */}
              {heroCard && eventStatusLabel(ev, t) ? (
                <div
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--cream)',
                    border: '3px solid var(--ink)',
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '1.5px',
                    padding: '5px 9px',
                  }}
                >
                  {eventStatusLabel(ev, t)}
                </div>
              ) : null}
              {heroCard && ev.freeLabel ? (
                <div
                  style={{
                    background: 'var(--yellow)',
                    border: '3px solid var(--ink)',
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '1.5px',
                    padding: '5px 9px',
                  }}
                >
                  {ev.freeLabel}
                </div>
              ) : null}
              <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '1px' }}>
                {listing && city ? (
                  <Link
                    href={routes.business(lang, city.slug, listing.slug)}
                    style={{ color: 'inherit' }}
                  >
                    {venue}
                  </Link>
                ) : (
                  venue
                )}
                {hood ? ` · ${hood}` : ''}
              </div>
            </div>
            {ev.note ? (
              <p
                style={{
                  margin: 0,
                  fontSize: 'clamp(15px,3.8vw,18px)',
                  fontWeight: 600,
                  lineHeight: 1.5,
                  maxWidth: '66ch',
                  textWrap: 'pretty',
                }}
              >
                {ev.note}
              </p>
            ) : null}
            {source ? (
              /**
               * Where the event comes from, so a reader can check it with
               * whoever puts it on. A listing organizer links to its page
               * here; anything else links out to its own site.
               */
              <p
                style={{
                  margin: 0,
                  fontWeight: 800,
                  fontSize: 13,
                  letterSpacing: '0.6px',
                  overflowWrap: 'anywhere',
                }}
              >
                {source.href ? t('More info:') : t('Organized by')}{' '}
                {source.href && source.external ? (
                  <a
                    href={source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--magenta)', textUnderlineOffset: 3, textDecorationThickness: 2 }}
                  >
                    {source.name}&nbsp;↗
                  </a>
                ) : source.href ? (
                  <Link
                    href={source.href}
                    style={{ color: 'var(--magenta)', textUnderlineOffset: 3, textDecorationThickness: 2 }}
                  >
                    {source.name}&nbsp;→
                  </Link>
                ) : (
                  source.name
                )}
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

        {others.length ? (
          <section
            style={{
              background: 'var(--ink)',
              border: '4px solid var(--ink)',
              boxShadow: '8px 8px 0 var(--cream)',
              padding: 'clamp(16px,3vw,22px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--display)',
                  fontSize: 'clamp(20px,4.6vw,26px)',
                  fontWeight: 400,
                  color: 'var(--yellow)',
                  lineHeight: 1,
                }}
              >
                {t('ALSO THAT DAY')}
              </h2>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '1.8px',
                  color: 'var(--cyan)',
                }}
              >
                {shortWeekday(iso, lang)} {day} {shortMonth(iso, lang)}
              </div>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))',
                gap: 12,
              }}
            >
              {others.map((o) => {
                const ok = rel<EventKind>(o.kind)
                const ov = eventVenue(o)
                return (
                  <Link
                    key={o.id}
                    href={routes.event(lang, o.slug)}
                    className={s.cardCyan}
                    style={{
                      textDecoration: 'none',
                      color: 'var(--ink)',
                      background: 'var(--grad-cream)',
                      border: '4px solid var(--ink)',
                      boxShadow: '5px 5px 0 var(--cyan)',
                      padding: '12px 13px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div
                        style={{
                          background: ok?.bg ?? 'var(--grad-pink)',
                          color: ok?.ink ?? 'var(--cream)',
                          border: '2px solid var(--ink)',
                          fontWeight: 800,
                          fontSize: 9.5,
                          letterSpacing: '1.3px',
                          padding: '4px 7px',
                        }}
                      >
                        {ok?.label}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.2px' }}>
                        {o.timeLabel}
                      </div>
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--display)',
                        fontSize: 18,
                        lineHeight: 1.06,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {o.title}
                    </div>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 10,
                        letterSpacing: '1.2px',
                        color: 'var(--magenta)',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {ov.name} · {ov.city?.name}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ) : null}
      </main>
    </PageShell>
  )
}
