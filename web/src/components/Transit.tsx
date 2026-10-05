import type * as React from 'react'
import Link from 'next/link'
import { headers } from 'next/headers'
import type { Lang } from '../i18n'
import type { Listing } from '../payload-types'
import { routes } from '../lib/routes'
import { rideForListing, type PlaceOnLine } from '../lib/rides'
import {
  CITY_HOURS,
  FREEBEE_PHONE,
  LINKS,
  ROUTE_STYLE,
  TRANSIT,
  diagram,
  formatClock,
  formatHeadway,
  headwayToday,
  miamiClock,
  serviceStatus,
  walkMinutes,
  type NearestStop,
  type TransitRoute,
} from '../lib/transit'
import type { NearMeCopy, NearMePlace } from './NearMe'
import { NextBus, type NextBusCopy, type StripLiveCopy } from './LiveTransit'
import tr from './transit.module.css'

type T = (s: string) => string

/** `t()` keys are the English sentence; the variable parts go in after. */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

/* ------------------------------------------------------------------ pieces */

/** The subway bullet: the line's colour, its initial, an ink ring. */
export function LineBullet({ route, size = 34 }: { route: TransitRoute; size?: number }) {
  const st = ROUTE_STYLE[route.slug]
  return (
    <span
      aria-hidden="true"
      style={{
        flex: '0 0 auto',
        width: size,
        height: size,
        borderRadius: '50%',
        background: st.grad,
        color: st.ink,
        border: `${size >= 48 ? 4 : 3}px solid var(--ink)`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--display)',
        fontSize: Math.round(size * 0.52),
        lineHeight: 1,
        paddingTop: Math.round(size * 0.08),
      }}
    >
      {route.name[0]}
    </span>
  )
}

/** The status line's words, shared by the chip and the city map. Miami's clock. */
export function serviceStatusText(lang: Lang, t: T, now: Date = new Date()): { live: boolean; text: string } {
  const s = serviceStatus(now)
  const sunday = miamiClock(now).dow === 0
  const text =
    s.state === 'running'
      ? fill(t('RUNNING NOW · until {time}'), { time: formatClock(s.closes, lang) })
      : s.day === 'today'
        ? fill(t('NOT OUT YET · starts at {time}'), { time: formatClock(s.opens, lang) })
        : s.day === 'monday'
          ? fill(t('DONE FOR THE WEEKEND · back Monday at {time}'), { time: formatClock(s.opens, lang) })
          : sunday
            ? fill(t('NO SERVICE ON SUNDAYS · back tomorrow at {time}'), { time: formatClock(s.opens, lang) })
            : fill(t('DONE FOR TODAY · back tomorrow at {time}'), { time: formatClock(s.opens, lang) })
  return { live: s.state === 'running', text }
}

/** "Running now · until 7:30 PM", or when it's back. Miami's clock, always. */
export function ServiceStatusChip({ lang, t, now = new Date() }: { lang: Lang; t: T; now?: Date }) {
  const { live, text } = serviceStatusText(lang, t, now)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: live ? 'var(--ink)' : 'var(--cream)',
        color: live ? 'var(--cream)' : 'var(--ink)',
        border: '3px solid var(--ink)',
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: '0.6px',
        padding: '6px 10px 5px',
        lineHeight: 1.25,
      }}
    >
      <span
        className={`${tr.dot} ${live ? tr.dotLive : ''}`}
        style={live ? undefined : ({ '--dot': '#9aa1a8' } as React.CSSProperties)}
      />
      {text}
    </span>
  )
}

/** The city's posted hours, which is what we print — never the feed's span. */
export function HoursLines({ lang, t }: { lang: Lang; t: T }) {
  const span = (h: { opens: number; closes: number }) => `${formatClock(h.opens, lang)}–${formatClock(h.closes, lang)}`
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 14 }}>
      <dt style={{ fontWeight: 800 }}>{t('Mon–Fri')}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{span(CITY_HOURS.weekday)}</dd>
      <dt style={{ fontWeight: 800 }}>{t('Sat & holidays')}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{span(CITY_HOURS.saturday)}</dd>
      <dt style={{ fontWeight: 800 }}>{t('Sunday')}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{t('No service')}</dd>
    </dl>
  )
}

/**
 * ETA SPOT has no web tracker, so "live" means its app. On a phone the button
 * goes straight to the right store; anywhere else it goes to the route page's
 * section that offers both.
 */
export async function trackLiveHref(lang: Lang, route: TransitRoute): Promise<{ href: string; external: boolean }> {
  const ua = (await headers()).get('user-agent') ?? ''
  if (/android/i.test(ua)) return { href: LINKS.etaSpotAndroid, external: true }
  if (/iphone|ipad|ipod/i.test(ua)) return { href: LINKS.etaSpotIos, external: true }
  return { href: `${routes.freeRoute(lang, route.slug)}#live`, external: false }
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  textDecoration: 'none',
  fontFamily: 'var(--display)',
  fontSize: 16,
  lineHeight: 1,
  padding: '12px 14px 9px',
  border: '4px solid var(--ink)',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
}

export function PrimaryButton({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const style = { ...btnBase, background: 'var(--ink)', color: 'var(--yellow)', boxShadow: '4px 4px 0 var(--pink)' }
  return external ? (
    <a href={href} className={tr.btn} style={style} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <Link href={href} className={tr.btn} style={style}>
      {children}
    </Link>
  )
}

export function SecondaryButton({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  const style = { ...btnBase, background: 'var(--cream)', color: 'var(--ink)', boxShadow: '4px 4px 0 var(--ink)' }
  return external ? (
    <a href={href} className={tr.btn} style={style} rel="noopener noreferrer" target="_blank">
      {children}
    </a>
  ) : (
    <Link href={href} className={tr.btn} style={style}>
      {children}
    </Link>
  )
}

/** Small-caps section label in the site's ink-tag style. */
export function Tag({ children, bg = 'var(--ink)', fg = 'var(--yellow)' }: { children: React.ReactNode; bg?: string; fg?: string }) {
  return (
    <h2
      style={{
        display: 'inline-block',
        alignSelf: 'flex-start',
        margin: 0,
        background: bg,
        color: fg,
        fontFamily: 'var(--display)',
        fontSize: 20,
        fontWeight: 400,
        lineHeight: 1,
        padding: '8px 12px 5px',
      }}
    >
      {children}
    </h2>
  )
}

/* ------------------------------------------------------- listing sidebar */

/**
 * "Get here free" on a business page. Rendered inside <Suspense>: it may wait
 * on a geocode, and the page must never wait with it.
 */
export async function FreeRidePanel({ listing, lang, t }: { listing: Listing; lang: Lang; t: T }) {
  const ride = await rideForListing(listing)
  if (!ride) return null

  const shell: React.CSSProperties = {
    background: 'var(--grad-cream)',
    border: '4px solid var(--ink)',
    boxShadow: '8px 8px 0 var(--ink)',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }

  if (ride.kind === 'freebee') {
    const lakes = ride.city === 'lakes'
    return (
      <section style={shell} aria-labelledby="free-ride">
        <Tag>
          <span id="free-ride">{t('GET HERE FREE')}</span>
        </Tag>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'var(--yellow)',
              border: '3px solid var(--ink)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
            }}
          >
            ⚡
          </span>
          <div style={{ fontFamily: 'var(--display)', fontSize: 24, lineHeight: 1 }}>FREEBEE</div>
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, textWrap: 'pretty' }}>
          {lakes
            ? t('Free, on-demand electric rides around Miami Lakes. Book one in the Freebee app.')
            : t('Free, on-demand electric rides around Hialeah. Book one in the Freebee app.')}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <SecondaryButton href={LINKS.freebeeIos} external>
            iPhone
          </SecondaryButton>
          <SecondaryButton href={LINKS.freebeeAndroid} external>
            Android
          </SecondaryButton>
        </div>
        {lakes ? (
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {t('Or call')}{' '}
            <a href={`tel:${FREEBEE_PHONE.replace(/[^\d]/g, '')}`} style={{ fontWeight: 800, textDecoration: 'underline' }}>
              {FREEBEE_PHONE}
            </a>
          </div>
        ) : null}
        <Link href={routes.freeRides(lang)} style={{ fontWeight: 800, fontSize: 13, textDecoration: 'underline' }}>
          {t('Every free way around →')}
        </Link>
      </section>
    )
  }

  const [main, ...more] = ride.stops
  const route = main.route
  const st = ROUTE_STYLE[route.slug]
  const headway = headwayToday(route)
  const live = await trackLiveHref(lang, route)
  const stopHref = `${routes.freeRoute(lang, route.slug)}#stop-${main.station.id}`
  const pole = main.station.points[main.station.names.indexOf(main.stopName)] ?? main.station.points[0]
  const walkHref = await directionsHref(pole)

  return (
    <section style={{ ...shell, padding: 0, gap: 0, overflow: 'hidden' }} aria-labelledby="free-ride">
      <div
        style={{
          background: st.grad,
          color: st.ink,
          borderBottom: '4px solid var(--ink)',
          padding: '14px 18px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <LineBullet route={route} size={40} />
        <div style={{ minWidth: 0 }}>
          <div id="free-ride" style={{ fontFamily: 'var(--display)', fontSize: 15, lineHeight: 1, letterSpacing: '0.5px' }}>
            {t('GET HERE FREE')}
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1.05 }}>
            {fill(t('{name} BUS'), { name: route.name.toUpperCase() })}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(30px,7vw,38px)', lineHeight: 0.95 }}>
            {fill(t('{n} MIN WALK'), { n: walkMinutes(main.meters) })}
          </div>
          <div style={{ marginTop: 6, fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
            {t('to the stop at')} <strong style={{ fontWeight: 800 }}>{main.stopName}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <ServiceStatusChip lang={lang} t={t} />
          {headway ? (
            <span style={{ fontWeight: 800, fontSize: 13 }}>{formatHeadway(headway, lang)}</span>
          ) : null}
        </div>

        {/* Live: the next bus at this pole (either side of the street), from
            the city's tracker. Polls on its own; renders nothing until it
            has an answer, so the panel never waits on it. */}
        <NextBus stops={main.etaIds} route={route.slug} copy={nextBusCopy(t)} />

        <a
          href={walkHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ alignSelf: 'flex-start', fontWeight: 800, fontSize: 13, textDecoration: 'underline' }}
        >
          {t('Walking directions to the stop ↗')}
        </a>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
          <PrimaryButton href={stopHref}>{t('SEE THE ROUTE →')}</PrimaryButton>
          <SecondaryButton href={live.href} external={live.external}>
            {t('TRACK IT LIVE')}
          </SecondaryButton>
        </div>

        {more.map((m) => (
          <OtherLine key={m.route.slug} stop={m} lang={lang} t={t} />
        ))}

        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, lineHeight: 1.45, color: '#4a4f55' }}>
          {t('Always free. Walk time is approximate.')}{' '}
          <Link href={routes.freeRides(lang)} style={{ fontWeight: 800, textDecoration: 'underline', color: 'inherit' }}>
            {t('Hours and every free ride →')}
          </Link>
        </p>
      </div>
    </section>
  )
}

function OtherLine({ stop, lang, t }: { stop: NearestStop; lang: Lang; t: T }) {
  return (
    <Link
      href={`${routes.freeRoute(lang, stop.route.slug)}#stop-${stop.station.id}`}
      className={tr.place}
      style={{ justifyContent: 'flex-start' }}
    >
      <LineBullet route={stop.route} size={26} />
      <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
        {fill(t('Also: the {name}, {n} min walk to {stop}'), {
          name: stop.route.name,
          n: walkMinutes(stop.meters),
          stop: stop.stopName,
        })}
      </span>
    </Link>
  )
}

/* ------------------------------------------------------------ the strip */

/**
 * The line as a subway strip. A semantic ordered list — the coloured rail is
 * decoration drawn in CSS — so a screen reader hears the stops in order and
 * the folds are native <details> that work without JavaScript.
 */
export function RouteStrip({
  route,
  places,
  lang,
  t,
}: {
  route: TransitRoute
  places: PlaceOnLine[]
  lang: Lang
  t: T
}) {
  const byStation = new Map<number, PlaceOnLine[]>()
  for (const p of places) {
    if (p.stop.route.slug !== route.slug) continue
    const list = byStation.get(p.stop.index) ?? []
    list.push(p)
    byStation.set(p.stop.index, list)
  }
  const items = diagram(route, new Set(byStation.keys()))
  const lineVar = { '--line': ROUTE_STYLE[route.slug].color } as React.CSSProperties

  return (
    <ol className={tr.strip} style={lineVar} aria-label={fill(t('Stops on the {name} line'), { name: route.name })}>
      {items.map((it) => {
        if (it.kind === 'gap') {
          return (
            <li key={`gap-${it.stations[0].index}`} className={`${tr.row} ${tr.gap}`}>
              <span />
              <span />
              <div className={tr.body}>
                <details className={tr.fold}>
                  <summary>
                    <span className={tr.chev} aria-hidden="true">
                      ▸
                    </span>
                    {fill(t(it.stations.length === 1 ? '1 more stop' : '{n} more stops'), { n: it.stations.length })}
                  </summary>
                  <ol className={tr.minor}>
                    {it.stations.map(({ station }) => (
                      <li key={station.id} id={`stop-${station.id}`}>
                        {station.name}{' '}
                        <span style={{ fontWeight: 800, fontSize: 12, color: '#5b6168' }}>· {station.min}′</span>
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
            </li>
          )
        }
        const { station, index, major } = it
        const here = byStation.get(index) ?? []
        const nodeClass = [
          tr.node,
          major ? '' : tr.nodeMinor,
          station.transfers.length ? tr.nodeTransfer : '',
          here.length ? tr.nodePlace : '',
        ].join(' ')
        const first = index === 0
        return (
          <li key={station.id} id={`stop-${station.id}`} className={tr.row}>
            <span className={tr.minutes} aria-hidden={first ? undefined : true}>
              {first ? (
                <small style={{ fontSize: 10 }}>{t('START')}</small>
              ) : (
                <>
                  {station.min}
                  <small>MIN</small>
                </>
              )}
            </span>
            <span className={nodeClass} />
            <div className={tr.body}>
              <div>
                <span className={`${tr.name} ${major ? tr.nameMajor : ''}`}>
                  {station.landmark && station.landmark !== station.name ? station.landmark : station.name}
                </span>
                {!first ? (
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                    {fill(t(', {n} minutes from the start'), { n: station.min })}
                  </span>
                ) : null}
              </div>
              {station.landmark && station.landmark !== station.name ? (
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{station.name}</div>
              ) : null}
              {station.transfers.map((x) => (
                <div key={x} className={tr.transfer}>
                  <span aria-hidden="true">⇄</span>
                  {fill(t('TRANSFER · {line}'), { line: x.toUpperCase() })}
                </div>
              ))}
              {here.length ? (
                <div className={tr.places}>
                  {here.map((p) => (
                    <Link
                      key={p.listing.id}
                      href={routes.business(lang, p.citySlug, p.listing.slug)}
                      className={tr.place}
                      style={{ flexWrap: 'wrap', rowGap: 4 }}
                    >
                      <span style={{ fontFamily: 'var(--display)', fontSize: 17, lineHeight: 1.1, minWidth: 0 }}>
                        {p.listing.name}
                      </span>
                      <span style={{ flex: '0 0 auto', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
                        {fill(t('{n} min walk'), { n: walkMinutes(p.stop.meters) })} →
                      </span>
                      {/* Drawn at this station, but nearest to its partner
                          stop across or around the block: name the pole. */}
                      {p.stop.stopName !== station.name ? (
                        <span style={{ flexBasis: '100%', fontSize: 12, fontWeight: 600 }}>
                          {fill(t('from the stop at {stop}'), { stop: p.stop.stopName })}
                        </span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** "Aquabella ↔ Hialeah Dr & E 4 Ave" — the line's two ends. */
export function ends(route: TransitRoute): [string, string] {
  const a = route.stations[0]
  const b = route.stations.at(-1)!
  // "NW 138 St (#10990)" → "NW 138 St": the parenthetical is an address
  // the rider doesn't need in a headline.
  const short = (x: string) => x.replace(/\s*\((#|Connector).*\)$/i, '')
  return [a.landmark ?? short(a.name), b.landmark ?? short(b.name)]
}

/* ------------------------------------------------------- where are you? */

/** NearMe is a client component; its copy is translated here, on the server. */
export function nearMeCopy(t: T): NearMeCopy {
  return {
    title: t('WHERE ARE YOU?'),
    lead: t('Find your nearest free stop, how to walk there, and the spots you can ride to from it.'),
    useLocation: t('USE MY LOCATION'),
    locating: t('FINDING YOU…'),
    placeholder: t('An address or a stop, like 1201 W 44th Pl or Palm Ave'),
    find: t('FIND'),
    finding: t('…'),
    stopsMatching: t('STOPS THAT MATCH'),
    privacy: t('Your location stays on your phone. A typed address is looked up with the US Census Bureau’s free address service.'),
    denied: t('Location is turned off for this site. Type an address or a stop instead.'),
    unavailable: t('We couldn’t get your location. Try again, or type an address or a stop.'),
    noNumber: t('Type a street address with its number, like 1201 W 44th Pl — or pick a stop from the list.'),
    notFound: t('We couldn’t find that address in Hialeah. Try adding the ZIP code, or type a street to pick a stop.'),
    showingFor: t('Showing free rides near'),
    yourLocation: t('your location'),
    clear: t('Clear'),
    walk: t('{n} MIN WALK'),
    toStop: t('to the stop at'),
    directions: t('WALKING DIRECTIONS ↗'),
    seeStop: t('SEE IT ON THE LINE'),
    rideTo: t('RIDE TO'),
    ride: t('~{n} min ride'),
    walkFromStop: t('{n} min walk'),
    longWalk: t('That’s a long walk. Freebee gives free rides around Hialeah.'),
    tooFar: t('No free bus stop within a half-hour walk of there.'),
    freebee: t('Freebee runs free on-demand rides around Hialeah and Miami Lakes — book one in the app.'),
    line: t('{name} BUS'),
  }
}

/** The places list, trimmed to what the client needs. */
export function nearMePlaces(places: PlaceOnLine[], lang: Lang): NearMePlace[] {
  return places.map((p) => ({
    name: p.listing.name,
    href: routes.business(lang, p.citySlug, p.listing.slug),
    route: p.stop.route.slug,
    index: p.stop.index,
    walk: walkMinutes(p.stop.meters),
  }))
}

export function routeHrefs(lang: Lang): Record<string, string> {
  return Object.fromEntries(TRANSIT.routes.map((r) => [r.slug, routes.freeRoute(lang, r.slug)]))
}

/** Walking directions to a stop from wherever the phone is — no location needed here. */
export async function directionsHref(to: [number, number]): Promise<string> {
  const ua = (await headers()).get('user-agent') ?? ''
  const d = to.join(',')
  return /iphone|ipad|ipod|macintosh/i.test(ua)
    ? `https://maps.apple.com/?daddr=${d}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${d}&travelmode=walking`
}

/* ------------------------------------------------------------ live copy */

export function nextBusCopy(t: T): NextBusCopy {
  return {
    next: t('NEXT BUS'),
    arriving: t('ARRIVING'),
    min: t('{n} MIN'),
    live: t('live'),
    scheduled: t('scheduled'),
    late: t('{n} min late'),
    early: t('{n} min early'),
    onTime: t('on time'),
    then: t('then {n} min'),
    none: t('No bus due here in the next 3 hours.'),
    at: t('at {stop}'),
  }
}

export function stripLiveCopy(t: T): StripLiveCopy {
  return {
    many: t('{n} buses on the {name} right now'),
    one: t('1 bus on the {name} right now'),
    none: t('No {name} buses on the road right now'),
    near: t('Next stop: {stop}'),
    late: t(' · {n} min late'),
    onTime: t(' · on time'),
    updated: t('updated {s}s ago'),
    marker: t('BUS'),
    offline: t('Live bus positions are unavailable right now. Hours and frequency below still apply.'),
  }
}
