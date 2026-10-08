import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { openGraph } from '../../../../../lib/site'
import { surgeData, type SurgeData } from '../../../../../lib/civic'
import { areaName } from '../../../../../lib/voteCopy'
import { fmt, listOf, pct, surgeCopy, SURGE_PAGES } from '../../../../../lib/surgeCopy'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../../lib/jsonld'
import { PageShell } from '../../../../../components/PageShell'
import { JsonLd } from '../../../../../components/JsonLd'
import { AnswerBlock } from '../../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../../components/Breadcrumbs'
import { SurgeGuidance, SurgeHero, SurgeSources } from '../../../../../components/Surge'
import v from '../../../../../components/vote.module.css'
import s from '../../../../../components/civic.module.css'

type Props = { params: Promise<{ lang: string; area: string }> }

/**
 * «¿Hialeah está en zona de evacuación?»: one city's addresses by
 * storm-surge zone, and by ZIP code. Counts only; never a street or a house.
 */
async function load(): Promise<SurgeData> {
  const data = await surgeData()
  if (!data) throw new Error('evacuation zones: the address database is not ready')
  return data
}

const findArea = (data: SurgeData, slug: string) => (SURGE_PAGES.includes(slug) ? (data.areas.find((a) => a.slug === slug) ?? null) : null)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, area: slug } = await params
  if (!isLang(lang)) return {}
  const data = await surgeData()
  const area = data ? findArea(data, slug) : null
  if (!area) return {}
  const c = surgeCopy(lang)
  const name = areaName({ munic: area.munic, district: null }, lang)
  const title = c.areaMetaTitle(name)
  const description = c.areaMetaDescription(name, fmt(area.addresses.total - area.addresses.none, lang), fmt(area.addresses.total, lang))
  return {
    title,
    description,
    openGraph: openGraph(lang, { title, description, url: routes.evacuationArea(lang, slug) }),
    alternates: {
      canonical: routes.evacuationArea(lang, slug),
      languages: { en: routes.evacuationArea('en', slug), es: routes.evacuationArea('es', slug) },
    },
  }
}

export default async function EvacuationArea({ params }: Props) {
  const { lang, area: slug } = await params
  if (!isLang(lang)) notFound()
  const data = await load()
  const area = findArea(data, slug)
  if (!area) notFound()
  const c = surgeCopy(lang)
  const n = (x: number) => fmt(x, lang)
  const name = areaName({ munic: area.munic, district: null }, lang)
  const path = routes.evacuationArea(lang, slug)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path: routes.evacuation(lang) },
    { name, path },
  ]
  const t = area.addresses
  const inZone = t.total - t.none
  const present = data.zones.filter((z) => (t.byZone[z] ?? 0) > 0)
  const absent = data.zones.filter((z) => !(t.byZone[z] ?? 0))
  const parts = listOf(
    present.map((z) => c.partInZone(n(t.byZone[z]), z)),
    lang,
  )
  const answer = inZone
    ? c.areaAnswer(name, n(inZone), n(t.total), parts, n(t.none), t.none === 0)
    : c.areaAnswerNone(name, n(t.total))

  return (
    <PageShell>
      <JsonLd data={[webPageJsonLd(lang, path, { name: c.areaTitle(name), dateModified: data.fetchedAt }), breadcrumbJsonLd(crumbs)]} />
      <main className={v.main}>
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
        <SurgeHero title={c.areaTitle(name)} lang={lang} c={c} />
        <AnswerBlock question={c.areaQuestion(name)} answer={answer} />

        <section className={v.card} aria-labelledby="by-zone">
          <h2 id="by-zone" className={v.cardTag}>
            {c.byZone}
          </h2>
          <table className={s.data}>
            <thead>
              <tr>
                <th scope="col">{c.zone}</th>
                <th scope="col" className={s.n}>
                  {c.addressesCol}
                </th>
                <th scope="col" className={s.n}>
                  {c.share}
                </th>
              </tr>
            </thead>
            <tbody>
              {present.map((z) => (
                <tr key={z}>
                  <th scope="row">
                    <Link href={`${routes.evacuation(lang)}#zone-${z}`}>{c.zoneTitle(z)}</Link>
                    <span className={s.zoneText} style={{ display: 'block', fontSize: 13 }}>
                      {c.zoneMeaning(z)}
                    </span>
                  </th>
                  <td className={s.n}>{n(t.byZone[z])}</td>
                  <td className={s.n}>{pct(t.byZone[z], t.total, lang)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">{c.noZone}</th>
                <td className={s.n}>{n(t.none)}</td>
                <td className={s.n}>{pct(t.none, t.total, lang)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{c.total}</th>
                <td className={s.n}>{n(t.total)}</td>
                <td className={s.n}>{pct(t.total, t.total, lang)}</td>
              </tr>
            </tfoot>
          </table>
          {absent.length ? <p className={v.note}>{c.notIn(listOf(absent.map(c.zoneTitle), lang))}</p> : null}
          <p className={v.note}>{c.partial}</p>
          <Link href={routes.place(lang, area.slug)} style={{ fontWeight: 800, color: 'var(--ink)' }}>
            {c.morePlace(name)} →
          </Link>
        </section>

        {/* No count of mobile homes: a park is usually one parcel and one address,
            so the address list counts parks, not homes (279 in the whole county). */}
        <SurgeGuidance c={c} />

        {area.zips.length > 1 ? (
          <section className={v.card} aria-labelledby="by-zip">
            <h2 id="by-zip" className={v.cardTag}>
              {c.byZip}
            </h2>
            <table className={s.data}>
              <thead>
                <tr>
                  <th scope="col">{c.zip}</th>
                  {present.map((z) => (
                    <th key={z} scope="col" className={s.n}>
                      {z}
                    </th>
                  ))}
                  <th scope="col" className={s.n}>
                    {c.noZone}
                  </th>
                </tr>
              </thead>
              <tbody>
                {area.zips.map((zp) => (
                  <tr key={zp.zip}>
                    <th scope="row">{zp.zip}</th>
                    {present.map((z) => (
                      <td key={z} className={s.n}>
                        {n(zp.byZone[z] ?? 0)}
                      </td>
                    ))}
                    <td className={s.n}>{n(zp.none)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={v.note}>{c.byZipNote}</p>
          </section>
        ) : null}

        <SurgeSources fetchedAt={data.fetchedAt} lang={lang} c={c} />
      </main>
    </PageShell>
  )
}
