import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { openGraph } from '../../../../lib/site'
import { placesOnLines } from '../../../../lib/rides'
import {
  CITY_TRANSIT_PHONE,
  LINKS,
  ROUTE_STYLE,
  TRANSIT,
  headwayToday,
  formatHeadway,
  walkMinutes,
  type TransitRoute,
} from '../../../../lib/transit'
import { PageShell } from '../../../../components/PageShell'
import {
  HoursLines,
  LineBullet,
  serviceStatusText,
  nearMeCopy,
  leaveCopy,
  rideMapCopy,
  busWordsCopy,
  busesNowCopy,
  nearMePlaces,
  routeHrefs,
  PrimaryButton,
  SecondaryButton,
  ServiceStatusChip,
  Tag,
  ends,
  fill,
} from '../../../../components/Transit'
import { NearMe } from '../../../../components/NearMe'
import { BusesNow } from '../../../../components/LiveTransit'
import { CityMap } from '../../../../components/CityMap'
import { cityMap } from '../../../../lib/citymap'
import tr from '../../../../components/transit.module.css'
import fr from '../../../../components/freerides.module.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const t = translator(lang)
  const title = t('Free buses in Hialeah: the Flamingo and Marlin lines')
  const description = t(
    'Where Hialeah’s two free bus lines go, when they run, and the local spots a short walk from a stop. No fare, no card.',
  )
  return {
    title,
    description,
    openGraph: openGraph(lang, { title, description, url: routes.freeRides(lang) }),
    alternates: {
      canonical: routes.freeRides(lang),
      languages: { en: routes.freeRides('en'), es: routes.freeRides('es') },
    },
  }
}

/** Spots shown before "See all": enough to show what's there, not a wall of cards. */
const SPOTS_SHOWN = 6

export default async function FreeRidesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)
  const places = await placesOnLines(lang)
  const status = serviceStatusText(lang, t)

  const spotCard = (p: (typeof places)[number]) => (
    <Link
      key={`${p.listing.id}-${p.stop.route.slug}`}
      href={routes.business(lang, p.citySlug, p.listing.slug)}
      className={tr.place}
      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: 14 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LineBullet route={p.stop.route} size={30} />
        <span
          style={{
            fontFamily: 'var(--display)',
            fontSize: 22,
            lineHeight: 1,
            paddingTop: 3,
          }}
        >
          {fill(t('{n} MIN WALK'), { n: walkMinutes(p.stop.meters) })}
        </span>
      </span>
      <span style={{ fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1.05 }}>
        {p.listing.name}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
        {fill(t('{name} stop: {stop}'), {
          name: p.stop.route.name,
          stop: p.stop.stopName,
        })}
      </span>
    </Link>
  )

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(18px,3vw,26px)',
        }}
      >
        <div className={fr.top}>
          {/* --- Hero --- */}
          <header className={fr.hero}>
            <div
              style={{
                alignSelf: 'flex-start',
                background: 'var(--yellow)',
                color: 'var(--ink)',
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '1.6px',
                padding: '6px 10px 5px',
              }}
            >
              {t('HIALEAH · FREE TRANSIT')}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontWeight: 400,
                fontSize: 'clamp(42px,10vw,92px)',
                lineHeight: 0.9,
                letterSpacing: '0.5px',
              }}
            >
              {t('RIDE THE CITY')}
              <br />
              <span style={{ color: 'var(--yellow)' }}>{t('FOR FREE.')}</span>
            </h1>
            <p style={{ margin: 0, maxWidth: '56ch', fontSize: 'clamp(17px,4vw,19px)', fontWeight: 600, lineHeight: 1.5, textWrap: 'pretty' }}>
              {t('Two free bus lines cross Hialeah, both directions, six days a week. No fare, no card — just get on.')}{' '}
              <span className={fr.heroMore}>{t('Here is where they go and what is a short walk from each stop.')}</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <ServiceStatusChip lang={lang} t={t} />
            </div>
          </header>

          {/* --- From wherever the visitor is: first thing on a phone --- */}
          <div className={fr.near}>
            <NearMe
              copy={nearMeCopy(t)}
              leave={leaveCopy(t)}
              mapCopy={rideMapCopy(t)}
              busWords={busWordsCopy(t)}
              lang={lang}
              places={nearMePlaces(places, lang)}
              routeHref={routeHrefs(lang)}
            />
          </div>

          {/* --- The drawn city map, live buses on it --- */}
          <div className={fr.map}>
            <CityMap
              model={cityMap(places, lang)}
              running={status.live}
              busWords={busWordsCopy(t)}
              copy={{
                title: t('Map of Hialeah with the Flamingo and Marlin free bus lines'),
                status: status.live ? t('ILLUSTRATION · NOT LIVE') : t('BUSES PARKED'),
                note: t('Buses move to show how often they come, not where they are right now. Tap a dot to open the spot.'),
                spots: t('Flamingo County spots'),
                rail: 'Metrorail',
                liveStatus: t('LIVE · {n} BUSES · {s}S AGO'),
                liveNote: t('Live positions from the City of Hialeah’s ETA SPOT tracker, every 15 seconds.'),
                busTitle: t('{name} bus · next stop {stop}{delay}'),
                late: t(' · {n} min late'),
                onTime: t(' · on time'),
                tapBus: t('Tap a bus to see where it’s going and when it gets to its next stop.'),
                close: t('Close'),
              }}
            />
          </div>
        </div>

        {/* --- The two lines --- */}
        <div
          data-stack
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'clamp(18px,3vw,24px)',
            alignItems: 'stretch',
          }}
        >
          {TRANSIT.routes.map((r) => (
            <LineCard
              key={r.slug}
              route={r}
              lang={lang}
              t={t}
              spots={places.filter((p) => p.stop.route.slug === r.slug).length}
            />
          ))}
        </div>

        {/* --- Hours, riding, live tracking --- */}
        <div
          data-stack
          style={{
            display: 'grid',
            gridTemplateColumns: '0.9fr 1.1fr',
            gap: 'clamp(18px,3vw,24px)',
            alignItems: 'start',
          }}
        >
          <section
            aria-labelledby="hours"
            style={{
              background: 'var(--ink)',
              color: 'var(--cream)',
              border: '4px solid var(--ink)',
              boxShadow: '8px 8px 0 var(--cream)',
              padding: 'clamp(16px,3.5vw,24px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <h2
              id="hours"
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontWeight: 400,
                fontSize: 24,
                color: 'var(--yellow)',
              }}
            >
              {t('WHEN THEY RUN')}
            </h2>
            <HoursLines lang={lang} t={t} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, color: '#c9ced4' }}>
              {t('Both lines, both directions. Hours are the City of Hialeah’s.')}
            </p>
            {/* For anyone who would rather ask a person than read a page. */}
            <a
              href={`tel:${CITY_TRANSIT_PHONE.replace(/[^\d]/g, '')}`}
              className={tr.btn}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                minHeight: 56,
                background: 'var(--cream)',
                color: 'var(--ink)',
                border: '4px solid var(--ink)',
                boxShadow: '4px 4px 0 var(--cyan)',
                fontWeight: 800,
                fontSize: 18,
                padding: '10px 14px',
                textAlign: 'center',
              }}
            >
              <span aria-hidden="true">📞</span>
              {fill(t('Call Hialeah Transit · {phone}'), { phone: CITY_TRANSIT_PHONE })}
            </a>
          </section>

          <section
            id="live"
            aria-labelledby="live-h"
            style={{
              background: 'var(--grad-cream)',
              border: '4px solid var(--ink)',
              boxShadow: '8px 8px 0 var(--ink)',
              padding: 'clamp(16px,3.5vw,24px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              scrollMarginTop: 120,
            }}
          >
            <h2
              id="live-h"
              style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 24 }}
            >
              {t('WHERE IS MY BUS?')}
            </h2>
            <BusesNow copy={busesNowCopy(t)} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, textWrap: 'pretty' }}>
              {t('Prefer an app? The city’s free ETA SPOT app shows the same buses: pick “Hialeah Transit System”, then your line.')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <SecondaryButton href={LINKS.etaSpotIos} external>
                {t('ETA SPOT · iPhone')}
              </SecondaryButton>
              <SecondaryButton href={LINKS.etaSpotAndroid} external>
                {t('ETA SPOT · Android')}
              </SecondaryButton>
            </div>
            <ul
              style={{
                margin: '4px 0 0',
                padding: 0,
                listStyle: 'none',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,190px),1fr))',
                gap: '8px 16px',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {[
                t('Free WiFi on board'),
                t('Bike rack on every bus'),
                t('Wheelchair accessible'),
                t('No open food or drinks'),
                t('Headphones for anything with sound'),
                t('Drivers don’t take tips'),
              ].map((x) => (
                <li key={x} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span aria-hidden="true" style={{ fontWeight: 800 }}>
                    ✓
                  </span>
                  {x}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* --- Spots a short walk from a stop --- */}
        {places.length ? (
          <section
            aria-labelledby="spots"
            style={{
              background: 'var(--grad-cream)',
              border: '4px solid var(--ink)',
              boxShadow: '9px 9px 0 var(--ink)',
              padding: 'clamp(16px,3.5vw,26px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <Tag bg="var(--grad-pink)" fg="var(--cream)">
              <span id="spots">{t('SPOTS ON THE FREE LINES')}</span>
            </Tag>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.5,
                maxWidth: '60ch',
              }}
            >
              {t(
                'Every place on Flamingo County that sits within a ten-minute walk of a free stop.',
              )}
            </p>
            <div className={tr.spotGrid}>{places.slice(0, SPOTS_SHOWN).map(spotCard)}</div>
            {places.length > SPOTS_SHOWN ? (
              <details className={tr.moreSpots}>
                <summary>{fill(t('See all {n} spots'), { n: places.length })}</summary>
                <div className={tr.spotGrid}>{places.slice(SPOTS_SHOWN).map(spotCard)}</div>
              </details>
            ) : null}
          </section>
        ) : null}

        {/* --- Beyond the two lines --- */}
        <section
          aria-labelledby="more"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <Tag>
            <span id="more">{t('MORE FREE WAYS AROUND')}</span>
          </Tag>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,270px),1fr))',
              gap: 'clamp(14px,2.5vw,20px)',
            }}
          >
            <MoreTile
              title="FREEBEE"
              where={t('Hialeah & Miami Lakes')}
              body={t(
                'Free on-demand electric rides. Book one in the Freebee app — Miami Lakes runs it instead of a bus line.',
              )}
              links={[
                { href: LINKS.freebeeIos, label: 'iPhone' },
                { href: LINKS.freebeeAndroid, label: 'Android' },
              ]}
              bg="var(--yellow)"
            />
            <MoreTile
              title={t('LITTLE HAVANA TROLLEY')}
              where={t('City of Miami')}
              body={t(
                'Free trolley through Little Havana to Brickell, seven days a week. Mon–Sat 6:30 AM–11 PM, Sun 8 AM–8 PM.',
              )}
              links={[
                { href: LINKS.miamiTrolleyLive, label: t('Track it live') },
                { href: LINKS.miamiTrolley, label: t('Routes & maps') },
              ]}
              bg="var(--grad-cyan)"
            />
            <MoreTile
              title="METROMOVER"
              where={t('Downtown & Brickell')}
              body={t(
                'Miami-Dade’s free elevated train loops downtown, Brickell and Omni. The Little Havana trolley meets it at Brickell.',
              )}
              links={[{ href: LINKS.metromover, label: t('Stations & hours') }]}
              bg="var(--grad-cream)"
            />
          </div>
        </section>

        <p
          style={{
            margin: 0,
            alignSelf: 'flex-start',
            maxWidth: '80ch',
            background: 'var(--cream)',
            border: '3px solid var(--ink)',
            padding: '10px 14px',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.55,
          }}
        >
          {fill(
            t(
              'Live buses and arrival times: the City of Hialeah’s ETA SPOT tracker, by ETA Transit Systems. Stops and ride times: Miami-Dade Transit (updated {date}). Hours: City of Hialeah. Map: US Census Bureau.',
            ),
            { date: TRANSIT.source.fetchedAt },
          )}{' '}
          <a
            href={LINKS.cityTransit}
            rel="noopener noreferrer"
            style={{ fontWeight: 800, textDecoration: 'underline' }}
          >
            hialeahfl.gov
          </a>
        </p>
      </main>
    </PageShell>
  )
}

function LineCard({
  route,
  lang,
  t,
  spots,
}: {
  route: TransitRoute
  lang: Lang
  t: (s: string) => string
  spots: number
}) {
  const st = ROUTE_STYLE[route.slug]
  const [from, to] = ends(route)
  const headway = headwayToday(route)

  return (
    <article
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '9px 9px 0 var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <div
        style={{
          background: st.grad,
          color: st.ink,
          borderBottom: '4px solid var(--ink)',
          padding: 'clamp(14px,3vw,20px)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <LineBullet route={route} size={58} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1.6px' }}>
            {t('FREE BUS LINE')}
          </div>
          <h2
            style={{
              margin: '6px 0 0',
              fontFamily: 'var(--display)',
              fontWeight: 400,
              fontSize: 'clamp(34px,7vw,46px)',
              lineHeight: 0.95,
            }}
          >
            {route.name.toUpperCase()}
          </h2>
        </div>
      </div>

      <div
        style={{
          padding: 'clamp(14px,3vw,22px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          flex: 1,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.35 }}>
          {from} <span aria-label={t('to and from')}>⇄</span> {to}
        </div>

        <dl
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
            gap: 10,
          }}
        >
          {[
            {
              k: t('BETWEEN BUSES'),
              v: headway ? formatHeadway(headway, lang).replace(/^(every|cada) /, '') : '—',
            },
            { k: t('END TO END'), v: `${route.rideMinutes} min` },
            { k: t('STOPS'), v: String(route.stations.length) },
          ].map(({ k, v }) => (
            <div
              key={k}
              style={{
                border: '3px solid var(--ink)',
                background: 'var(--cream)',
                padding: '8px 10px',
              }}
            >
              <dt style={{ fontWeight: 800, fontSize: 10, letterSpacing: '1.2px' }}>{k}</dt>
              <dd
                style={{
                  margin: '4px 0 0',
                  fontFamily: 'var(--display)',
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                {v}
              </dd>
            </div>
          ))}
        </dl>


        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'space-between',
          }}
        >
          <PrimaryButton href={routes.freeRoute(lang, route.slug)}>
            {t('SEE EVERY STOP →')}
          </PrimaryButton>
          {spots ? (
            <span style={{ fontWeight: 800, fontSize: 13 }}>
              {fill(t(spots === 1 ? '1 spot on this line' : '{n} spots on this line'), {
                n: spots,
              })}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function MoreTile({
  title,
  where,
  body,
  links,
  bg,
}: {
  title: string
  where: string
  body: string
  links: { href: string; label: string }[]
  bg: string
}) {
  return (
    <article
      style={{
        background: bg,
        border: '4px solid var(--ink)',
        boxShadow: '7px 7px 0 var(--ink)',
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.4px' }}>
        {where.toUpperCase()}
      </div>
      <h3
        style={{
          margin: 0,
          fontFamily: 'var(--display)',
          fontWeight: 400,
          fontSize: 24,
          lineHeight: 1,
        }}
      >
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.5, textWrap: 'pretty' }}>
        {body}
      </p>
      <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            rel="noopener noreferrer"
            target="_blank"
            className={tr.btn}
            style={{
              background: 'var(--ink)',
              color: 'var(--cream)',
              fontWeight: 800,
              fontSize: 13,
              padding: '8px 11px 7px',
              border: '3px solid var(--ink)',
            }}
          >
            {l.label} ↗
          </a>
        ))}
      </div>
    </article>
  )
}
