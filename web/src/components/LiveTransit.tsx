'use client'

import type * as React from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Arrival, LiveSnapshot, LiveVehicle, Toward } from '../lib/live'
import { TRANSIT, formatClock, meters, miamiClock, towardName, type LatLng, type TransitRoute } from '../lib/transit'
import tr from './transit.module.css'

/**
 * The live layer's browser half: everything here polls the site's own
 * /api/transit endpoints (never ETA directly) and only while someone can see
 * it — a hidden tab stops asking.
 */

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))

const subscribeVisibility = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
function usePageVisible() {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState === 'visible', () => true)
}

/** GET `url` now and every `everyMs` while the page is visible. `null` until the first answer. */
export function usePoll<T>(url: string | null, everyMs: number): { data: T | null; at: number | null; failed: boolean } {
  const visible = usePageVisible()
  const [state, setState] = useState<{ data: T | null; at: number | null; failed: boolean }>({ data: null, at: null, failed: false })
  useEffect(() => {
    if (!url || !visible) return
    let alive = true
    const run = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as T
        if (alive) setState({ data, at: Date.now(), failed: false })
      } catch {
        if (alive) setState((s) => ({ ...s, failed: true }))
      }
    }
    run()
    const t = setInterval(run, everyMs)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [url, visible, everyMs])
  return state
}

/** Seconds since `at`, ticking once a second. */
export function useAgo(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return at === null ? null : Math.max(0, Math.round((now - at) / 1000))
}

/* ------------------------------------------------------------- next bus */

export type NextBusCopy = Record<
  'next' | 'arriving' | 'min' | 'live' | 'scheduled' | 'late' | 'early' | 'onTime' | 'then' | 'none' | 'at',
  string
>

/**
 * "Next bus · 7 MIN · live, 13 min late · then 46 min". A live time is a bus
 * on the road with its delay folded in; a scheduled one is the timetable and
 * says so. Nothing due inside three hours renders the quiet "none" line.
 */
export function NextBus({
  stops,
  route,
  copy,
  tone = 'light',
}: {
  stops: number[]
  route: string
  copy: NextBusCopy
  tone?: 'light' | 'dark'
}) {
  const url = stops.length ? `/api/transit/arrivals?stops=${stops.join(',')}` : null
  const { data } = usePoll<{ arrivals: Arrival[] }>(url, 30_000)
  if (!url || !data) return null
  const list = data.arrivals.filter((a) => a.route === route)
  const muted = tone === 'dark' ? '#c9ced4' : '#4a4f55'

  if (!list.length) {
    return <div style={{ fontSize: 13, fontWeight: 600, color: muted }}>{copy.none}</div>
  }
  const [first, ...rest] = list
  const status = first.live
    ? first.delayMin >= 2
      ? fill(copy.late, { n: first.delayMin })
      : first.delayMin <= -2
        ? fill(copy.early, { n: -first.delayMin })
        : copy.onTime
    : copy.scheduled

  return (
    <div className={tr.reveal} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.4px' }}>{copy.next}</span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1 }}>
          {first.minutes <= 0 ? copy.arriving : fill(copy.min, { n: first.minutes })}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800 }}>
        {first.live ? (
          <>
            <span className={`${tr.dot} ${tr.dotLive}`} />
            <span>{copy.live}</span>
            <span style={{ color: muted }}>·</span>
          </>
        ) : null}
        <span style={{ color: first.live && first.delayMin >= 2 ? (tone === 'dark' ? 'var(--yellow)' : 'var(--magenta)') : undefined }}>
          {status}
        </span>
        {rest[0] ? <span style={{ color: muted, fontWeight: 600 }}>· {fill(copy.then, { n: rest[0].minutes })}</span> : null}
      </div>
      {/* Which pole: a stop is both sides of the street, and ETA's names say
          the direction ("W 29th St & W 5th Ave (EB)"). */}
      {first.stop ? (
        <div style={{ flexBasis: '100%', fontSize: 12, fontWeight: 600, color: muted }}>{fill(copy.at, { stop: first.stop })}</div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------- buses on the strip */

export type StripLiveCopy = Record<'many' | 'one' | 'none' | 'near' | 'late' | 'onTime' | 'updated' | 'marker' | 'offline', string>

/**
 * "3 buses on the Marlin right now", each a link to the stop it's at — and the
 * strip itself lights those stops up. The strip is server-rendered, so this
 * marks rows by attribute rather than re-rendering them: `data-bus` on the row
 * (or on the folded run that holds it), which transit.module.css draws.
 */
export function StripLive({ route, name, copy }: { route: string; name: string; copy: StripLiveCopy }) {
  const { data, failed } = usePoll<LiveSnapshot>('/api/transit/live', 15_000)
  // Age of the data itself, not of our last fetch: a frozen feed fetched a
  // second ago is still old.
  const ago = useAgo(data?.updatedAt ?? null)
  const marked = useRef<Element[]>([])
  const buses = (data?.vehicles ?? []).filter((v) => v.route === route)

  useEffect(() => {
    marked.current.forEach((el) => el.removeAttribute('data-bus'))
    marked.current = []
    for (const b of buses) {
      if (!b.stationId) continue
      const el = document.getElementById(`stop-${b.stationId}`)
      if (!el) continue
      // A stop folded away inside "more stops" marks the fold instead.
      const fold = el.closest('details')
      const target = fold && !fold.open ? (fold.closest('li') ?? el) : el
      target.setAttribute('data-bus', copy.marker)
      marked.current.push(target)
    }
  })

  if (!data) return null
  if (!data.ok || failed) {
    return <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600 }}>{copy.offline}</p>
  }
  return (
    <div
      className={tr.reveal}
      style={{ margin: '0 0 18px', border: '3px solid var(--ink)', background: 'var(--cream)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14 }}>
          <span className={`${tr.dot} ${buses.length ? tr.dotLive : ''}`} style={buses.length ? undefined : ({ '--dot': '#9aa1a8' } as React.CSSProperties)} />
          {buses.length === 0 ? fill(copy.none, { name }) : fill(buses.length === 1 ? copy.one : copy.many, { n: buses.length, name })}
        </span>
        {ago !== null ? <span style={{ fontSize: 11, fontWeight: 800, color: '#5b6168' }}>{fill(copy.updated, { s: ago })}</span> : null}
      </div>
      {buses.length ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {buses.map((b) => (
            <li key={b.id}>
              <a
                href={b.stationId ? `#stop-${b.stationId}` : undefined}
                className={tr.place}
                // Plain flowing text, not the card's flex row: on a phone the
                // delay should wrap with the sentence, not stack beside it.
                style={{ display: 'block', padding: '5px 9px 4px', fontSize: 12, fontWeight: 800, lineHeight: 1.35, boxShadow: '3px 3px 0 var(--ink)' }}
              >
                {fill(copy.near, { stop: b.next ?? '—' })}
                <span style={{ color: b.delayMin >= 2 ? 'var(--magenta)' : '#5b6168', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {b.delayMin >= 2 ? fill(copy.late, { n: b.delayMin }) : copy.onTime}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------- when to leave */

export type LeaveCopy = Record<
  | 'toward'
  | 'leaveIn'
  | 'leaveNow'
  | 'busAt'
  | 'tooClose'
  | 'nextOne'
  | 'live'
  | 'scheduled'
  | 'late'
  | 'early'
  | 'onTime'
  | 'none'
  | 'otherSide'
  | 'walkThere'
  | 'showBus'
  | 'checking',
  string
> & { places: Record<string, string> }

type Direction = { key: string; toward: Toward | null; list: Arrival[] }

/**
 * The answer a rider actually wants: "leave in 6 minutes". For each way the
 * line goes from this stop, the first bus they can still walk to in time —
 * its clock time, whether it's tracked live, how late — and, when the bus
 * that way stops on the other side of the street, a word about that.
 *
 * Leaving time is arrival minus the walk. A bus due sooner than the walk is
 * named too, so nobody wonders why the board says 3 and we say 44.
 */
export function LeaveTimes({
  route,
  stops,
  walk,
  nearestPole,
  poles,
  lang,
  copy,
  walkHref,
  onShowBus,
  onFirstLive,
}: {
  route: TransitRoute
  stops: number[]
  /** Minutes on foot to the nearest pole. */
  walk: number
  nearestPole: LatLng
  /** ETA stop number → where that pole stands and what it's called. */
  poles: Record<number, { at: LatLng; name: string }>
  lang: 'en' | 'es'
  copy: LeaveCopy
  walkHref: (to: LatLng) => string
  onShowBus?: (id: string) => void
  /** Told the first live bus a rider could catch, so the map can point at it. */
  onFirstLive?: (id: string | null) => void
}) {
  const url = stops.length ? `/api/transit/arrivals?stops=${stops.join(',')}` : null
  const { data, at: fetchedAt } = usePoll<{ arrivals: Arrival[] }>(url, 30_000)
  const list = (data?.arrivals ?? []).filter((a) => a.route === route.slug)

  const dirs: Direction[] = []
  for (const a of list) {
    const key = a.toward ?? 'any'
    let d = dirs.find((x) => x.key === key)
    if (!d) dirs.push((d = { key, toward: a.toward, list: [] }))
    d.list.push(a)
  }
  // The same order every refresh: toward the line's start, then its end.
  dirs.sort((a, b) => a.key.localeCompare(b.key) * -1)

  const firstLive = dirs.map((d) => d.list.find((a) => a.minutes >= walk)).find((a) => a?.live)?.vehicleId ?? null
  useEffect(() => {
    if (data) onFirstLive?.(firstLive)
  }, [data, firstLive, onFirstLive])

  if (!url) return null
  if (!data) {
    return (
      <p role="status" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
        {copy.checking}
      </p>
    )
  }
  if (!list.length) return <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{copy.none}</p>

  // Minutes are counted from when the server answered, so the clock is too.
  // "1:11 p. m." must not break across lines between its parts.
  const clock = (min: number) => formatClock(miamiClock(new Date((fetchedAt ?? 0) + min * 60_000)).min, lang).replace(/ /g, '\u00a0')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {dirs.map((d) => {
        const catchable = d.list.find((a) => a.minutes >= walk)
        const missed = d.list.find((a) => a.minutes < walk)
        const after = catchable ? d.list[d.list.indexOf(catchable) + 1] : undefined
        const show = catchable ?? d.list[0]
        const leave = catchable ? catchable.minutes - walk : null
        const pole = poles[show.stopId]
        const across = pole && meters(pole.at, nearestPole) > 20
        const status = show.live
          ? show.delayMin >= 2
            ? fill(copy.late, { n: show.delayMin })
            : show.delayMin <= -2
              ? fill(copy.early, { n: -show.delayMin })
              : copy.onTime
          : copy.scheduled
        return (
          <div key={d.key} className={tr.reveal} style={{ border: '3px solid var(--ink)', background: '#fff', padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.toward ? (
              <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                {fill(copy.toward, { place: towardName(route, d.toward, copy.places) })}
              </div>
            ) : null}
            <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(30px,8vw,36px)', lineHeight: 1, paddingTop: 2 }}>
              {leave === null ? fill(copy.busAt, { time: clock(show.minutes), n: show.minutes }) : leave <= 1 ? copy.leaveNow : fill(copy.leaveIn, { n: leave })}
            </div>
            {leave !== null ? (
              <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35 }}>{fill(copy.busAt, { time: clock(show.minutes), n: show.minutes })}</div>
            ) : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 15, fontWeight: 800 }}>
              {show.live ? <span className={`${tr.dot} ${tr.dotLive}`} /> : null}
              {show.live ? <span>{copy.live} ·</span> : null}
              <span style={{ color: show.live && show.delayMin >= 2 ? 'var(--magenta)' : undefined }}>{status}</span>
            </div>
            {missed && catchable && missed !== catchable ? (
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: '#3d4248' }}>{fill(copy.tooClose, { n: missed.minutes, walk })}</div>
            ) : null}
            {after ? <div style={{ fontSize: 15, fontWeight: 600, color: '#3d4248' }}>{fill(copy.nextOne, { time: clock(after.minutes) })}</div> : null}
            {across ? (
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
                {fill(copy.otherSide, { stop: pole.name })}{' '}
                <a href={walkHref(pole.at)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 800, textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                  {copy.walkThere}
                </a>
              </div>
            ) : null}
            {show.live && show.vehicleId && onShowBus ? (
              <button
                type="button"
                onClick={() => onShowBus(show.vehicleId!)}
                className={tr.btn}
                style={{ alignSelf: 'flex-start', marginTop: 4, minHeight: 44, font: 'inherit', fontWeight: 800, fontSize: 15, padding: '8px 12px', border: '3px solid var(--ink)', background: 'var(--cream)', color: 'var(--ink)', cursor: 'pointer' }}
              >
                {copy.showBus}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------- buses, said in words */

export type BusWordsCopy = Record<'sentence' | 'noToward' | 'late' | 'onTime', string> & { places: Record<string, string> }

/** "Flamingo bus, going toward City Hall. Next stop: W 49 St & W 12 Ave. 8 min late." */
export function busSentence(v: LiveVehicle, copy: BusWordsCopy): string {
  const route = TRANSIT.routes.find((r) => r.slug === v.route)
  const base = v.toward && route
    ? fill(copy.sentence, { name: route.name, place: towardName(route, v.toward, copy.places), stop: v.next ?? '—' })
    : fill(copy.noToward, { name: route?.name ?? '', stop: v.next ?? '—' })
  return `${base} ${v.delayMin >= 2 ? fill(copy.late, { n: v.delayMin }) : copy.onTime}`
}

export type BusesNowCopy = BusWordsCopy & Record<'heading' | 'none' | 'offline' | 'updated' | 'count' | 'one', string>

/**
 * Every bus on the road right now, one sentence each, grouped by line — the
 * map's buses for someone who'd rather read than squint at a map.
 */
export function BusesNow({ copy }: { copy: BusesNowCopy }) {
  const { data, failed } = usePoll<LiveSnapshot>('/api/transit/live', 15_000)
  const ago = useAgo(data?.updatedAt ?? null)
  if (!data) return null
  if (!data.ok || failed) return <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{copy.offline}</p>
  return (
    <div role="region" aria-label={copy.heading} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {TRANSIT.routes.map((r) => {
        const buses = data.vehicles.filter((v) => v.route === r.slug)
        return (
          <div key={r.slug} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16 }}>
              <span className={`${tr.dot} ${buses.length ? tr.dotLive : ''}`} style={buses.length ? undefined : ({ '--dot': '#9aa1a8' } as React.CSSProperties)} />
              {fill(buses.length === 0 ? copy.none : buses.length === 1 ? copy.one : copy.count, { n: buses.length, name: r.name })}
            </div>
            {buses.length ? (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {buses.map((b) => (
                  <li key={b.id} style={{ background: 'var(--cream)', border: '2px solid var(--ink)', borderLeft: `8px solid ${r.slug === 'flamingo' ? 'var(--pink)' : 'var(--cyan)'}`, padding: '8px 10px', fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
                    {busSentence(b, copy)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
      {ago !== null ? <div style={{ fontSize: 13, fontWeight: 700, color: '#3d4248' }}>{fill(copy.updated, { s: ago })}</div> : null}
    </div>
  )
}
