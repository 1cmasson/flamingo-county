import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { openGraph } from '../../../../lib/site'
import { surgeData, type SurgeData } from '../../../../lib/civic'
import { areaName } from '../../../../lib/voteCopy'
import { fmt, pct, surgeCopy, SURGE_PAGES } from '../../../../lib/surgeCopy'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../lib/jsonld'
import { PageShell } from '../../../../components/PageShell'
import { JsonLd } from '../../../../components/JsonLd'
import { AnswerBlock } from '../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../components/Breadcrumbs'
import { SurgeGuidance, SurgeHero, SurgeSources } from '../../../../components/Surge'
import v from '../../../../components/vote.module.css'
import s from '../../../../components/civic.module.css'

type Props = { params: Promise<{ lang: string }> }

/**
 * Miami-Dade's storm-surge evacuation zones, A to E: what the county says
 * each means, and how many addresses each city has in each. Reads only the
 * address database; proxy.ts answers 503 until it is ready.
 */
async function load(): Promise<SurgeData> {
  const data = await surgeData()
  if (!data) throw new Error('evacuation zones: the address database is not ready')
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = surgeCopy(lang)
  return {
    title: c.hubMetaTitle,
    description: c.hubMetaDescription,
    openGraph: openGraph(lang, { title: c.hubMetaTitle, description: c.hubMetaDescription, url: routes.evacuation(lang) }),
    alternates: { canonical: routes.evacuation(lang), languages: { en: routes.evacuation('en'), es: routes.evacuation('es') } },
  }
}

export default async function EvacuationZones({ params }: Props) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const c = surgeCopy(lang)
  const data = await load()
  const path = routes.evacuation(lang)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path },
  ]
  const n = (x: number) => fmt(x, lang)
  const inZone = data.county.total - data.county.none
  const name = (munic: string) => areaName({ munic, district: null }, lang)
  const cityLink = (slug: string, label: string) =>
    SURGE_PAGES.includes(slug) ? <Link href={routes.evacuationArea(lang, slug)}>{label}</Link> : label

  return (
    <PageShell>
      <JsonLd data={[webPageJsonLd(lang, path, { name: c.hubTitle, dateModified: data.fetchedAt }), breadcrumbJsonLd(crumbs)]} />
      <main className={v.main}>
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
        <SurgeHero title={c.hubTitle} lang={lang} c={c} />
        <AnswerBlock question={c.hubQuestion} answer={c.hubAnswer(n(data.county.total), n(inZone), n(data.county.none))} />

        <section className={v.card} aria-labelledby="zones">
          <h2 id="zones" className={v.cardTag}>
            {c.byZone}
          </h2>
          <div className={s.zones}>
            {data.zones.map((z) => {
              const cities = data.areas
                .map((a) => ({ a, n: a.addresses.byZone[z] ?? 0 }))
                .filter((x) => x.n > 0)
                .sort((x, y) => y.n - x.n)
              return (
                <article key={z} className={s.zone} id={`zone-${z}`}>
                  <div className={s.zoneHead}>
                    <h3 className={s.zoneName}>{c.zoneTitle(z)}</h3>
                    <span className={s.zoneCount}>{c.addresses(n(data.county.byZone[z] ?? 0))}</span>
                  </div>
                  <p className={s.zoneText}>{c.zoneMeaning(z)}</p>
                  <p className={s.zoneCities}>
                    <strong>{c.inZoneCities}:</strong>{' '}
                    {cities.map((x, i) => (
                      <span key={x.a.slug}>
                        {i ? ' · ' : ''}
                        {cityLink(x.a.slug, name(x.a.munic))} {n(x.n)}
                      </span>
                    ))}
                  </p>
                </article>
              )
            })}
          </div>
        </section>

        <SurgeGuidance c={c} />

        <section className={v.card} aria-labelledby="cities">
          <h2 id="cities" className={v.cardTag}>
            {c.byCity}
          </h2>
          <table className={s.data}>
            <thead>
              <tr>
                <th scope="col">{c.city}</th>
                <th scope="col" className={s.n}>
                  {c.inAnyZone}
                </th>
                <th scope="col" className={s.n}>
                  {c.share}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.areas.map((a) => {
                const inA = a.addresses.total - a.addresses.none
                return (
                  <tr key={a.slug}>
                    <th scope="row">{cityLink(a.slug, name(a.munic))}</th>
                    <td className={s.n}>
                      {n(inA)} / {n(a.addresses.total)}
                    </td>
                    <td className={s.n}>{pct(inA, a.addresses.total, lang)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Miami-Dade</th>
                <td className={s.n}>
                  {n(inZone)} / {n(data.county.total)}
                </td>
                <td className={s.n}>{pct(inZone, data.county.total, lang)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <SurgeSources fetchedAt={data.fetchedAt} lang={lang} c={c} />
      </main>
    </PageShell>
  )
}
