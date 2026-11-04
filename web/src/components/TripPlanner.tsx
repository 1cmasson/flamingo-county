'use client'

import Link from 'next/link'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { mergeDepartures, type Departure } from '../lib/busTime'
import { routes } from '../lib/routes'
import { formatClock, meters, walkMinutes, type LatLng } from '../lib/transitMath'
import {
  planTrips,
  transitDirectionsHref,
  tripProgress,
  type Leg,
  type Network,
  type Plan,
  type Trip,
} from '../lib/tripPlan'
import { DIR_COLORS, type MapTrip } from './BusMap'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * "Where are you going?" on the full bus map: a search over the directory and
 * the county's addresses, then the trip there by one bus, worked out in the
 * browser (lib/tripPlan.ts) from where the visitor is. The location never
 * leaves the phone; only the typed text is searched on the server.
 */

export type Destination = { name: string; sub: string; at: LatLng; href: string | null }

/* ---------------------------------------------------------- the network */

let network: Promise<Network | null> | null = null
function loadNetwork(): Promise<Network | null> {
  network ??= fetch('/api/transit/network')
    .then((r) => (r.ok ? (r.json() as Promise<Network>) : null))
    .catch(() => {
      network = null
      return null
    })
  return network
}

/** The trip plan from `from` to `to`, once both are known and the routes have loaded. */
export function useTripPlan(from: LatLng | null, to: LatLng | null): Plan | null {
  const [net, setNet] = useState<Network | null>(null)
  useEffect(() => {
    if (!to) return
    let alive = true
    loadNetwork().then((n) => alive && setNet(n))
    return () => {
      alive = false
    }
  }, [to])
  // Planned from where the visitor was when they chose where to go, then kept: following them
  // as they walk mustn't re-plan the trip (and switch the bus) under their feet.
  const [anchor, setAnchor] = useState<{ from: LatLng; to: LatLng } | null>(null)
  if (to && from && anchor?.to !== to) setAnchor({ from, to })
  if (!to && anchor) setAnchor(null)
  return useMemo(
    () => (net && anchor ? planTrips(net, anchor.from, anchor.to) : null),
    [net, anchor],
  )
}

/* ------------------------------------------------------------- the search */

type Result = Destination & { kind: 'place' | 'osm' | 'address'; id: string }

export function TripSearch({
  lang,
  label,
  near = null,
  onPick,
  onCancel,
}: {
  lang: Lang
  /** What the field asks: where to, or (on the routes page) where from. */
  label?: string
  /** Where the visitor is, if known: places found by name are listed nearest first, with how far. */
  near?: LatLng | null
  onPick: (d: Destination) => void
  onCancel: () => void
}) {
  const c = busCopy(lang)
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<{ q: string; results: Result[] } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    const want = q.trim()
    if (want.length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/transit/where?${new URLSearchParams({ q: want, lang })}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((j: { results: Result[] }) => setAnswer({ q: want, results: j.results }))
        .catch(() => {})
    }, 250)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, lang])
  const want = q.trim()
  const found = answer && want.length >= 2 ? answer.results : []
  // "Publix", "farmacia": many of the same kind; with a location, the nearest come first.
  // Directory places keep the top (they're ours); addresses stay as typed.
  const results = near
    ? [
        ...found.filter((r) => r.kind === 'place'),
        ...found
          .filter((r) => r.kind === 'osm')
          .sort((a, z) => meters(near, a.at) - meters(near, z.at)),
        ...found.filter((r) => r.kind === 'address'),
      ]
    : found
  const away = (r: Result) => {
    if (!near) return null
    const km = meters(near, r.at) / 1000
    return km < 1 ? c.tripAwayM(Math.round((km * 1000) / 50) * 50) : c.tripAwayKm(km.toFixed(1))
  }
  const waiting = want.length >= 2 && answer?.q !== want

  return (
    <>
      <label className={b.sheetPick}>
        <span className={b.sheetKicker}>{label ?? c.tripWhere}</span>
        <input
          ref={input}
          className={b.select}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={c.tripPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {results.length ? (
        <ul className={b.tripResults}>
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className={b.tripResult} onClick={() => onPick(r)}>
                <span className={b.tripResultName}>{r.name}</span>
                <span className={b.tripResultSub}>
                  {[r.sub, away(r)].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : want.length >= 2 ? (
        <p className={s.note}>{waiting ? c.tripSearching : c.tripNoResults}</p>
      ) : null}
      {results.some((r) => r.kind === 'osm') ? (
        <p className={b.sheetHint}>
          {c.tripOsm}{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            © OpenStreetMap
          </a>
        </p>
      ) : null}
      <p className={b.sheetHint}>{c.tripPrivacy}</p>
      <div className={b.sheetActions}>
        <button type="button" className={`${s.action} ${s.actionAlt}`} onClick={onCancel}>
          {c.mapPlaceClose}
        </button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------- the trip */

type StopTimes = { live: { departures: { at: number }[] } | null; scheduled: Departure[] }

/** The next buses at one stop: live, then the schedule. Refreshed every 30 s; null until known. */
export function useStopNext(slug: string | null, dir: string, stop: string) {
  const key = slug ? `${slug}|${dir}|${stop}` : null
  const [state, setState] = useState<{ key: string; times: StopTimes } | null>(null)
  useEffect(() => {
    if (!slug || !key) return
    let alive = true
    const read = () => {
      if (document.visibilityState !== 'visible') return
      const q = new URLSearchParams({ route: slug, dir, stop })
      fetch(`/api/transit/county-arrivals?${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: StopTimes | null) => alive && j && setState({ key, times: j }))
        .catch(() => {})
    }
    read()
    const id = setInterval(read, 30_000)
    return () => {
      alive = false
      clearInterval(id)
    }
    // `key` stands for the route, direction and stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!state || state.key !== key) return null
  const { live, scheduled } = state.times
  return mergeDepartures(live ? live.departures.map((x) => x.at) : [], scheduled ?? [], new Date())
}

/* ------------------------------------------------- handing a trip to a map */

const TRIP_KEY = 'fc-bus-trip'
export type StashedTrip = {
  dest: Destination
  from: Destination | null
  /** Which of the trips there was chosen (tripKey), so the map shows that one. */
  key?: string
}

/** Leave a trip for the route map the visitor is about to open (this tab only, never a URL). */
export function stashTrip(t: StashedTrip) {
  try {
    sessionStorage.setItem(TRIP_KEY, JSON.stringify(t))
  } catch {}
}

/** The trip left for this map, once. */
export function takeStashedTrip(): StashedTrip | null {
  try {
    const raw = sessionStorage.getItem(TRIP_KEY)
    sessionStorage.removeItem(TRIP_KEY)
    return raw ? (JSON.parse(raw) as StashedTrip) : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ the steps */

/** "In 6 min, live" / "By the schedule: 10:32 PM" for the next bus at a stop. */
export function Soon({
  lang,
  next,
  short = false,
}: {
  lang: Lang
  next: ReturnType<typeof useStopNext>
  /** A list row: "en vivo · en 8 min" / "5:33 a. m." instead of a sentence. */
  short?: boolean
}) {
  const c = busCopy(lang)
  const soon = next?.[0] ?? null
  if (!next) return short ? <span className={b.nearSoft}>…</span> : null
  if (!soon) return <span>{short ? c.finderNoneToday : c.tripSoonNone}</span>
  const time = (at: number) =>
    at >= 1440 ? `${formatClock(at - 1440, lang)} ${c.tomorrow}` : formatClock(at, lang)
  if (short)
    return soon.live ? (
      <strong className={b.tripLive}>{c.finderLiveIn(c.inMin(soon.wait))}</strong>
    ) : soon.wait <= 60 ? (
      <span>{c.inMin(soon.wait)}</span>
    ) : (
      <span className={b.nearSoft}>{time(soon.at)}</span>
    )
  return soon.live ? (
    <strong className={b.tripLive}>{c.tripSoonLive(c.inMin(soon.wait))}</strong>
  ) : (
    <span>{c.tripSoonScheduled(time(soon.at), c.inMin(soon.wait))}</span>
  )
}

/** A trip as numbered steps, with its total and the next bus at the stop to board. */
export function TripSteps({
  lang,
  trip,
  destName,
  here = null,
}: {
  lang: Lang
  trip: Trip
  destName: string
  /** Where the visitor is now, when the page follows them: the steps keep up. */
  here?: LatLng | null
}) {
  const c = busCopy(lang)
  const second = trip.then ?? null
  const next = useStopNext(trip.slug, trip.dir, trip.board.id)
  const next2 = useStopNext(second ? second.slug : null, second?.dir ?? '', second?.board.id ?? '')
  const soon = next?.[0] ?? null
  const soonWait = soon && soon.wait <= 60 ? soon.wait : null
  const progress = here ? tripProgress(trip, here) : null
  // Still walking to the stop: the minutes count down as they go.
  const walkNow =
    here && !progress
      ? Math.min(trip.board.walk, walkMinutes(meters(here, trip.board.at)))
      : trip.board.walk
  // Steps already behind the visitor fade. One bus: walk, board, get off, walk (1–4). With a
  // change: walk, board, get off, change, board, get off, walk (1–7).
  const done = !progress
    ? 0
    : progress.leg === 1
      ? progress.kind === 'atStop'
        ? 1
        : 2
      : progress.kind === 'atStop'
        ? 4
        : 5
  const last = second ?? trip
  const banner = !progress
    ? null
    : progress.kind === 'atStop'
      ? progress.leg === 2 && second
        ? c.tripAtChange(c.tripRouteInline(second.number))
        : c.tripAtStop
      : progress.kind === 'riding'
        ? c.tripRiding(progress.left, (progress.leg === 2 && second ? second : trip).alight.name)
        : progress.leg === 1 && second
          ? c.tripGetOffChange(trip.alight.name, c.tripRouteInline(second.number))
          : c.tripGetOffNow(last.alight.name)
  return (
    <>
      {banner ? (
        <p className={b.tripNow} role="status">
          {banner}
        </p>
      ) : null}
      <p className={b.tripTotal}>
        {/* A wait past an hour is tomorrow's first bus, not part of the trip. */}
        {c.tripAbout(trip.total + (soonWait ?? 0))}{' '}
        <span className={b.tripTotalNote}>
          {second ? c.tripAboutChange : c.tripAboutNote(soonWait !== null)}
        </span>
      </p>
      <ol className={b.tripSteps}>
        <li data-done={done >= 1 || undefined}>{c.tripWalkTo(walkNow, trip.board.name)}</li>
        <li data-done={done >= 2 || undefined} className={b.stepTake}>
          <TakeLabel lang={lang} leg={trip} color={0} />
          <Soon lang={lang} next={next} />
        </li>
        <li data-done={done >= 3 || undefined}>
          {c.tripGetOff(trip.alight.name, trip.stops, trip.ride)}
        </li>
        {second ? (
          <>
            <li data-done={done >= 4 || undefined}>
              {trip.alight.id === second.board.id
                ? c.tripChangeSame(c.tripRouteInline(second.number))
                : c.tripChangeWalk(
                    second.board.walk,
                    second.board.name,
                    c.tripRouteInline(second.number),
                  )}
            </li>
            <li data-done={done >= 5 || undefined} className={b.stepTake}>
              <TakeLabel lang={lang} leg={second} color={1} />
              <Soon lang={lang} next={next2} />
            </li>
            <li>{c.tripGetOff(second.alight.name, second.stops, second.ride)}</li>
          </>
        ) : null}
        <li>{c.tripWalkFrom(last.alight.walk, destName)}</li>
      </ol>
    </>
  )
}

/**
 * "Take Route 37 toward South Miami Station", made easy to spot: the route's
 * badge in the colour its ride has on the map, and the direction in bold.
 */
function TakeLabel({ lang, leg, color }: { lang: Lang; leg: Leg; color: 0 | 1 }) {
  const c = busCopy(lang)
  return (
    <span className={b.takeLine}>
      <span
        className={b.takeBadge}
        style={
          {
            '--c': DIR_COLORS[color],
            '--fg': color === 0 ? '#fff6e5' : '#0c0f14',
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        {leg.number ?? 'T'}
      </span>
      <span className={b.takeText}>
        <span className={b.takeRoute}>{c.tripTakeRoute(c.tripRouteInline(leg.number))}</span>{' '}
        <span className={b.takeToward}>{c.tripTakeToward(leg.toward)}</span>
      </span>
    </span>
  )
}

/** What the map draws of a trip: the walks dotted, each bus in its own colour. */
export function mapTrip(trip: Trip, from: LatLng, dest: Destination, label: string): MapTrip {
  const second = trip.then ?? null
  const last = second ?? trip
  // At a stop or on a bus, the walk to the first stop is behind them.
  const along = tripProgress(trip, from) !== null
  const walks: LatLng[][] = []
  if (!along) walks.push([from, trip.board.at])
  if (second && trip.alight.id !== second.board.id) walks.push([trip.alight.at, second.board.at])
  walks.push([last.alight.at, dest.at])
  return {
    key: `${tripKey(trip)}|${dest.at.join(',')}`,
    walks,
    rides: [
      { path: trip.path, color: DIR_COLORS[0] },
      ...(second ? [{ path: second.path, color: DIR_COLORS[1] }] : []),
    ],
    stops: second
      ? [trip.board.at, trip.alight.at, second.board.at, second.alight.at]
      : [trip.board.at, trip.alight.at],
    dest: { at: dest.at, label },
  }
}

/** A trip's identity: its buses and stops. */
export function tripKey(t: Trip): string {
  const one = (l: Leg) => `${l.slug}|${l.dir}|${l.board.id}|${l.alight.id}`
  return t.then ? `${one(t)}>${one(t.then)}` : one(t)
}

/** "Ruta 37" or "Ruta 37 → 54", for a choice between trips. */
export function tripName(c: ReturnType<typeof busCopy>, t: Trip): string {
  return t.then
    ? `${c.tripRouteName(t.number)} → ${t.then.number ?? 'T'}`
    : c.tripRouteName(t.number)
}

export function TripPanel({
  lang,
  dest,
  plan,
  pick,
  onPick,
  needLocation,
  locating,
  onLocate,
  denied,
  pageSlug,
  from,
  here,
  onChange,
  onClose,
}: {
  lang: Lang
  dest: Destination
  plan: Plan | null
  pick: number
  onPick: (k: number) => void
  needLocation: boolean
  locating: boolean
  onLocate: () => void
  denied: boolean
  /** The route this map is for: a trip on another one links to that route's map. */
  pageSlug: string
  /** A start the visitor typed, when it isn't where they are. */
  from?: Destination | null
  /** Where the visitor is now (followed), for the steps' progress. */
  here?: LatLng | null
  onChange: () => void
  onClose: () => void
}) {
  const c = busCopy(lang)
  const trip = plan?.trips[pick] ?? null
  const google = transitDirectionsHref(dest.at)

  return (
    <>
      <p className={b.sheetKicker}>{c.tripTo}</p>
      <p className={b.sheetTitle}>{dest.name}</p>

      {needLocation ? (
        <>
          <p className={s.note}>{c.tripNeedLocation}</p>
          {denied ? <p className={s.notice}>{c.denied}</p> : null}
          <div className={b.sheetActions}>
            <button type="button" className={s.action} onClick={onLocate} disabled={locating}>
              {locating ? c.locating : c.tripUseLocation}
            </button>
          </div>
        </>
      ) : !plan ? (
        <p className={s.note}>{c.tripSearching}</p>
      ) : trip ? (
        <>
          {plan.trips.length > 1 ? (
            <div className={b.tripOptions} role="group">
              {plan.trips.map((t, k) => (
                <button
                  key={tripKey(t)}
                  type="button"
                  className={b.tripOption}
                  aria-pressed={k === pick}
                  onClick={() => onPick(k)}
                >
                  {c.tripOption(tripName(c, t), t.total)}
                </button>
              ))}
            </div>
          ) : null}
          <TripSteps lang={lang} trip={trip} destName={dest.name} here={from ? null : here} />
          {trip.slug !== pageSlug ? (
            <p className={b.meta}>
              <Link
                href={routes.busMap(lang, trip.slug)}
                onClick={() => stashTrip({ dest, from: from ?? null })}
              >
                {c.tripOtherMap(c.tripRouteName(trip.number))}
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <p className={s.note}>
          {plan.walkOnly !== null && plan.walkOnly <= 25
            ? c.tripJustWalk(plan.walkOnly)
            : c.tripNoBus}
        </p>
      )}

      <div className={b.sheetActions}>
        {dest.href ? (
          <Link className={s.action} href={dest.href}>
            {c.mapPlaceOpen}
          </Link>
        ) : null}
        <a
          className={`${s.action} ${s.actionAlt}`}
          href={google}
          target="_blank"
          rel="noopener noreferrer"
        >
          {c.tripGoogle}
        </a>
      </div>
      <div className={b.sheetActions}>
        <button type="button" className={b.textBtn} onClick={onChange}>
          {c.tripChange}
        </button>
        <button type="button" className={b.textBtn} onClick={onClose}>
          {c.mapPlaceClose}
        </button>
      </div>
    </>
  )
}
