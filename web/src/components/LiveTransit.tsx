'use client'

import type * as React from 'react'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { Arrival, LiveSnapshot, LiveVehicle, Toward } from '../lib/live'
import { ROUTE_STYLE, TRANSIT, formatClock, meters, miamiClock, towardName, type LatLng, type TransitRoute } from '../lib/transit'
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

/**
 * GET `url` now and every `everyMs` while the page is visible. `null` until
 * the first answer — and again when `url` changes: an answer about one stop is
 * never shown as if it were about the next.
 */
export function usePoll<T>(url: string | null, everyMs: number): { data: T | null; at: number | null; failed: boolean } {
  const visible = usePageVisible()
  const [state, setState] = useState<{ url: string | null; data: T | null; at: number | null; failed: boolean }>({
    url: null,
    data: null,
    at: null,
    failed: false,
  })
  useEffect(() => {
    if (!url || !visible) return
    let alive = true
    const run = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as T
        if (alive) setState({ url, data, at: Date.now(), failed: false })
      } catch {
        if (alive) setState((s) => (s.url === url ? { ...s, failed: true } : { url, data: null, at: null, failed: true }))
      }
    }
    run()
    const t = setInterval(run, everyMs)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [url, visible, everyMs])
  return state.url === url ? state : { data: null, at: null, failed: false }
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
  const url = stops.length ? `/api/transit/arrivals?stops=${stops.join(',')}&route=${route}` : null
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

export type StripLiveCopy = Record<
  'many' | 'one' | 'none' | 'updated' | 'offline' | 'toward' | 'nextIn' | 'arriving' | 'late' | 'onTime' | 'bus',
  string
> & { places: Record<string, string> }

/** "Next stop: W 49 St & W 12 Ave · in ~3 min" — or "arriving" when it's there. */
function nextWords(v: LiveVehicle, copy: Pick<StripLiveCopy, 'nextIn' | 'arriving'>): string | null {
  if (!v.nextStop || v.nextInMin === null) return null
  return v.nextInMin <= 0 ? fill(copy.arriving, { stop: v.nextStop }) : fill(copy.nextIn, { stop: v.nextStop, n: v.nextInMin })
}

/**
 * Every bus on this line, drawn on the strip itself: a big dot on the rail
 * just before the stop it's heading to, an arrow for which way it's going
 * (down the list toward the line's end, up toward its start), and a card
 * with the next stop and how long until it gets there.
 *
 * The strip is server-rendered; RouteStrip leaves an empty slot above and
 * below each stop, and this fills them through portals.
 */
export function StripLive({ route, name, copy }: { route: string; name: string; copy: StripLiveCopy }) {
  const { data, failed } = usePoll<LiveSnapshot>('/api/transit/live', 15_000)
  // Age of the data itself, not of our last fetch: a frozen feed fetched a
  // second ago is still old.
  const ago = useAgo(data?.updatedAt ?? null)
  const buses = useMemo(() => (data?.ok ? data.vehicles : []).filter((v) => v.route === route), [data, route])
  const [slots, setSlots] = useState<{ el: Element; buses: LiveVehicle[] }[]>([])
  const line = TRANSIT.routes.find((r) => r.slug === route)

  useEffect(() => {
    const out = new Map<Element, LiveVehicle[]>()
    for (const b of buses) {
      if (!b.nextStationId) continue
      // Coming down the strip, it's drawn above its next stop; coming up, below.
      const way = b.toward === 'start' ? 'start' : 'end'
      const el = document.querySelector(`[data-bus-slot~="${CSS.escape(b.nextStationId)}"][data-way="${way}"]`)
      if (!el) continue
      out.set(el, [...(out.get(el) ?? []), b])
    }
    // The slots are server-rendered DOM, found only after the poll answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlots([...out].map(([el, list]) => ({ el, buses: list })))
  }, [buses])

  if (!data) return null
  if (!data.ok || failed) {
    return <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{copy.offline}</p>
  }
  return (
    <>
      <div
        className={tr.reveal}
        style={{ margin: '0 0 18px', border: '3px solid var(--ink)', background: 'var(--cream)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16 }}>
            <span className={`${tr.dot} ${buses.length ? tr.dotLive : ''}`} style={buses.length ? undefined : ({ '--dot': '#9aa1a8' } as React.CSSProperties)} />
            {buses.length === 0 ? fill(copy.none, { name }) : fill(buses.length === 1 ? copy.one : copy.many, { n: buses.length, name })}
          </span>
          {ago !== null ? <span style={{ fontSize: 13, fontWeight: 700, color: '#3d4248' }}>{fill(copy.updated, { s: ago })}</span> : null}
        </div>
        {buses.length ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {buses.map((b) => (
              <li key={b.id}>
                <a href={b.nextStationId ? `#stop-${b.nextStationId}` : undefined} className={tr.place} style={{ display: 'block', padding: '8px 10px 7px', fontSize: 15, fontWeight: 700, lineHeight: 1.4, boxShadow: '3px 3px 0 var(--ink)' }}>
                  <span aria-hidden="true" style={{ fontWeight: 800 }}>{b.toward === 'start' ? '▲ ' : '▼ '}</span>
                  {line && b.toward ? fill(copy.toward, { place: towardName(line, b.toward, copy.places) }) : null}
                  {nextWords(b, copy) ? <span style={{ display: 'block', fontWeight: 600 }}>{nextWords(b, copy)}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {slots.map(({ el, buses: here }) =>
        createPortal(
          here.map((b) => (
            <div key={b.id} className={tr.busBand} style={{ '--line': line ? ROUTE_STYLE[line.slug].color : 'var(--yellow)' } as React.CSSProperties}>
              <span className={tr.busDot} aria-hidden="true">
                {b.toward === 'start' ? '▲' : '▼'}
              </span>
              <div className={tr.busCard}>
                <strong style={{ display: 'block', fontSize: 15, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                  {copy.bus}
                  {line && b.toward ? ` · ${fill(copy.toward, { place: towardName(line, b.toward, copy.places) })}` : ''}
                </strong>
                {nextWords(b, copy) ? <span style={{ display: 'block' }}>{nextWords(b, copy)}</span> : null}
                <span style={{ display: 'block', color: b.delayMin >= 2 ? 'var(--magenta)' : '#3d4248', fontWeight: 800 }}>
                  {b.delayMin >= 2 ? fill(copy.late, { n: b.delayMin }) : copy.onTime}
                </span>
              </div>
            </div>
          )),
          el,
          // One portal per slot: its stations and which side of them.
          `${el.getAttribute('data-bus-slot')}:${el.getAttribute('data-way')}`,
        ),
      )}
    </>
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
  | 'checking'
  | 'oneSide'
  | 'untracked'
  | 'unavailable',
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
  oneSide,
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
  /** Buses stop on both sides of the street here, but only one side is in the city's tracker. */
  oneSide?: boolean
}) {
  const url = stops.length ? `/api/transit/arrivals?stops=${stops.join(',')}&route=${route.slug}` : null
  const { data, at: fetchedAt, failed } = usePoll<{ arrivals: Arrival[] }>(url, 30_000)
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

  // A stop the city's tracker doesn't list: say so, rather than show nothing.
  if (!url) return <p style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.45 }}>{copy.untracked}</p>
  // A failed refresh: old times would be wrong in a minute, so say so instead.
  if (failed) return <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.45 }}>{copy.unavailable}</p>
  if (!data) {
    return (
      <p role="status" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
        {copy.checking}
      </p>
    )
  }
  const sideNote = oneSide ? <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.45, color: '#3d4248' }}>{copy.oneSide}</p> : null
  if (!list.length) {
    return (
      <>
        <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{copy.none}</p>
        {sideNote}
      </>
    )
  }

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
      {sideNote}
    </div>
  )
}

/* ------------------------------------------------- buses, said in words */

export type BusWordsCopy = Record<'sentence' | 'noToward' | 'late' | 'onTime' | 'nextIn' | 'arriving', string> & { places: Record<string, string> }

/** "Flamingo bus, going toward City Hall. Next stop: W 49 St & W 12 Ave · in ~3 min. 8 min late." */
export function busSentence(v: LiveVehicle, copy: BusWordsCopy): string {
  const route = TRANSIT.routes.find((r) => r.slug === v.route)
  const stop = v.nextStop ?? v.next ?? '—'
  const base =
    v.toward && route
      ? fill(copy.sentence, { name: route.name, place: towardName(route, v.toward, copy.places) })
      : fill(copy.noToward, { name: route?.name ?? '' })
  const next = v.nextInMin === null ? '' : ` ${v.nextInMin <= 0 ? fill(copy.arriving, { stop }) : fill(copy.nextIn, { stop, n: v.nextInMin })}.`
  return `${base}${next} ${v.delayMin >= 2 ? fill(copy.late, { n: v.delayMin }) : copy.onTime}`
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
