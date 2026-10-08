import type { Lang } from '../i18n'
import { LINKS, type CityCivic, type PlacesData } from '../lib/civic'
import type { RowCount } from '../lib/civicSync'
import { addressCopy, dayName, ruleText } from '../lib/addressCopy'
import { routes } from '../lib/routes'
import { longDay } from '../lib/voteCopy'
import { fmt, pct } from '../lib/surgeCopy'
import type { PlacesCopy } from '../lib/placesCopy'
import v from './vote.module.css'
import s from './civic.module.css'

/**
 * Pieces of the city and district pages. Server components: every table is
 * in the HTML a crawler reads.
 */

export function PlacesHero({
  title,
  lang,
  c,
  lens,
}: {
  title: string
  lang: Lang
  c: PlacesCopy
  lens: 'garbage' | 'commission'
}) {
  return (
    <header className={v.hero}>
      <span className={v.kicker}>{c.kicker}</span>
      <h1 className={v.title}>{title}</h1>
      <div className={v.actions}>
        <a className={v.action} href={`${routes.address(lang)}#search`}>
          <span aria-hidden="true">🔎</span> {c.findAddress}
        </a>
        <a className={`${v.action} ${v.actionAlt}`} href={`${routes.address(lang)}?lens=${lens}`}>
          <span aria-hidden="true">🗺️</span> {lens === 'commission' ? c.mapCommission : c.mapPlace}
        </a>
      </div>
    </header>
  )
}

/** One pickup type's rows: the zone or route, its days as the provider writes them, and how many addresses. */
export function PickupTable({
  title,
  rows,
  table,
  lang,
  c,
}: {
  title: string
  rows: RowCount[]
  table: PlacesData['zones']['garbage']
  lang: Lang
  c: PlacesCopy
}) {
  const a = addressCopy(lang)
  if (!rows.length) return null
  return (
    <table className={s.data}>
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">{c.zoneCol}</th>
          <th scope="col">{c.daysCol}</th>
          <th scope="col" className={s.n}>
            {c.addressesCol}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const p = table[r.i]
          if (!p) return null
          const days = p.appointment
            ? a.byAppointment
            : p.rule?.biweekly
              ? a.everyOther(p.rule.days.map((d) => dayName(d, lang)).join(' / '))
              : p.rule
                ? ruleText(p.rule, lang)
                : '—'
          return (
            <tr key={r.i}>
              <th scope="row">{c.zoneLabel(p.by, p.zone)}</th>
              <td>{days}</td>
              <td className={s.n}>{fmt(r.n, lang)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function FloodTable({ city, data, lang, c }: { city: CityCivic; data: PlacesData; lang: Lang; c: PlacesCopy }) {
  const inSome = city.flood.reduce((t, r) => t + r.n, 0)
  const none = city.total - inSome
  return (
    <table className={s.data}>
      <thead>
        <tr>
          <th scope="col">{c.floodZone}</th>
          <th scope="col" className={s.n}>
            {c.addressesCol}
          </th>
          <th scope="col" className={s.n}>
            %
          </th>
        </tr>
      </thead>
      <tbody>
        {city.flood.map((r) => {
          const zone = data.zones.flood[r.i] ?? '?'
          return (
            <tr key={r.i}>
              <th scope="row">
                {zone}
                {/^[AV]/.test(zone) ? ` · ${c.floodHigh}` : ''}
              </th>
              <td className={s.n}>{fmt(r.n, lang)}</td>
              <td className={s.n}>{pct(r.n, city.total, lang)}</td>
            </tr>
          )
        })}
        {none ? (
          <tr>
            <th scope="row">{c.floodNone}</th>
            <td className={s.n}>{fmt(none, lang)}</td>
            <td className={s.n}>{pct(none, city.total, lang)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

export function PlacesSources({ data, lang, c }: { data: PlacesData; lang: Lang; c: PlacesCopy }) {
  const published = data.pollingSource?.published
  return (
    <section className={v.sources} aria-labelledby="sources">
      <h2 id="sources" className={v.cardTag} style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>
        {c.sources}
      </h2>
      <p>
        {c.source(longDay(data.fetchedAt, lang))}{' '}
        <a href={LINKS.openData} target="_blank" rel="noopener noreferrer">
          {c.openData} ↗
        </a>
      </p>
      {published && data.pollingSource?.url ? (
        <p>
          {c.sourceVote(longDay(published, lang))}{' '}
          <a href={data.pollingSource.url} target="_blank" rel="noopener noreferrer">
            PDF ↗
          </a>
        </p>
      ) : null}
      <p>{c.counted}</p>
    </section>
  )
}
