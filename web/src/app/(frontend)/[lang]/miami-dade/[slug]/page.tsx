import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { openGraph } from '../../../../../lib/site'
import { LINKS, placesData, type CityCivic, type DistrictCivic, type PlacesData } from '../../../../../lib/civic'
import { UNINCORPORATED } from '../../../../../lib/civicSync'
import { areaName } from '../../../../../lib/voteCopy'
import { fmt, listOf, pct, SURGE_PAGES } from '../../../../../lib/surgeCopy'
import { placesCopy, type PlacesCopy } from '../../../../../lib/placesCopy'
import { cityVote, floodHighRisk, trashMode, trashProviders } from '../../../../../lib/places'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../../lib/jsonld'
import { PageShell } from '../../../../../components/PageShell'
import { JsonLd } from '../../../../../components/JsonLd'
import { AnswerBlock } from '../../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../../components/Breadcrumbs'
import { FloodTable, PickupTable, PlacesHero, PlacesSources } from '../../../../../components/Places'
import v from '../../../../../components/vote.module.css'
import s from '../../../../../components/civic.module.css'

type Props = { params: Promise<{ lang: string; slug: string }> }

/**
 * One city (or the unincorporated county), or one commission district: what
 * the county's records say about it. Counts and tables, never an address.
 */
async function load(): Promise<PlacesData> {
  const data = await placesData()
  if (!data) throw new Error('places: the address database is not ready')
  return data
}

type Found = { kind: 'city'; city: CityCivic } | { kind: 'district'; district: DistrictCivic }

function find(data: PlacesData, slug: string): Found | null {
  const m = slug.match(/^commission-district-(\d+)$/)
  if (m) {
    const district = data.districts.find((d) => d.district === Number(m[1]))
    return district ? { kind: 'district', district } : null
  }
  const city = data.cities.find((x) => x.slug === slug)
  return city ? { kind: 'city', city } : null
}

const cityName = (city: Pick<CityCivic, 'munic'>, lang: Lang) => areaName({ munic: city.munic, district: null }, lang)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLang(lang)) return {}
  const data = await placesData()
  const f = data ? find(data, slug) : null
  if (!f) return {}
  const c = placesCopy(lang)
  const title = f.kind === 'city' ? c.cityMetaTitle(cityName(f.city, lang)) : c.districtMetaTitle(f.district.district, f.district.name)
  const description =
    f.kind === 'city' ? c.cityMetaDescription(cityName(f.city, lang)) : c.districtMetaDescription(f.district.district, f.district.name)
  const path = routes.place(lang, slug)
  return {
    title,
    description,
    openGraph: openGraph(lang, { title, description, url: path }),
    alternates: { canonical: path, languages: { en: routes.place('en', slug), es: routes.place('es', slug) } },
  }
}

export default async function Place({ params }: Props) {
  const { lang, slug } = await params
  if (!isLang(lang)) notFound()
  const data = await load()
  const f = find(data, slug)
  if (!f) notFound()
  const c = placesCopy(lang)
  return f.kind === 'city' ? (
    <CityPage city={f.city} data={data} lang={lang} c={c} slug={slug} />
  ) : (
    <DistrictPage district={f.district} data={data} lang={lang} c={c} slug={slug} />
  )
}

function Shell({
  lang,
  c,
  slug,
  name,
  title,
  data,
  children,
}: {
  lang: Lang
  c: PlacesCopy
  slug: string
  name: string
  title: string
  data: PlacesData
  children: React.ReactNode
}) {
  const path = routes.place(lang, slug)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path: routes.places(lang) },
    { name, path },
  ]
  return (
    <PageShell>
      <JsonLd data={[webPageJsonLd(lang, path, { name: title, dateModified: data.fetchedAt }), breadcrumbJsonLd(crumbs)]} />
      <main className={v.main}>
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
        {children}
        <PlacesSources data={data} lang={lang} c={c} />
      </main>
    </PageShell>
  )
}

function CityPage({ city, data, lang, c, slug }: { city: CityCivic; data: PlacesData; lang: Lang; c: PlacesCopy; slug: string }) {
  const n = (x: number) => fmt(x, lang)
  const name = cityName(city, lang)
  const mode = trashMode(city, data)
  const providers = trashProviders(city, data)
  const onRoute = Object.values(providers).reduce((t, x) => t + x, 0)
  const uninc = city.munic === UNINCORPORATED
  const trashAnswer =
    mode.kind === 'own'
      ? c.trashOwn(name, mode.by === 'hialeah' ? 'Hialeah' : 'Miami')
      : mode.kind === 'county'
        ? uninc
          ? c.unincorporatedTrash(n(providers.county ?? 0), n(city.total))
          : c.trashCounty(name, n(providers.county ?? 0), n(city.total))
        : c.trashCity(name)
  const wasteLink = mode.kind === 'own' ? (mode.by === 'hialeah' ? LINKS.hialeahSolidWaste : LINKS.miamiSolidWaste) : LINKS.countySolidWaste
  const wasteLabel = mode.kind === 'own' ? (mode.by === 'hialeah' ? c.wasteHialeah : c.wasteMiami) : c.wasteCounty
  const high = floodHighRisk(city, data)
  const surge = data.surge.areas.find((a) => a.munic === city.munic)
  const surgeIn = surge ? surge.addresses.total - surge.addresses.none : 0
  const vote = cityVote(city, data)

  return (
    <Shell lang={lang} c={c} slug={slug} name={name} title={c.cityTitle(name)} data={data}>
      <PlacesHero title={c.cityTitle(name)} lang={lang} c={c} lens="garbage" />
      <AnswerBlock question={c.cityQuestion(name)} answer={trashAnswer} />

      {mode.kind !== 'city' ? (
        <section className={v.card} aria-labelledby="trash">
          <h2 id="trash" className={v.cardTag}>
            🗑️ {c.trash}
          </h2>
          <PickupTable title={c.garbage} rows={city.garbage} table={data.zones.garbage} lang={lang} c={c} />
          <PickupTable title={c.recycling} rows={city.recycling} table={data.zones.recycling} lang={lang} c={c} />
          <PickupTable title={c.bulk} rows={city.bulk} table={data.zones.bulk} lang={lang} c={c} />
          {mode.kind === 'county' && city.total - onRoute > 0 ? <p className={v.note}>{c.trashUncovered(n(city.total - onRoute))}</p> : null}
          <p className={v.note}>
            {c.trashNote}{' '}
            <a href={wasteLink} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 800, color: 'var(--ink)' }}>
              {wasteLabel} ↗
            </a>
          </p>
        </section>
      ) : null}

      <section className={v.card} aria-labelledby="flood">
        <h2 id="flood" className={v.cardTag} style={{ background: 'var(--cyan)', color: 'var(--ink)' }}>
          🌊 {c.flood}
        </h2>
        <p className={v.note}>{c.floodAnswer(name, n(high), n(city.total), pct(high, city.total, lang))}</p>
        <FloodTable city={city} data={data} lang={lang} c={c} />
        <div className={s.links}>
          <a href={LINKS.femaFlood} target="_blank" rel="noopener noreferrer">
            {c.fema} ↗
          </a>
          <Link href={`${routes.address(lang)}?lens=flood`}>{c.mapPlace} →</Link>
        </div>
      </section>

      {surge ? (
        <section className={v.card} aria-labelledby="surge">
          <h2 id="surge" className={v.cardTag} style={{ background: 'var(--cyan)', color: 'var(--ink)' }}>
            🌀 {c.surge}
          </h2>
          <p className={v.note}>
            {surgeIn ? c.surgeAnswer(name, n(surgeIn), n(surge.addresses.total), pct(surgeIn, surge.addresses.total, lang)) : c.surgeNone(name)}
            {surgeIn
              ? ` ${listOf(
                  data.surge.zones
                    .filter((z) => surge.addresses.byZone[z])
                    .map((z) => `${lang === 'es' ? 'zona' : 'zone'} ${z}: ${n(surge.addresses.byZone[z])}`),
                  lang,
                )}.`
              : ''}
          </p>
          <div className={s.links}>
            <Link href={SURGE_PAGES.includes(city.slug) ? routes.evacuationArea(lang, city.slug) : routes.evacuation(lang)}>{c.surgeMore} →</Link>
          </div>
        </section>
      ) : null}

      {vote.precincts ? (
        <section className={v.card} aria-labelledby="vote">
          <h2 id="vote" className={v.cardTag} style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>
            🗳️ {c.vote}
          </h2>
          <p className={v.note}>{c.voteAnswer(name, vote.precincts, vote.places)}</p>
          <div className={s.links}>
            {vote.slugs.map((sl) => (
              <Link key={sl} href={routes.voteArea(lang, sl)}>
                {vote.slugs.length > 1 ? `${c.voteMore} · ${c.district(Number(sl.split('-').pop()))}` : c.voteMore} →
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className={v.card} aria-labelledby="stations">
        <h2 id="stations" className={v.cardTag} style={{ background: 'var(--pink)', color: 'var(--cream)' }}>
          🚒 {c.stations}
        </h2>
        <p className={v.note}>
          {city.fire.length || city.police.length ? c.stationsAnswer(name, city.fire.length, city.police.length) : c.stationsNone(name)}{' '}
          {c.emergency}
        </p>
        {city.fire.length || city.police.length ? (
          <table className={s.data}>
            <tbody>
              {[...city.fire.map((x) => ({ ...x, k: c.fire })), ...city.police.map((x) => ({ ...x, k: c.police }))].map((x, i) => (
                <tr key={i}>
                  <th scope="row">
                    {x.name}
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{x.k}</span>
                  </th>
                  <td>
                    {x.address}
                    {x.phone ? (
                      <span style={{ display: 'block' }}>
                        <a href={`tel:${x.phone}`}>{x.phone}</a>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className={s.links}>
          <Link href={`${routes.address(lang)}#search`}>{c.nearest} →</Link>
        </div>
      </section>

      {city.districts.length ? (
        <section className={v.card} aria-labelledby="commission">
          <h2 id="commission" className={v.cardTag}>
            🏛️ {c.commission}
          </h2>
          <p className={v.note}>{c.commissionIn(name)}</p>
          <ul className={v.areas}>
            {city.districts.map((d) => {
              const dist = data.districts.find((x) => x.district === d.district)
              return (
                <li key={d.district}>
                  <Link className={v.areaLink} href={routes.district(lang, d.district)}>
                    <span className={v.areaName}>{c.district(d.district)}</span>
                    {dist ? <span className={v.areaMeta}>{dist.name}</span> : null}
                    <span className={v.areaMeta}>{c.addresses(n(d.n))}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </Shell>
  )
}

function DistrictPage({
  district,
  data,
  lang,
  c,
  slug,
}: {
  district: DistrictCivic
  data: PlacesData
  lang: Lang
  c: PlacesCopy
  slug: string
}) {
  const n = (x: number) => fmt(x, lang)
  const label = c.districtTitle(district.district)
  const names = district.areas.map((a) => areaName({ munic: a.munic, district: null }, lang))
  const voteSlug = `unincorporated-district-${district.district}`
  const hasVote = data.vote.areas.some((a) => a.slug === voteSlug)

  return (
    <Shell lang={lang} c={c} slug={slug} name={c.district(district.district)} title={label} data={data}>
      <PlacesHero title={label} lang={lang} c={c} lens="commission" />
      <AnswerBlock
        question={c.districtQuestion(district.district)}
        answer={c.districtAnswer(district.district, district.name, n(district.total), listOf(names, lang))}
      />

      <section className={v.card} aria-labelledby="areas">
        <h2 id="areas" className={v.cardTag}>
          {c.inDistrict}
        </h2>
        <table className={s.data}>
          <thead>
            <tr>
              <th scope="col">{c.areaCol}</th>
              <th scope="col" className={s.n}>
                {c.addressesCol}
              </th>
              <th scope="col" className={s.n}>
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {district.areas.map((a) => (
              <tr key={a.slug}>
                <th scope="row">
                  <Link href={routes.place(lang, a.slug)}>{areaName({ munic: a.munic, district: null }, lang)}</Link>
                </th>
                <td className={s.n}>{n(a.n)}</td>
                <td className={s.n}>{pct(a.n, district.total, lang)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{c.district(district.district)}</th>
              <td className={s.n}>{n(district.total)}</td>
              <td className={s.n}>{pct(district.total, district.total, lang)}</td>
            </tr>
          </tfoot>
        </table>
        {hasVote ? (
          <div className={s.links}>
            <Link href={routes.voteArea(lang, voteSlug)}>{c.vote2} →</Link>
          </div>
        ) : null}
      </section>

      {district.unincorporatedZips.length ? (
        <section className={v.card} aria-labelledby="zips">
          <h2 id="zips" className={v.cardTag}>
            {c.unincorporatedZips}
          </h2>
          <p className={v.note}>{c.unincorporatedZipsNote}</p>
          <table className={s.data}>
            <thead>
              <tr>
                <th scope="col">{c.zip}</th>
                <th scope="col" className={s.n}>
                  {c.addressesCol}
                </th>
              </tr>
            </thead>
            <tbody>
              {district.unincorporatedZips.map((z) => (
                <tr key={z.zip}>
                  <th scope="row">{z.zip}</th>
                  <td className={s.n}>{n(z.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </Shell>
  )
}
