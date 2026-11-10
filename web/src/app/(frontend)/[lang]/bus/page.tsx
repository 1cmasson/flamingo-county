import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { openGraph } from '../../../../lib/site'
import { busCopy } from '../../../../lib/busCopy'
import {
  COUNTY,
  byRouteOrder,
  countyRoutesIn,
  isFree,
  routeEnds,
  routeGroup,
  type CountyRoute,
  type RouteGroup,
  routeName,
  routeVia,
  scheduleCurrent,
  typicalHeadway,
} from '../../../../lib/county'
import { breadcrumbJsonLd, itemListJsonLd, webPageJsonLd } from '../../../../lib/jsonld'
import { PageShell } from '../../../../components/PageShell'
import { JsonLd } from '../../../../components/JsonLd'
import { AnswerBlock } from '../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../components/Breadcrumbs'
import { FareChip, RouteBullet } from '../../../../components/Bus'
import { FreeRidesSection } from '../../../../components/FreeRidesSection'
import { LineBullet, ends } from '../../../../components/Transit'
import { TRANSIT, formatHeadway, headwayToday } from '../../../../lib/transit'
import { translator } from '../../../../i18n'
import { BusFinder } from '../../../../components/BusFinder'
import { AnyTripLink, PopularTripList } from '../../../../components/PopularTrips'
import { POPULAR_TRIPS } from '../../../../lib/popularTrips'
import { absUrl } from '../../../../lib/site'
import s from '../../../../components/vote.module.css'
import b from '../../../../components/bus.module.css'

type Props = { params: Promise<{ lang: string }> }

/** The directory's cities, in the order the nav lists them, with the name each language uses. */
const CITIES: { slug: string; name: Record<Lang, string> }[] = [
  { slug: 'hialeah', name: { en: 'Hialeah', es: 'Hialeah' } },
  { slug: 'lakes', name: { en: 'Miami Lakes', es: 'Miami Lakes' } },
  { slug: 'havana', name: { en: 'Little Havana', es: 'la Pequeña Habana' } },
  { slug: 'gardens', name: { en: 'Miami Gardens', es: 'Miami Gardens' } },
]

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = busCopy(lang)
  return {
    title: c.hubMetaTitle,
    description: c.hubMetaDescription,
    openGraph: openGraph(lang, {
      title: c.hubMetaTitle,
      description: c.hubMetaDescription,
      url: routes.bus(lang),
    }),
    alternates: {
      canonical: routes.bus(lang),
      languages: { en: routes.bus('en'), es: routes.bus('es') },
    },
  }
}

/** The hub's sections of every route, in order. */
const GROUPS: {
  group: RouteGroup
  heading: 'groupFree' | 'groupRail' | 'groupBus' | 'groupCity'
  note: 'groupFreeNote' | 'groupBusNote' | 'groupCityNote' | null
}[] = [
  { group: 'free', heading: 'groupFree', note: 'groupFreeNote' },
  { group: 'rail', heading: 'groupRail', note: null },
  { group: 'bus', heading: 'groupBus', note: 'groupBusNote' },
  { group: 'city', heading: 'groupCity', note: 'groupCityNote' },
]

/** Hialeah's free Flamingo and Marlin, as the hub lists them. */
function FreeLineItems({ lang }: { lang: Lang }) {
  const c = busCopy(lang)
  const t = translator(lang)
  return TRANSIT.routes.map((r) => {
    const [from, to] = ends(r, t)
    const gap = headwayToday(r)
    return (
      <li key={r.slug}>
        <Link className={b.routeLink} href={routes.freeRoute(lang, r.slug)}>
          <span className={b.routeTop}>
            <LineBullet route={r} size={30} />
            <span className={b.routeName}>{r.name}</span>
            <FareChip free label={c.fareFree} />
          </span>
          <span className={b.meta}>
            {from} ⇄ {to}
          </span>
          {gap ? <span className={b.meta}>{formatHeadway(gap, lang)}</span> : null}
        </Link>
      </li>
    )
  })
}

/** One county route on the hub: its name, what it costs, its ends; the street and how often, unless compact. */
function RouteItem({ route: r, lang, compact }: { route: CountyRoute; lang: Lang; compact?: boolean }) {
  const c = busCopy(lang)
  const [a, z] = routeEnds(r)
  const weekday = r.directions[0]?.schedule.weekday
  const gap = scheduleCurrent(r) && weekday ? typicalHeadway(weekday) : null
  const via = routeVia(r, lang)
  const fare =
    r.fare === 'free' ? c.fareFree : r.fare === 'paid' ? (r.kind === 'rail' ? c.fareRail : c.farePaid) : null
  return (
    <li>
      <Link className={b.routeLink} href={routes.busRoute(lang, r.slug)}>
        <span className={b.routeTop}>
          <RouteBullet route={r} size={18} />
          <span className={b.routeName}>{routeName(r, lang)}</span>
          {fare && !compact ? <FareChip free={isFree(r)} label={fare} /> : null}
        </span>
        <span className={b.meta}>
          {a} ⇄ {z}
        </span>
        {!compact && (via || gap) ? (
          <span className={b.meta}>
            {[via, gap ? c.every(gap) : null].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

export default async function BusHub({ params }: Props) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const c = busCopy(lang)
  const path = routes.bus(lang)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path },
  ]

  return (
    <PageShell>
      <JsonLd
        data={[
          webPageJsonLd(lang, path, { name: c.hubTitle, dateModified: COUNTY.source.fetchedAt }),
          breadcrumbJsonLd(crumbs),
          itemListJsonLd(c.hubTitle, [
            ...TRANSIT.routes.map((r) => ({ name: r.name, path: routes.freeRoute(lang, r.slug) })),
            ...COUNTY.routes.map((r) => ({
              name: routeName(r, lang),
              path: routes.busRoute(lang, r.slug),
            })),
          ]),
          // The trip any link opens, as a template a machine can fill in.
          {
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: c.finderTitle,
            url: absUrl(path),
            applicationCategory: 'TravelApplication',
            operatingSystem: 'Web',
            inLanguage: lang,
            isAccessibleForFree: true,
            areaServed: { '@type': 'AdministrativeArea', name: 'Miami-Dade County, Florida' },
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${absUrl(`/${lang}/bus/trip`)}?from={from}&to={to}`,
              },
              'query-input': ['required name=to', 'optional name=from'],
            },
          },
        ]}
      />
      <main className={s.main}>
        {/* The tool first (it holds the page's h1); everything to read comes after it. */}
        <BusFinder lang={lang} />

        <PopularTripList
          lang={lang}
          trips={POPULAR_TRIPS}
          heading={c.popularHeading}
          id="popular-trips"
        />
        <AnyTripLink lang={lang} />

        <h2 className={b.hubAll}>{c.hubAllRoutes}</h2>
        <AnswerBlock question={c.hubQuestion} answer={c.hubAnswer(COUNTY.routes.length + TRANSIT.routes.length)} />
        <p className={b.fareLegend}>{c.fareLegend}</p>

        {/* The routes through the directory's cities first: the ones its readers ride. */}
        {CITIES.map((city) => {
          const list = countyRoutesIn(city.slug)
          if (!list.length) return null
          return (
            <section key={city.slug} className={s.card} aria-labelledby={`city-${city.slug}`}>
              <h2 id={`city-${city.slug}`} className={s.cardTag}>
                {c.cityHeading(city.name[lang])}
              </h2>
              <ul className={b.routes}>
                {/* Hialeah's own free lines first: their own routes, marked free. */}
                {city.slug === 'hialeah' ? <FreeLineItems lang={lang} /> : null}
                {list.map((r) => (
                  <RouteItem key={r.slug} route={r} lang={lang} />
                ))}
              </ul>
            </section>
          )
        })}

        {/* Then every route in Miami-Dade, by what it costs and what it is. */}
        <h2 id="todas" className={b.hubAll}>
          {c.allRoutesLink.toUpperCase()}
        </h2>
        {GROUPS.map(({ group, heading, note }) => {
          const list = COUNTY.routes.filter((r) => routeGroup(r) === group).sort(byRouteOrder)
          return (
            <section key={group} className={s.card} aria-labelledby={`group-${group}`}>
              <h2 id={`group-${group}`} className={s.cardTag}>
                {c[heading]}
              </h2>
              {note ? <p className={s.note}>{c[note]}</p> : null}
              <ul className={`${b.routes} ${group === 'bus' ? b.routesCompact : ''}`}>
                {group === 'free' ? <FreeLineItems lang={lang} /> : null}
                {list.map((r) => (
                  <RouteItem key={r.slug} route={r} lang={lang} compact={group === 'bus'} />
                ))}
              </ul>
            </section>
          )
        })}
        {/* Hialeah's free lines: the map, the hours, where the buses are (was /free-rides). */}
        <FreeRidesSection lang={lang} />

        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
      </main>
    </PageShell>
  )
}
