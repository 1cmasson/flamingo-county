import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { openGraph } from '../../../../../lib/site'
import { LINKS, getRoute } from '../../../../../lib/transit'
import { FreeRoutePage, freeRouteMetadata } from '../../../../../components/FreeRoutePage'
import { busCopy } from '../../../../../lib/busCopy'
import { longDay } from '../../../../../lib/voteCopy'
import {
  COUNTY,
  allNight,
  formatBusTime,
  getCountyRoute,
  routeEnds,
  routeName,
  routeNameInline,
  routeTimes,
  routeVia,
  scheduleCurrent,
  typicalHeadway,
  type CountyRoute,
  type DaySchedule,
} from '../../../../../lib/county'
import { placesOnRoute } from '../../../../../lib/busPlaces'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../../lib/jsonld'
import { PageShell } from '../../../../../components/PageShell'
import { JsonLd } from '../../../../../components/JsonLd'
import { AnswerBlock } from '../../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../../components/Breadcrumbs'
import { DirectionStops, RouteBullet, ScheduleTable } from '../../../../../components/Bus'
import { RouteLive } from '../../../../../components/RouteLive'
import { mapDirections } from '../../../../../lib/busMapData'
import { popularTripsOn } from '../../../../../lib/popularTrips'
import { AnyTripLink, PopularTripList } from '../../../../../components/PopularTrips'
import s from '../../../../../components/vote.module.css'
import b from '../../../../../components/bus.module.css'

type Props = { params: Promise<{ lang: string; route: string }> }

/** The county's own page for the route: its timetable PDF and service alerts. */
function countyHref(route: CountyRoute): string {
  return route.number
    ? `https://www.miamidade.gov/transportation-publicworks/routes_detail.asp?route=${route.number}`
    : LINKS.miamiTrolley
}

/** Every stop of both directions, counted once per corner name. */
function stopCount(route: CountyRoute): number {
  return new Set(route.directions.flatMap((d) => d.stations.map((st) => st.name))).size
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, route: slug } = await params
  if (!isLang(lang)) return {}
  // Hialeah's free lines, Flamingo and Marlin, have their own page here too.
  const free = getRoute(slug)
  if (free) return freeRouteMetadata(lang, free)
  const route = getCountyRoute(slug)
  if (!route) return {}
  const c = busCopy(lang)
  const name = routeName(route, lang)
  const [a, z] = routeEnds(route)
  const title = route.number ? c.metaTitle(name, a, z) : c.metaTitleTrolley(name)
  const weekday = route.directions[0]?.schedule.weekday
  const midday = scheduleCurrent(route) && weekday ? weekday.headway.midday : null
  const description = c.metaDescription(
    routeNameInline(route, lang),
    routeVia(route, lang),
    stopCount(route),
    midday ? c.every(midday) : null,
  )
  return {
    title,
    description,
    openGraph: openGraph(lang, { title, description, url: routes.busRoute(lang, slug) }),
    alternates: {
      canonical: routes.busRoute(lang, slug),
      languages: { en: routes.busRoute('en', slug), es: routes.busRoute('es', slug) },
    },
  }
}

export default async function BusRoute({ params }: Props) {
  const { lang, route: slug } = await params
  if (!isLang(lang)) notFound()
  const free = getRoute(slug)
  if (free) return <FreeRoutePage lang={lang} route={free} />
  const route = getCountyRoute(slug)
  if (!route) notFound()
  const c = busCopy(lang)
  const name = routeName(route, lang)
  const inline = routeNameInline(route, lang)
  const [a, z] = routeEnds(route)
  const path = routes.busRoute(lang, slug)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path: routes.bus(lang) },
    { name, path },
  ]
  const current = scheduleCurrent(route)

  // The answer reads the first direction's days: both directions run the same hours to within minutes.
  const dayText = (day: DaySchedule | null | undefined) => {
    if (!day) return null
    const gap = typicalHeadway(day)
    const every = gap ? c.every(gap) : null
    return allNight(day)
      ? c.dayLineAllNight(every)
      : c.dayLine(formatBusTime(day.first, lang), formatBusTime(day.last, lang), every)
  }
  const first = route.directions[0]
  const minutes = Math.max(...route.directions.map((d) => d.rideMinutes))
  const answer = current
    ? c.answer(
        inline,
        routeVia(route, lang),
        a,
        z,
        minutes,
        dayText(first.schedule.weekday),
        dayText(first.schedule.sunday),
      )
    : c.answerNoTimes(inline, routeVia(route, lang), a, z)

  const places = (await placesOnRoute(route, lang)).slice(0, 9)
  const others = COUNTY.routes.filter((r) => r.slug !== route.slug)

  return (
    <PageShell>
      <JsonLd
        data={[
          webPageJsonLd(lang, path, { name, dateModified: COUNTY.source.fetchedAt }),
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <main className={s.main}>
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />

        <header className={`${s.hero} ${b.routeHero}`}>
          <span className={s.kicker}>{route.number ? c.kickerBus : c.kickerTrolley}</span>
          <div className={b.heroTop}>
            <RouteBullet route={route} size={38} />
            <h1 className={s.title}>{name}</h1>
          </div>
          <p className={s.sub}>
            {a} ⇄ {z} · {routeVia(route, lang)}
          </p>
          <div className={`${b.chips} ${b.heroChips}`}>
            <span className={`${b.chip} ${route.number ? '' : b.chipFree}`}>
              {route.number ? c.fare : c.free}
            </span>
            <span className={b.chip}>{c.ride(minutes)}</span>
            <span className={b.chip}>{c.stopsCount(stopCount(route))}</span>
          </div>
        </header>

        <RouteLive
          slug={route.slug}
          label={name}
          number={route.number ?? route.short}
          lang={lang}
          times={routeTimes(route)}
          directions={mapDirections(route)}
          live={route.kind === 'bus'}
          schedule={current}
          mapHref={routes.busMap(lang, slug)}
        />

        <AnswerBlock question={c.question(inline)} answer={answer} />

        <section className={s.card} aria-labelledby="schedule">
          <h2 id="schedule" className={s.cardTag}>
            {c.schedule}
          </h2>
          {current ? (
            <>
              <ScheduleTable route={route} lang={lang} c={c} />
              {route.serviceEnds ? (
                <p className={s.note}>{c.scheduleNote(longDay(route.serviceEnds, lang))}</p>
              ) : null}
            </>
          ) : (
            <p className={s.notice}>{c.stale}</p>
          )}
        </section>

        <div className={b.directions}>
          {route.directions.map((d) => (
            <DirectionStops key={d.id} route={route} d={d} lang={lang} c={c} />
          ))}
        </div>

        {places.length ? (
          <section className={s.card} aria-labelledby="near">
            <h2 id="near" className={s.cardTag}>
              {c.near}
            </h2>
            <p className={s.note}>{c.nearNote(inline)}</p>
            <ul className={b.places}>
              {places.map((p) => (
                <li key={p.listing.id}>
                  <Link
                    className={b.placeLink}
                    href={routes.business(lang, p.citySlug, p.listing.slug)}
                  >
                    <span className={b.placeName}>{p.listing.name}</span>
                    <span className={b.meta}>{c.walk(p.walk, p.station.name)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={s.card} aria-labelledby="live">
          <h2 id="live" className={s.cardTag}>
            {c.live}
          </h2>
          <p className={s.note}>{c.liveNote}</p>
          <div className={s.actions}>
            <a
              className={s.action}
              href={countyHref(route)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.countyPage} ↗
            </a>
            <Link className={`${s.action} ${s.actionAlt}`} href={routes.freeRides(lang)}>
              {c.freeRides} →
            </Link>
          </div>
        </section>

        <section className={s.sources} aria-labelledby="sources">
          <h2 id="sources" className={s.cardTag}>
            {c.sources}
          </h2>
          <p>
            {c.sourceLine(longDay(COUNTY.source.fetchedAt.slice(0, 10), lang))}{' '}
            <a href="https://www.miamidade.gov/transit" target="_blank" rel="noopener noreferrer">
              Miami-Dade Transit ↗
            </a>
          </p>
          {route.kind === 'bus' ? (
            <p>
              {c.liveSourceLine} <Link href={routes.privacy(lang)}>{c.liveTerms}</Link>
            </p>
          ) : null}
        </section>

        <PopularTripList
          lang={lang}
          trips={popularTripsOn(route.slug)}
          heading={c.popularOnRoute}
          id="route-trips"
        />
        <AnyTripLink lang={lang} />

        <nav className={s.card} aria-labelledby="others">
          <h2 id="others" className={s.cardTag}>
            {c.otherRoutes}
          </h2>
          <ul className={b.routes}>
            {others.map((r) => {
              const [ra, rz] = routeEnds(r)
              return (
                <li key={r.slug}>
                  <Link className={b.routeLink} href={routes.busRoute(lang, r.slug)}>
                    <span className={b.routeTop}>
                      <RouteBullet route={r} size={18} />
                      <span className={b.routeName}>{routeName(r, lang)}</span>
                    </span>
                    <span className={b.meta}>
                      {ra} ⇄ {rz}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </main>
    </PageShell>
  )
}
