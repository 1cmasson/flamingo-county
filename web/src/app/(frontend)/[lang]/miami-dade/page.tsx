import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { openGraph } from '../../../../lib/site'
import { placesData, type PlacesData } from '../../../../lib/civic'
import { UNINCORPORATED } from '../../../../lib/civicSync'
import { areaName } from '../../../../lib/voteCopy'
import { fmt } from '../../../../lib/surgeCopy'
import { placesCopy } from '../../../../lib/placesCopy'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../lib/jsonld'
import { PageShell } from '../../../../components/PageShell'
import { JsonLd } from '../../../../components/JsonLd'
import { AnswerBlock } from '../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../components/Breadcrumbs'
import { PlacesHero, PlacesSources } from '../../../../components/Places'
import v from '../../../../components/vote.module.css'

type Props = { params: Promise<{ lang: string }> }

/**
 * Miami-Dade's 34 cities, the unincorporated county and the 13 commission
 * districts, each linking its page. Reads only the address database; proxy.ts
 * answers 503 until it is ready.
 */
async function load(): Promise<PlacesData> {
  const data = await placesData()
  if (!data) throw new Error('places: the address database is not ready')
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = placesCopy(lang)
  return {
    title: c.hubMetaTitle,
    description: c.hubMetaDescription,
    openGraph: openGraph(lang, { title: c.hubMetaTitle, description: c.hubMetaDescription, url: routes.places(lang) }),
    alternates: { canonical: routes.places(lang), languages: { en: routes.places('en'), es: routes.places('es') } },
  }
}

export default async function PlacesHub({ params }: Props) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const c = placesCopy(lang)
  const data = await load()
  const path = routes.places(lang)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path },
  ]
  const n = (x: number) => fmt(x, lang)
  const cities = data.cities.filter((x) => x.munic !== UNINCORPORATED)
  const uninc = data.cities.find((x) => x.munic === UNINCORPORATED)
  const total = data.cities.reduce((t, x) => t + x.total, 0)

  return (
    <PageShell>
      <JsonLd data={[webPageJsonLd(lang, path, { name: c.hubTitle, dateModified: data.fetchedAt }), breadcrumbJsonLd(crumbs)]} />
      <main className={v.main}>
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
        <PlacesHero title={c.hubTitle} lang={lang} c={c} lens="commission" />
        <AnswerBlock question={c.hubQuestion} answer={c.hubAnswer(cities.length, data.districts.length, n(total), n(uninc?.total ?? 0))} />

        <section className={v.card} aria-labelledby="cities">
          <h2 id="cities" className={v.cardTag}>
            {c.cities}
          </h2>
          <ul className={v.areas}>
            {[...cities, ...(uninc ? [uninc] : [])].map((x) => (
              <li key={x.slug}>
                <Link className={v.areaLink} href={routes.place(lang, x.slug)}>
                  <span className={v.areaName}>{areaName({ munic: x.munic, district: null }, lang)}</span>
                  <span className={v.areaMeta}>{c.addresses(n(x.total))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={v.card} aria-labelledby="districts">
          <h2 id="districts" className={v.cardTag}>
            {c.districts}
          </h2>
          <ul className={v.areas}>
            {data.districts.map((d) => (
              <li key={d.district}>
                <Link className={v.areaLink} href={routes.district(lang, d.district)}>
                  <span className={v.areaName}>{c.district(d.district)}</span>
                  <span className={v.areaMeta}>{d.name}</span>
                  <span className={v.areaMeta}>{c.addresses(n(d.total))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <PlacesSources data={data} lang={lang} c={c} />
      </main>
    </PageShell>
  )
}
