import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { openGraph } from '../../../../lib/site'
import { busCopy } from '../../../../lib/busCopy'
import {
  COUNTY,
  countyRoutesIn,
  routeEnds,
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
import { RouteBullet } from '../../../../components/Bus'
import { BusFinder } from '../../../../components/BusFinder'
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
          itemListJsonLd(
            c.hubTitle,
            COUNTY.routes.map((r) => ({
              name: routeName(r, lang),
              path: routes.busRoute(lang, r.slug),
            })),
          ),
        ]}
      />
      <main className={s.main}>
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
        <header className={s.hero}>
          <span className={s.kicker}>{c.kickerBus}</span>
          <h1 className={s.title}>{c.hubTitle}</h1>
          <p className={s.sub}>{c.hubSub}</p>
        </header>

        <BusFinder lang={lang} />

        <AnswerBlock question={c.hubQuestion} answer={c.hubAnswer(COUNTY.routes.length)} />

        {CITIES.map((city) => {
          const list = countyRoutesIn(city.slug)
          if (!list.length) return null
          return (
            <section key={city.slug} className={s.card} aria-labelledby={`city-${city.slug}`}>
              <h2 id={`city-${city.slug}`} className={s.cardTag}>
                {c.cityHeading(city.name[lang])}
              </h2>
              <ul className={b.routes}>
                {list.map((r) => {
                  const [a, z] = routeEnds(r)
                  const weekday = r.directions[0]?.schedule.weekday
                  const gap = scheduleCurrent(r) && weekday ? typicalHeadway(weekday) : null
                  return (
                    <li key={r.slug}>
                      <Link className={b.routeLink} href={routes.busRoute(lang, r.slug)}>
                        <span className={b.routeTop}>
                          <RouteBullet route={r} size={18} />
                          <span className={b.routeName}>{routeName(r, lang)}</span>
                        </span>
                        <span className={b.meta}>
                          {a} ⇄ {z}
                        </span>
                        <span className={b.meta}>
                          {routeVia(r, lang)}
                          {gap ? ` · ${c.every(gap)}` : ''}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              {city.slug === 'hialeah' ? (
                <Link
                  href={routes.freeRides(lang)}
                  style={{ fontWeight: 800, color: 'var(--ink)' }}
                >
                  {c.freeLines}
                </Link>
              ) : null}
            </section>
          )
        })}
      </main>
    </PageShell>
  )
}
