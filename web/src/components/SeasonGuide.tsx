import Link from 'next/link'
import type { Metadata } from 'next'
import { translator, type Lang } from '../i18n'
import type { Event, Media } from '../payload-types'
import { getCity, getSeasonEvents, rel } from '../lib/data'
import { parseISO, shortMonth, todayISO } from '../lib/dates'
import { EVENT_CARD_SIZES, seasonCardUrl } from '../lib/eventCardUrl'
import { eventVenue } from '../lib/eventVenue'
import { breadcrumbJsonLd, eventJsonLd, eventListJsonLd } from '../lib/jsonld'
import { routes } from '../lib/routes'
import { groupByWeek, seasonWindow, type Season, type SeasonScene } from '../lib/seasons'
import { openGraph, twitterCard } from '../lib/site'
import { EventCard } from './EventCard'
import { JsonLd } from './JsonLd'
import { PageShell } from './PageShell'
import s from './chrome.module.css'

/**
 * A seasonal guide: /es/halloween and friends (lib/seasons.ts). The page
 * files under app/(frontend)/[lang]/ are a few lines each; everything a guide
 * draws is here, so the next season is a config entry and a copied page file.
 */

export function seasonMetadata(season: Season, lang: Lang): Metadata {
  const { year } = seasonWindow(season, todayISO())
  const title = season.metaTitle(lang, year)
  const description = season.description(lang, year)
  const path = (l: Lang) => routes.season(l, season.path)
  const image = seasonCardUrl(season.key, lang, 'link', year)
  return {
    title,
    description,
    openGraph: openGraph(lang, {
      title,
      description,
      url: path(lang),
      image,
      imageSize: EVENT_CARD_SIZES.link,
      imageAlt: season.title(lang, year),
    }),
    twitter: twitterCard(image),
    alternates: {
      canonical: path(lang),
      languages: { en: path('en'), es: path('es') },
    },
  }
}

export async function SeasonGuide({ season, lang }: { season: Season; lang: Lang }) {
  const t = translator(lang)
  const today = todayISO()
  const { year } = seasonWindow(season, today)
  const title = season.title(lang, year)
  const path = routes.season(lang, season.path)

  const [events, city] = await Promise.all([
    getSeasonEvents(lang, season.key, today),
    getCity(lang, season.card.city.slug),
  ])
  const mascot = city ? rel<Media>(city.solo) : null
  const weeks = groupByWeek(events, today)
  /**
   * A season with a drawn scene has it as the hero card's background. The
   * city's mascot is then left off the hero: over the scene's right side it
   * stands on the building it depicts (compared both ways in the PR).
   */
  const scene = season.card.scene

  return (
    <PageShell>
      <JsonLd
        data={[
          eventListJsonLd(
            title,
            path,
            events.map((ev) => eventJsonLd(lang, ev, eventVenue(ev))),
          ),
          breadcrumbJsonLd([
            { name: 'Flamingo County', path: routes.home(lang) },
            { name: t('Events'), path: routes.events(lang) },
            { name: title, path },
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
          gap: 'clamp(18px,3vw,26px)',
        }}
      >
        <article
          style={{
            background: 'var(--grad-cream)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--ink)',
          }}
        >
          {/* The season's `page` card, as on an event page: no mascot of its
              own, because the city's mascot is drawn over its right side. */}
          <div
            style={{
              position: 'relative',
              aspectRatio: `${EVENT_CARD_SIZES.page.width} / ${EVENT_CARD_SIZES.page.height}`,
              borderBottom: '4px solid var(--ink)',
              overflow: 'hidden',
              background: 'var(--ink)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={seasonCardUrl(season.key, lang, 'page', year)}
              // The title, year and line on it are all in the text below.
              alt=""
              width={EVENT_CARD_SIZES.page.width}
              height={EVENT_CARD_SIZES.page.height}
              fetchPriority="high"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            />
            {mascot?.url && !scene ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mascot.url}
                alt=""
                style={{
                  position: 'absolute',
                  right: '3%',
                  bottom: -14,
                  height: '72%',
                  width: 'auto',
                  maxWidth: '24%',
                  objectFit: 'contain',
                  objectPosition: 'bottom',
                  pointerEvents: 'none',
                  filter: 'drop-shadow(3px 3px 0 rgba(255,122,26,0.55))',
                }}
              />
            ) : null}
          </div>
          {scene ? <SceneCredit scene={scene} lang={lang} /> : null}

          <div
            style={{
              padding: 'clamp(18px,3.5vw,26px) clamp(16px,3.5vw,26px) 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 13,
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div
                style={{
                  background: 'var(--ink)',
                  color: 'var(--yellow)',
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '2px',
                  padding: '6px 10px',
                }}
              >
                {t('SEASONAL GUIDE')}
              </div>
              {events.length ? (
                <div
                  style={{
                    background: 'var(--yellow)',
                    border: '2px solid var(--ink)',
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '1.6px',
                    padding: '4px 9px',
                  }}
                >
                  {events.length} {t('IN THE GUIDE')}
                </div>
              ) : null}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontSize: 'clamp(30px,6.5vw,52px)',
                fontWeight: 400,
                lineHeight: 0.94,
                // Luckiest Guy's lowercase is a smaller cap that reads as
                // uneven in a headline; the text itself stays as written.
                textTransform: 'uppercase',
                textWrap: 'balance',
              }}
            >
              {title}
            </h1>
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
              {season.intro[lang]}
            </p>
          </div>
        </article>

        {weeks.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(22px,3.5vw,30px)' }}>
            {weeks.map((wk) => (
              <section key={wk.from} id={`week-${wk.from}`} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <WeekHeading
                  from={wk.from}
                  to={wk.to}
                  current={wk.current}
                  count={wk.items.length}
                  lang={lang}
                  accent={season.accent}
                  t={t}
                />
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,290px),1fr))',
                    gap: 'clamp(14px,2.5vw,20px)',
                  }}
                >
                  {wk.items.map((ev: Event) => (
                    <EventCard key={ev.id} lang={lang} ev={ev} t={t} guide />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <SeasonEmpty text={season.empty[lang]} />
        )}

        <Link
          href={routes.events(lang)}
          className={s.chip}
          style={{
            textDecoration: 'none',
            color: 'var(--ink)',
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            fontFamily: 'var(--display)',
            fontSize: 18,
            padding: '12px 18px 9px',
            border: '4px solid var(--ink)',
            background: 'var(--yellow)',
            boxShadow: '5px 5px 0 var(--ink)',
          }}
        >
          {t('SEE ALL EVENTS →')}
        </Link>
      </main>
    </PageShell>
  )
}

/**
 * "26 OCT – 1 NOV" on the season's colour, styled like the board's bucket
 * bars, with THIS WEEK on the week that holds today and the week's count.
 */
function WeekHeading({
  from,
  to,
  current,
  count,
  lang,
  accent,
  t,
}: {
  from: string
  to: string
  current: boolean
  count: number
  lang: Lang
  accent: string
  t: (s: string) => string
}) {
  const day = (iso: string) => parseISO(iso).getUTCDate()
  const range =
    from.slice(0, 7) === to.slice(0, 7)
      ? `${day(from)} – ${day(to)} ${shortMonth(to, lang)}`
      : `${day(from)} ${shortMonth(from, lang)} – ${day(to)} ${shortMonth(to, lang)}`
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        background: accent,
        border: '4px solid var(--ink)',
        boxShadow: '6px 6px 0 var(--ink)',
        padding: '11px 14px 9px',
      }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--display)',
          fontSize: 'clamp(20px,4.4vw,27px)',
          fontWeight: 400,
          lineHeight: 1,
        }}
      >
        {range}
      </h2>
      {current ? (
        <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.8px' }}>{t('THIS WEEK')}</div>
      ) : null}
      <div
        style={{
          marginLeft: 'auto',
          background: 'var(--ink)',
          color: 'var(--yellow)',
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: '1.4px',
          padding: '6px 9px',
        }}
      >
        {count}
      </div>
    </div>
  )
}

/**
 * The scene's credit under the hero: art adapted from a CC BY photo is
 * credited wherever it is shown, with the photo and the licence linked.
 */
function SceneCredit({ scene, lang }: { scene: SeasonScene; lang: Lang }) {
  const link = { color: 'inherit', textDecorationThickness: '1px', textUnderlineOffset: '2px' } as const
  return (
    <p
      data-scene-credit
      style={{
        margin: 0,
        padding: '8px clamp(16px,3.5vw,26px) 0',
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.4,
        letterSpacing: '0.2px',
        color: 'var(--ink)',
        opacity: 0.72,
      }}
    >
      {scene.credit.lead[lang]}
      <a href={scene.sourceUrl} rel="noopener" target="_blank" style={link}>
        {scene.credit.photo[lang]}
      </a>{' '}
      (
      <a href={scene.licenseUrl} rel="license noopener" target="_blank" style={link}>
        {scene.credit.license}
      </a>
      )
    </p>
  )
}

/** Nothing tagged is on yet: a friendly line, not an error. */
export function SeasonEmpty({ text }: { text: string }) {
  return (
    <div
      data-season-empty
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '7px 7px 0 var(--ink)',
        padding: 'clamp(20px,4vw,30px)',
        textAlign: 'center',
        fontWeight: 800,
        fontSize: 'clamp(15px,3.8vw,18px)',
        lineHeight: 1.45,
        textWrap: 'balance',
      }}
    >
      {text}
    </div>
  )
}
