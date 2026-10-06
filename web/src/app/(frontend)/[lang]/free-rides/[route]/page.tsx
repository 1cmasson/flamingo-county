import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { openGraph } from '../../../../../lib/site'
import { placesOnLines } from '../../../../../lib/rides'
import { LINKS, ROUTE_STYLE, TRANSIT, formatHeadway, getRoute, headwayToday, walkMinutes } from '../../../../../lib/transit'
import { PageShell } from '../../../../../components/PageShell'
import {
  HoursLines,
  LineBullet,
  RouteStrip,
  SecondaryButton,
  ServiceStatusChip,
  ends,
  fill,
  nearMeCopy,
  leaveCopy,
  rideMapCopy,
  busWordsCopy,
  stripLiveCopy,
  nearMePlaces,
  routeHrefs,
  trackLiveHref,
} from '../../../../../components/Transit'
import { NearMe } from '../../../../../components/NearMe'
import { StripLive } from '../../../../../components/LiveTransit'
import { StopHighlight } from '../../../../../components/StopHighlight'
import tr from '../../../../../components/transit.module.css'
import s from '../../../../../components/chrome.module.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; route: string }>
}): Promise<Metadata> {
  const { lang, route: slug } = await params
  const route = getRoute(slug)
  if (!isLang(lang) || !route) return {}
  const t = translator(lang)
  const [from, to] = ends(route, t)
  const title = fill(t('{name} free bus: every stop, Hialeah'), { name: route.name })
  const description = fill(t('Every stop on Hialeah’s free {name} line, {from} to {to}, with ride times and the spots near each stop.'), {
    name: route.name,
    from,
    to,
  })
  return {
    title,
    description,
    openGraph: openGraph(lang, { title, description, url: routes.freeRoute(lang, slug) }),
    alternates: {
      canonical: routes.freeRoute(lang, slug),
      languages: { en: routes.freeRoute('en', slug), es: routes.freeRoute('es', slug) },
    },
  }
}

export default async function FreeRoutePage({ params }: { params: Promise<{ lang: string; route: string }> }) {
  const { lang, route: slug } = await params
  if (!isLang(lang)) notFound()
  const route = getRoute(slug)
  if (!route) notFound()
  const t = translator(lang as Lang)

  const [places, live] = await Promise.all([placesOnLines(lang), trackLiveHref(lang, route)])
  const mine = places.filter((p) => p.stop.route.slug === route.slug)
  const other = TRANSIT.routes.find((r) => r.slug !== route.slug)
  const st = ROUTE_STYLE[route.slug]
  const [from, to] = ends(route, t)
  const headway = headwayToday(route)

  return (
    <PageShell>
      <StopHighlight />
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
          href={routes.freeRides(lang)}
          className={s.chip}
          style={{
            alignSelf: 'flex-start',
            textDecoration: 'none',
            color: 'inherit',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--display)',
            fontSize: 15,
            padding: '9px 14px 7px',
            border: '4px solid var(--ink)',
            background: 'var(--grad-cream)',
            boxShadow: '4px 4px 0 var(--ink)',
          }}
        >
          {t('← ALL FREE RIDES')}
        </Link>

        {/* --- Masthead in the line's colour --- */}
        <header
          style={{
            background: st.grad,
            color: st.ink,
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--ink)',
            padding: 'clamp(18px,4vw,32px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px,3vw,20px)' }}>
            <LineBullet route={route} size={72} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1.6px' }}>{t('HIALEAH · FREE BUS LINE')}</div>
              <h1
                style={{
                  // Luckiest Guy's caps ride high in a 0.9 line box; without
                  // this the kicker above sits on top of them.
                  margin: '8px 0 0',
                  fontFamily: 'var(--display)',
                  fontWeight: 400,
                  fontSize: 'clamp(44px,11vw,88px)',
                  lineHeight: 0.9,
                }}
              >
                {route.name.toUpperCase()}
              </h1>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 'clamp(16px,4vw,19px)', fontWeight: 800, lineHeight: 1.35 }}>
            {from} ⇄ {to}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <ServiceStatusChip lang={lang} t={t} />
            <span
              style={{
                background: 'var(--cream)',
                color: 'var(--ink)',
                border: '3px solid var(--ink)',
                fontWeight: 800,
                fontSize: 12,
                padding: '6px 10px 5px',
              }}
            >
              {[
                headway ? formatHeadway(headway, lang) : null,
                fill(t('{n} min end to end'), { n: route.rideMinutes }),
                t('FREE'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </header>

        <NearMe
          copy={nearMeCopy(t)}
          leave={leaveCopy(t)}
          mapCopy={rideMapCopy(t)}
          busWords={busWordsCopy(t)}
          lang={lang}
          places={nearMePlaces(mine, lang)}
          only={route.slug}
          routeHref={routeHrefs(lang)}
        />

        <div
          data-stack
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,0.9fr)',
            gap: 'clamp(16px,3vw,22px)',
            alignItems: 'start',
          }}
        >
          {/* --- Every stop --- */}
          <section
            aria-labelledby="stops"
            style={{
              background: 'var(--grad-cream)',
              border: '4px solid var(--ink)',
              boxShadow: '8px 8px 0 var(--ink)',
              padding: 'clamp(16px,3.5vw,26px) clamp(10px,3vw,24px) 6px',
            }}
          >
            <h2 id="stops" style={{ margin: '0 0 4px', fontFamily: 'var(--display)', fontWeight: 400, fontSize: 26 }}>
              {t('EVERY STOP')}
            </h2>
            <p style={{ margin: '0 0 18px', fontSize: 14, fontWeight: 600, lineHeight: 1.5, maxWidth: '58ch' }}>
              {fill(t('It runs both ways. Minutes are ride time from {from}. Tap “more stops” to see every corner in between.'), {
                from,
              })}
            </p>
            <StripLive route={route.slug} name={route.name} copy={stripLiveCopy(t)} />
            <RouteStrip route={route} places={places} lang={lang} t={t} />
          </section>

          {/* --- Sidebar --- */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <section
              aria-labelledby="ride"
              style={{
                background: 'var(--ink)',
                color: 'var(--cream)',
                border: '4px solid var(--ink)',
                boxShadow: '8px 8px 0 var(--cream)',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <h2 id="ride" style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 22, color: 'var(--yellow)' }}>
                {t('WHEN IT RUNS')}
              </h2>
              <HoursLines lang={lang} t={t} />
              <div id="live" style={{ scrollMarginTop: 120, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.5, color: '#c9ced4' }}>
                  {t('See where the bus is right now in the free ETA SPOT app: pick “Hialeah Transit System”, then your line.')}
                </p>
                {live.external ? (
                  <SecondaryButton href={live.href} external>
                    {t('TRACK IT LIVE ↗')}
                  </SecondaryButton>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <SecondaryButton href={LINKS.etaSpotIos} external>
                      iPhone ↗
                    </SecondaryButton>
                    <SecondaryButton href={LINKS.etaSpotAndroid} external>
                      Android ↗
                    </SecondaryButton>
                  </div>
                )}
              </div>
            </section>

            {mine.length ? (
              <section
                aria-labelledby="near"
                style={{
                  background: 'var(--yellow)',
                  border: '4px solid var(--ink)',
                  boxShadow: '8px 8px 0 var(--ink)',
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <h2 id="near" style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 22, lineHeight: 1.05 }}>
                  {t('SPOTS ON THIS LINE')}
                </h2>
                {mine.map((p) => (
                  <a key={p.listing.id} href={`#stop-${p.stop.station.id}`} className={tr.place}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 17, lineHeight: 1.1 }}>
                        {p.listing.name}
                      </span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, marginTop: 3 }}>{p.stop.stopName}</span>
                    </span>
                    <span style={{ flex: '0 0 auto', fontWeight: 800, fontSize: 12 }}>
                      {fill(t('{n} min walk'), { n: walkMinutes(p.stop.meters) })} ↓
                    </span>
                  </a>
                ))}
              </section>
            ) : null}

            {other ? (
              <Link
                href={routes.freeRoute(lang, other.slug)}
                className={tr.place}
                style={{ padding: 14, justifyContent: 'flex-start', gap: 12, boxShadow: '6px 6px 0 var(--ink)' }}
              >
                <LineBullet route={other} size={40} />
                <span>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 11, letterSpacing: '1.4px' }}>{t('THE OTHER FREE LINE')}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>
                    {other.name.toUpperCase()} →
                  </span>
                </span>
              </Link>
            ) : null}
          </aside>
        </div>
      </main>
    </PageShell>
  )
}
