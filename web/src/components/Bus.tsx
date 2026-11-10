import Link from 'next/link'
import type { Lang } from '../i18n'
import type { busCopy } from '../lib/busCopy'
import {
  COUNTY,
  allNight,
  formatBusTime,
  lineHref,
  lineLabel,
  rankTransfers,
  routeName,
  type CountyDirection,
  type CountyRoute,
  type CountyStation,
  type DayKind,
} from '../lib/county'
import b from './bus.module.css'
import s from './vote.module.css'

type C = ReturnType<typeof busCopy>

/** The route's number in a box, or a T for a trolley: what's on the front of the bus. */
export function RouteBullet({ route, size = 28 }: { route: CountyRoute; size?: number }) {
  return (
    <span
      className={b.bullet}
      style={{ fontSize: size, boxShadow: `4px 4px 0 ${route.color}` }}
      aria-hidden
    >
      {route.number ?? (route.kind === 'rail' ? 'MR' : route.kind === 'mover' ? 'MM' : 'T')}
    </span>
  )
}

export { FareChip } from './FareChip'

/** Other lines at a stop, the site's own linked: Metrorail first, then ours, then the rest. */
function Transfers({
  station,
  self,
  lang,
  c,
}: {
  station: CountyStation
  self: string
  lang: Lang
  c: C
}) {
  const { shown, more } = rankTransfers(station.transfers.filter((t) => t !== self))
  if (!shown.length) return null
  return (
    <span className={b.transfers}>
      <span>{c.transfer}</span>
      {shown.map((short) => {
        const label = lineLabel(short, lang)
        const href = lineHref(short, lang)
        const rail = COUNTY.lines[short]?.kind === 'rail'
        return href ? (
          <Link key={short} href={href} className={b.line}>
            {label}
          </Link>
        ) : (
          <span key={short} className={`${b.line} ${rail ? b.lineRail : ''}`}>
            {label}
          </span>
        )
      })}
      {more ? <span>{c.more(more)}</span> : null}
    </span>
  )
}

function StopItem({
  station,
  route,
  lang,
  c,
  keyStop,
}: {
  station: CountyStation
  route: CountyRoute
  lang: Lang
  c: C
  keyStop: boolean
}) {
  return (
    <li className={`${b.stop} ${keyStop ? b.stopKey : ''}`}>
      <span className={b.stopMin}>{c.minutes(station.min)}</span>
      <span className={b.stopName}>{station.name}</span>
      <Transfers station={station} self={route.short} lang={lang} c={c} />
    </li>
  )
}

/**
 * Which stops a rider reads at a glance: the ends, the county's timed stops,
 * and anywhere Metrorail meets the route. The rest wait in the full list.
 */
export function keyStops(d: CountyDirection): CountyStation[] {
  const last = d.stations.length - 1
  return d.stations.filter(
    (st, i) =>
      i === 0 ||
      i === last ||
      st.timepoint ||
      st.transfers.some((t) => COUNTY.lines[t]?.kind === 'rail'),
  )
}

/** One direction: where it's headed, its main stops, and every stop behind a fold. */
export function DirectionStops({
  route,
  d,
  lang,
  c,
}: {
  route: CountyRoute
  d: CountyDirection
  lang: Lang
  c: C
}) {
  const key = keyStops(d)
  const keyIds = new Set(key.map((st) => st.id))
  return (
    <section className={s.card} aria-label={c.stopList(d.toward)}>
      <h2 className={s.cardTag}>{c.toward(d.toward)}</h2>
      {d.alsoEnds.length ? <p className={s.note}>{c.alsoEnds(d.alsoEnds.join(', '))}</p> : null}
      <ol className={b.stops}>
        {key.map((st) => (
          <StopItem key={st.id} station={st} route={route} lang={lang} c={c} keyStop />
        ))}
      </ol>
      <details className={b.all}>
        <summary>{c.allStops(d.stations.length)}</summary>
        <ol className={b.stops}>
          {d.stations.map((st, i) => (
            <StopItem
              key={`${st.id}-${i}`}
              station={st}
              route={route}
              lang={lang}
              c={c}
              keyStop={keyIds.has(st.id)}
            />
          ))}
        </ol>
      </details>
    </section>
  )
}

const DAYS: DayKind[] = ['weekday', 'saturday', 'sunday']

/**
 * First and last bus out and the typical gap, per kind of day and direction.
 * A real table for screen readers and crawlers; on a phone each row is a card.
 */
export function ScheduleTable({ route, lang, c }: { route: CountyRoute; lang: Lang; c: C }) {
  const every = (m: number | null) => (m ? c.every(m) : '—')
  return (
    <>
      {route.directions.map((d) => (
        <div key={d.id} className={b.scheduleDir}>
          <h3 className={b.scheduleTo}>{c.toward(d.toward)}</h3>
          <table className={b.schedule}>
            <caption>{`${c.scheduleCaption(routeName(route, lang))} · ${c.toward(d.toward)}`}</caption>
            <thead>
              <tr>
                <th scope="col">{c.day}</th>
                <th scope="col">{c.firstBus}</th>
                <th scope="col">{c.lastBus}</th>
                <th scope="col">{c.rush}</th>
                <th scope="col">{c.midday}</th>
                <th scope="col">{c.evening}</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((kind) => {
                const day = d.schedule[kind]
                const name = c[kind]
                if (!day) {
                  return (
                    <tr key={kind}>
                      <th scope="row">{name}</th>
                      <td colSpan={5}>{c.noService}</td>
                    </tr>
                  )
                }
                const night = allNight(day)
                return (
                  <tr key={kind}>
                    <th scope="row">{name}</th>
                    <td>
                      <span className={b.cellLabel}>{c.firstBus}</span>
                      {night ? c.allNight : formatBusTime(day.first, lang)}
                    </td>
                    <td>
                      <span className={b.cellLabel}>{c.lastBus}</span>
                      {night ? c.allNight : formatBusTime(day.last, lang)}
                    </td>
                    <td>
                      <span className={b.cellLabel}>{c.rush}</span>
                      {every(day.headway.morning)}
                    </td>
                    <td>
                      <span className={b.cellLabel}>{c.midday}</span>
                      {every(day.headway.midday)}
                    </td>
                    <td>
                      <span className={b.cellLabel}>{c.evening}</span>
                      {every(day.headway.evening)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  )
}
