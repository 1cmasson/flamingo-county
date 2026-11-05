import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../../../i18n'
import { routes } from '../../../../../../lib/routes'
import { openGraph } from '../../../../../../lib/site'
import { busCopy } from '../../../../../../lib/busCopy'
import { COUNTY } from '../../../../../../lib/county'
import {
  POPULAR_TRIPS,
  getPopularTrip,
  popularLink,
  popularPlan,
  tripAnswer,
} from '../../../../../../lib/popularTrips'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../../../lib/jsonld'
import { PageShell } from '../../../../../../components/PageShell'
import { JsonLd } from '../../../../../../components/JsonLd'
import { AnswerBlock } from '../../../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../../../components/Breadcrumbs'
import { SharedTrip } from '../../../../../../components/TripShare'
import { AnyTripLink, PopularTripList } from '../../../../../../components/PopularTrips'
import s from '../../../../../../components/vote.module.css'
import b from '../../../../../../components/bus.module.css'

/**
 * A trip people ask for by name, with its own page to be found by
 * (lib/popularTrips.ts): "How to get from Hialeah Park to Jackson Memorial
 * Hospital by bus". The question, the answer in a sentence, the steps with
 * the next bus live, the map; and the link any other trip opens from.
 * Indexed, unlike a shared trip link (../page.tsx).
 */

type Props = { params: Promise<{ lang: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const trip = getPopularTrip(slug)
  if (!isLang(lang) || !trip) return {}
  const c = busCopy(lang)
  const a = trip.from.name[lang]
  const z = trip.to.name[lang]
  const title = c.popularTitle(a, z)
  const description = c.popularMetaDescription(a, z)
  return {
    title,
    description,
    openGraph: openGraph(lang, { title, description, url: routes.busTrip(lang, slug) }),
    alternates: {
      canonical: routes.busTrip(lang, slug),
      languages: { en: routes.busTrip('en', slug), es: routes.busTrip('es', slug) },
    },
  }
}

export default async function PopularTripPage({ params }: Props) {
  const { lang, slug } = await params
  const trip = getPopularTrip(slug)
  if (!isLang(lang) || !trip) notFound()
  const c = busCopy(lang)
  const a = trip.from.name[lang]
  const z = trip.to.name[lang]
  const title = c.popularTitle(a, z)
  const path = routes.busTrip(lang, slug)
  const plan = popularPlan(trip)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path: routes.bus(lang) },
    { name: title, path },
  ]
  const others = POPULAR_TRIPS.filter(
    (t) => t.slug !== slug && (t.from === trip.from || t.to === trip.to || t.from === trip.to),
  )

  return (
    <PageShell>
      <JsonLd
        data={[
          webPageJsonLd(lang, path, { name: title, dateModified: COUNTY.source.fetchedAt }),
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <main className={s.main}>
        <section className={b.finder} aria-labelledby="popular-trip">
          <p className={b.sheetKicker}>{c.linkKicker}</p>
          <h1 id="popular-trip" className={b.finderTitle}>
            {title}
          </h1>
          <p className={b.finderFromLine}>
            <span>◎ {c.linkFrom(a)}</span>
          </p>
          <SharedTrip lang={lang} link={popularLink(trip, lang)} plan={plan} />
        </section>

        <AnswerBlock
          question={c.popularQuestion(a, z)}
          answer={tripAnswer(lang, plan.trips[0], trip)}
        />

        <AnyTripLink lang={lang} />
        <PopularTripList
          lang={lang}
          trips={others.length ? others : POPULAR_TRIPS.filter((t) => t.slug !== slug)}
          heading={c.popularHeading}
          id="more-trips"
        />
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
      </main>
    </PageShell>
  )
}
