import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { openGraph } from '../../../../lib/site'
import {
  addressReport,
  civicVersion,
  civicReady,
  CITY_GOVERNMENT,
  KIND,
  LINKS,
  prettyAddress,
  type AddressReport,
  type Nearby,
  type Pickup,
} from '../../../../lib/civic'
import { titleCase } from '../../../../lib/civicGeo'
import {
  addressCopy,
  dayName,
  mapCopy,
  pickupDay,
  ruleText,
  type AddressCopy,
  type MapCopy,
} from '../../../../lib/addressCopy'
import { addDays } from '../../../../lib/dates'
import { PageShell } from '../../../../components/PageShell'
import { AddressSearch } from '../../../../components/AddressSearch'
import { PrintButton } from '../../../../components/PrintButton'
import { OpenInBrowser } from '../../../../components/OpenInBrowser'
import { ExploreMap, ReportTabs } from '../../../../components/ReportTabs'
import { isMapLens, type LensId } from '../../../../lib/mapLenses'
import { detectWebview, type Webview } from '../../../../lib/webview'
import { HoursLines, LineBullet } from '../../../../components/Transit'
import s from '../../../../components/address.module.css'

type Props = {
  params: Promise<{ lang: string }>
  searchParams: Promise<{
    a?: string | string[]
    view?: string | string[]
    lens?: string | string[]
  }>
}

const slugParam = (a: string | string[] | undefined) => (Array.isArray(a) ? a[0] : a) ?? ''

/**
 * One address in Hialeah, everything the city and the county have on it.
 *
 * The search is the indexable page; an address is not. `?a=` pages are
 * noindex: a page per house would be a "look up anyone's home" directory,
 * and that is not what this is for.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = addressCopy(lang)
  const slug = slugParam((await searchParams).a)
  return {
    title: c.metaTitle,
    description: c.metaDescription,
    openGraph: openGraph(lang, {
      title: c.metaTitle,
      description: c.metaDescription,
      url: routes.address(lang),
    }),
    alternates: {
      canonical: routes.address(lang),
      languages: { en: routes.address('en'), es: routes.address('es') },
    },
    ...(slug ? { robots: { index: false, follow: true } } : {}),
  }
}

export default async function AddressPage({ params, searchParams }: Props) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const c = addressCopy(lang)
  const sp = await searchParams
  const slug = slugParam(sp.a)
  const lensParam = slugParam(sp.lens)
  const lens: LensId = isMapLens(lensParam) ? lensParam : 'garbage'
  const view = slugParam(sp.view) === 'map' ? 'map' : 'list'
  const mc = mapCopy(lang)
  const report = slug ? await addressReport(slug) : null
  const ready = report ? true : await civicReady()
  const version = (await civicVersion()) ?? '0'
  const webview = report ? detectWebview((await headers()).get('user-agent')) : null

  const searchCopy = {
    placeholder: c.placeholder,
    inputLabel: c.inputLabel,
    listLabel: c.listLabel,
    go: c.go,
    locate: c.locate,
    locating: c.locating,
    isThisIt: c.isThisIt,
    yesThis: c.yesThis,
    noLocation: c.noLocation,
    notNear: c.notNear,
    noMatch: c.noMatch,
    privacy: c.privacy,
  }

  return (
    <PageShell>
      <main className={s.main}>
        {report ? (
          <Report r={report} lang={lang} c={c} webview={webview} mc={mc} view={view} lens={lens} version={version} />
        ) : null}

        <header className={`${s.hero} ${report ? s.noPrint : ''}`} id="search">
          <span className={s.kicker}>{c.kicker}</span>
          {report ? (
            <h2 className={s.title} style={{ fontSize: 'clamp(26px,4.4vw,38px)' }}>
              {c.title}
            </h2>
          ) : (
            <h1 className={s.title}>{c.title}</h1>
          )}
          {!report ? <p className={s.lead}>{c.lead}</p> : null}
          {!ready ? (
            <p className={s.note}>{c.notReady}</p>
          ) : slug && !report ? (
            <p className={s.note}>{c.notFound}</p>
          ) : null}
          <AddressSearch lang={lang} copy={searchCopy} />
          <p className={s.coverage}>{c.coverage}</p>
        </header>

        {!report && ready ? <ExploreMap copy={mc} version={version} initialLens={lens} /> : null}
      </main>
    </PageShell>
  )
}

function Report({
  r,
  lang,
  c,
  webview,
  mc,
  view,
  lens,
  version,
}: {
  r: AddressReport
  lang: Lang
  c: AddressCopy
  webview: Webview | null
  mc: MapCopy
  view: 'list' | 'map'
  lens: LensId
  version: string
}) {
  const t = translator(lang)
  const address = prettyAddress(r.label)
  const day = (iso: string) => pickupDay(iso, lang)
  const asOf = day(r.fetchedAt)
  const { garbage, recycling, bulk } = r.trash
  const hasCalendar = [garbage, recycling, bulk].some((p) => p?.next.length)
  const by = garbage?.by ?? recycling?.by ?? bulk?.by
  const wasteLink =
    by === 'hialeah'
      ? LINKS.hialeahSolidWaste
      : by === 'miami'
        ? LINKS.miamiSolidWaste
        : LINKS.countySolidWaste
  const munic = titleCase(r.munic)
  const isHialeah = r.munic === 'HIALEAH'
  const isUnincorporated = r.munic.startsWith('UNINCORPORATED')

  return (
    <>
      <section className={s.addrHead} aria-labelledby="addr">
        <span className={`${s.kicker} ${s.noPrint}`}>{c.kicker}</span>
        <span className={`${s.addrSub} ${s.sheetOnly}`}>{c.sheetTitle}</span>
        <h1 id="addr" className={s.addrTitle}>
          {address}
        </h1>
        <span className={s.addrSub}>
          {r.city}, FL {r.zip}
          {r.munic && r.munic !== r.city ? ` · ${r.munic}` : ''}
          {c.units(r.units) ? ` · ${c.units(r.units)}` : ''}
        </span>
        {webview ? (
          <OpenInBrowser
            webview={webview}
            text={c.webview(webview.app)}
            openChrome={c.openChrome}
            copyLink={c.copyLink}
            copied={c.copied}
          />
        ) : null}
        <div className={s.actions}>
          {!webview ? (
            <>
              {hasCalendar ? (
                <a
                  className={s.action}
                  href={`/api/address/calendar?a=${r.slug}&lang=${lang}`}
                  download={`${r.slug}.ics`}
                >
                  <span aria-hidden="true">📅</span> {c.calendar}
                </a>
              ) : null}
              <PrintButton label={c.print} />
            </>
          ) : null}
          <a className={`${s.action} ${s.actionAlt}`} href="#search">
            {c.change}
          </a>
        </div>
        {!webview && hasCalendar ? <p className={s.hint}>{c.calendarHint}</p> : null}
      </section>

      <ReportTabs at={r.at} copy={mc} version={version} initialView={view} initialLens={lens}>
        <div className={s.grid}>
          {/* --- Trash --- */}
          <section className={`${s.card} ${s.wide}`} aria-labelledby="trash">
            <h3 id="trash" className={s.cardTag}>
              🗑️ {c.trash}
            </h3>
            {r.kind === KIND.business ? <p className={s.alert}>{c.businessNote}</p> : null}
            {r.kind === KIND.building ? <p className={s.alert}>{c.buildingNote}</p> : null}
            {r.kind === KIND.mobile && garbage ? <p className={s.alert}>{c.mobileNote}</p> : null}
            {garbage || recycling || bulk ? (
              <>
                <div className={s.rows}>
                  <PickupRow label={c.garbage} p={garbage} lang={lang} c={c} />
                  <PickupRow label={c.recycling} p={recycling} lang={lang} c={c} />
                  <PickupRow
                    label={c.bulk}
                    p={bulk}
                    lang={lang}
                    c={c}
                    extra={
                      bulk?.by === 'hialeah' && bulk.next[0]
                        ? c.bulkRule(day(addDays(bulk.next[0], -1)))
                        : undefined
                    }
                  />
                </div>
                <p className={s.meta}>
                  {c.holidays}{' '}
                  <a className={s.link} href={wasteLink} target="_blank" rel="noopener noreferrer">
                    {c.sourceBy[by ?? 'county']} ↗
                  </a>
                </p>
              </>
            ) : (
              <p className={s.small}>{c.cityRuns(munic)}</p>
            )}
          </section>

          {/* --- Free bus --- */}
          {r.bus.length ? (
            <section className={s.card} aria-labelledby="bus">
              <h3
                id="bus"
                className={s.cardTag}
                style={{ background: 'var(--pink)', color: 'var(--cream)' }}
              >
                🚌 {c.bus}
              </h3>
              <div className={s.rows}>
                {r.bus.map((b) => (
                  <div key={b.route.slug} className={s.row}>
                    <span
                      className={s.rowLabel}
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <LineBullet route={b.route} size={26} /> {b.route.name}
                    </span>
                    <span className={s.big}>
                      {b.walk <= 20 ? c.walk(b.walk) : c.far((b.meters / 1000).toFixed(1))}
                    </span>
                    <Link
                      className={`${s.link} ${s.noPrint}`}
                      href={`${routes.freeRoute(lang, b.route.slug)}#stop-${b.stationId}`}
                    >
                      {c.seeLine} →
                    </Link>
                    <p className={s.small}>
                      {c.stop}: {b.stopName}
                    </p>
                  </div>
                ))}
              </div>
              <HoursLines lang={lang} t={t} />
            </section>
          ) : null}

          {/* --- Flood + storm --- */}
          <section className={s.card} aria-labelledby="flood">
            <h3
              id="flood"
              className={s.cardTag}
              style={{ background: 'var(--cyan)', color: 'var(--ink)' }}
            >
              🌊 {c.flood}
            </h3>
            {r.flood ? (
              <>
                <span className={s.big}>{c.floodZone(r.flood)}</span>
                <p className={s.small}>{c.floodText[r.flood] ?? ''}</p>
              </>
            ) : null}
            <h3
              className={s.cardTag}
              style={{ background: 'var(--cyan)', color: 'var(--ink)', marginTop: 6 }}
            >
              🌀 {c.storm}
            </h3>
            {r.surge ? (
              <>
                <span className={s.big}>{c.surgeZone(r.surge)}</span>
                <p className={s.small}>{c.surgeText(r.surge)}</p>
              </>
            ) : (
              <span className={s.big}>{c.surgeNone}</span>
            )}
            {r.kind === KIND.mobile ? (
              <p className={s.alert}>{c.mobileAlert}</p>
            ) : (
              <p className={s.small}>{c.mobileHome}</p>
            )}
            <p className={s.small}>{c.shelters}</p>
            <a
              className={`${s.link} ${s.noPrint}`}
              href={LINKS.knowYourZone}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.knowZone} ↗
            </a>
          </section>

          {/* --- Representatives --- */}
          <section className={s.card} aria-labelledby="reps">
            <h3 id="reps" className={s.cardTag}>
              🏛️ {c.reps}
            </h3>
            <div className={s.rows}>
              {isHialeah ? (
                <>
                  <Person
                    label={c.mayor}
                    name={CITY_GOVERNMENT.mayor}
                    href={CITY_GOVERNMENT.mayorUrl}
                  />
                  <div className={s.row}>
                    <span className={s.rowLabel}>{c.council}</span>
                    <p className={s.small}>
                      {c.councilText}{' '}
                      <a
                        className={s.link}
                        href={CITY_GOVERNMENT.councilUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        hialeahfl.gov ↗
                      </a>
                    </p>
                  </div>
                </>
              ) : isUnincorporated ? (
                <div className={s.row}>
                  <span className={s.rowLabel}>{c.unincorporated}</span>
                  <p className={s.small}>{c.unincorporatedText}</p>
                </div>
              ) : (
                <Person label={c.yourCity} name={munic} />
              )}
              {r.commission ? (
                <Person label={c.commissioner(r.commission.district)} name={r.commission.name} />
              ) : null}
              {/* The county's state-district layers date from 2022, so a name there may be
                out of date: the district is certain, the person is looked up at the source. */}
              {r.house ? (
                <District
                  label={c.houseLabel}
                  district={r.house.district}
                  c={c}
                  href={LINKS.findHouse}
                />
              ) : null}
              {r.senate ? (
                <District
                  label={c.senateLabel}
                  district={r.senate.district}
                  c={c}
                  href={LINKS.findSenate}
                />
              ) : null}
            </div>
            <p className={s.meta}>{c.repsAsOf(asOf)}</p>
          </section>

          {/* --- Voting --- */}
          {r.precinct ? (
            <section className={s.card} aria-labelledby="vote">
              <h3
                id="vote"
                className={s.cardTag}
                style={{ background: 'var(--yellow)', color: 'var(--ink)' }}
              >
                🗳️ {c.vote}
              </h3>
              <span className={s.rowLabel}>{c.precinct(r.precinct)}</span>
              {r.polling ? (
                <>
                  <span className={s.big}>{r.polling.name}</span>
                  <p className={s.small}>{r.polling.address}</p>
                </>
              ) : null}
              <p className={s.small}>{c.voteText}</p>
              <a
                className={`${s.link} ${s.noPrint}`}
                href={LINKS.elections}
                target="_blank"
                rel="noopener noreferrer"
              >
                {c.elections} ↗
              </a>
            </section>
          ) : null}

          {/* --- Schools --- */}
          <section className={s.card} aria-labelledby="schools">
            <h3 id="schools" className={s.cardTag}>
              🏫 {c.schools}
            </h3>
            <div className={s.rows}>
              {[r.schools.elementary, r.schools.middle, r.schools.high].map((sc) =>
                sc ? (
                  <div key={sc.name} className={s.row}>
                    <span className={s.rowLabel}>{sc.grades}</span>
                    <span className={s.big}>{sc.name}</span>
                    <a className={s.tel} href={`tel:${sc.phone}`}>
                      {sc.phone}
                    </a>
                    <p className={s.small}>{sc.address}</p>
                  </div>
                ) : null,
              )}
            </div>
            <p className={s.meta}>{c.schoolNote}</p>
          </section>

          {/* --- Nearby --- */}
          <section className={s.card} aria-labelledby="near">
            <h3
              id="near"
              className={s.cardTag}
              style={{ background: 'var(--pink)', color: 'var(--cream)' }}
            >
              📍 {c.nearby}
            </h3>
            <p className={s.alert}>{c.emergency}</p>
            <div className={s.rows}>
              <Place label={c.fire} p={r.nearby.fire} c={c} phoneNote={c.nonEmergency} />
              <Place label={c.police} p={r.nearby.police} c={c} phoneNote={c.nonEmergency} />
              <Place label={c.hospital} p={r.nearby.hospital} c={c} />
              <Place label={c.library} p={r.nearby.library} c={c} />
              <Place label={c.park} p={r.nearby.park} c={c} />
            </div>
          </section>
        </div>

        <p className={`${s.meta} ${s.sheetOnly}`}>{c.sheetFooter}</p>

        <section className={s.sources} aria-labelledby="sources">
          <h3
            id="sources"
            className={s.cardTag}
            style={{ background: 'var(--yellow)', color: 'var(--ink)' }}
          >
            {c.sources}
          </h3>
          <p style={{ margin: 0 }}>{c.sourcesText(asOf)}</p>
          <ul className={s.sourceList}>
            <li>
              <a href={LINKS.openData} target="_blank" rel="noopener noreferrer">
                Miami-Dade County · Open Data
              </a>
            </li>
            <li>
              <a href={wasteLink} target="_blank" rel="noopener noreferrer">
                {c.sourceBy[by ?? 'county']} · Solid Waste
              </a>
            </li>
            <li>
              <a href={LINKS.femaFlood} target="_blank" rel="noopener noreferrer">
                FEMA · Flood Map Service Center
              </a>
            </li>
            {isHialeah ? (
              <li>
                <a href={CITY_GOVERNMENT.governmentUrl} target="_blank" rel="noopener noreferrer">
                  City of Hialeah · Your Government
                </a>
              </li>
            ) : null}
          </ul>
          <Link href={routes.listYourSpot(lang)} style={{ color: 'var(--cyan)', fontWeight: 800 }}>
            {c.wrong} →
          </Link>
        </section>
      </ReportTabs>
    </>
  )
}

function PickupRow({
  label,
  p,
  lang,
  c,
  extra,
}: {
  label: string
  p: Pickup | null
  lang: Lang
  c: AddressCopy
  extra?: string
}) {
  if (!p) return null
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      {p.appointment ? (
        <>
          <span className={s.big}>{c.byAppointment}</span>
          <a
            className={`${s.link} ${s.noPrint}`}
            href={LINKS.countyBulky}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c.bookBulk} ↗
          </a>
          <p className={s.small}>{c.appointmentText}</p>
        </>
      ) : p.rule?.biweekly ? (
        <>
          <span className={s.big}>
            {c.everyOther(p.rule.days.map((d) => dayName(d, lang)).join(' / '))}
          </span>
          <a
            className={`${s.link} ${s.noPrint}`}
            href={LINKS.countyRecycling}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c.findWeek} ↗
          </a>
        </>
      ) : p.rule ? (
        <>
          <span className={s.big}>{ruleText(p.rule, lang)}</span>
          {p.next[0] ? (
            <span className={s.next}>
              {c.next}: {pickupDay(p.next[0], lang)}
            </span>
          ) : null}
          {extra ? <p className={s.small}>{extra}</p> : null}
        </>
      ) : (
        <p className={s.small}>{c.noPickup}</p>
      )}
    </div>
  )
}

function District({
  label,
  district,
  c,
  href,
}: {
  label: string
  district: number
  c: AddressCopy
  href: string
}) {
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.big}>{c.districtN(district)}</span>
      <a className={`${s.link} ${s.noPrint}`} href={href} target="_blank" rel="noopener noreferrer">
        {c.whoIsIt} ↗
      </a>
    </div>
  )
}

function Person({ label, name, href }: { label: string; name: string; href?: string }) {
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>{label}</span>
      <span className={s.big}>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
            {name}
          </a>
        ) : (
          name
        )}
      </span>
    </div>
  )
}

function Place({
  label,
  p,
  c,
  phoneNote,
}: {
  label: string
  p: Nearby | null
  c: AddressCopy
  phoneNote?: string
}) {
  if (!p) return null
  return (
    <div className={s.row}>
      <span className={s.rowLabel}>
        {label} · {p.walk <= 20 ? c.walk(p.walk) : c.far((p.meters / 1000).toFixed(1))}
      </span>
      <span className={s.big} style={{ gridColumn: '1 / -1' }}>
        {p.name}
      </span>
      {p.phone ? (
        <p className={s.small}>
          <a className={s.tel} href={`tel:${p.phone}`}>
            {p.phone}
          </a>
          {phoneNote ? ` · ${phoneNote}` : ''}
        </p>
      ) : null}
      <p className={s.small}>{p.address}</p>
    </div>
  )
}
