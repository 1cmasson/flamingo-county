'use client'

import Link from 'next/link'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { mergeDepartures, type Departure, type Upcoming } from '../lib/busTime'
import { routes } from '../lib/routes'
import { formatClock, meters, miamiClock, walkMinutes, type LatLng } from '../lib/transitMath'
import {
  expandNetwork,
  planTrips,
  transitDirectionsHref,
  tripProgress,
  type Leg,
  type Network,
  type Plan,
  type Trip,
  type WireNetwork,
} from '../lib/tripPlan'
import { FareChip } from './FareChip'
import { DIR_COLORS, type MapTrip } from './BusMap'
import { ShareTrip, shareStart } from './TripShare'
import { tripBuses } from '../lib/tripLink'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * "Where are you going?" on the full bus map: a search over the directory and
 * the county's addresses, then the trip there with every route, worked out in the
 * browser (lib/tripPlan.ts) from where the visitor is. The location never
 * leaves the phone; only the typed text is searched on the server.
 */

export type Destination = { name: string; sub: string; at: LatLng; href: string | null }

/* ---------------------------------------------------------- the network */

/**
 * The network's shape on the wire. Browsers keep /api/transit/network for an
 * hour, so a change of shape gets a new address: a phone holding the old one
 * must not feed it to the new planner.
 */
const NETWORK_SHAPE = 2

let network: Promise<Network | null> | null = null
/** Every route, fetched once per page and shared by the planner and the hub. */
export function loadNetwork(): Promise<Network | null> {
  network ??= fetch(`/api/transit/network?v=${NETWORK_SHAPE}`)
    .then((r) => (r.ok ? (r.json() as Promise<WireNetwork>) : null))
    .then((w) => (w ? expandNetwork(w) : null))
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
  return useLegNext(slug ? { slug, live: 'county', feedDir: dir, board: { id: stop } } : null)
}

type LegLiveKey = Pick<Leg, 'slug' | 'live' | 'feedDir'> & { board: { id: string; eta?: number[] } }

/**
 * The next buses where a ride is boarded, from wherever its live times come
 * from: the county's feed (any of its routes; the schedule after it on the
 * routes the site keeps a timetable for), or the City of Hialeah's ETA SPOT
 * for the free lines. Null until known, or when the route has neither.
 */
export function useLegNext(leg: LegLiveKey | null) {
  const key = leg ? `${leg.slug}|${leg.feedDir}|${leg.board.id}` : null
  const [state, setState] = useState<{ key: string; next: Upcoming[] } | null>(null)
  useEffect(() => {
    if (!leg || !key || !leg.live) return
    let alive = true
    const read = () => {
      if (document.visibilityState !== 'visible') return
      if (leg.live === 'eta') {
        const stops = (leg.board.eta ?? []).join(',')
        if (!stops) return
        // Pattern "1" runs toward the end of the free line's strip, "0" toward its start.
        const way = leg.feedDir === '1' ? 'end' : 'start'
        fetch(`/api/transit/arrivals?${new URLSearchParams({ stops, route: leg.slug })}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((j: { arrivals: { minutes: number; live: boolean; toward: string | null }[] } | null) => {
            if (!alive || !j) return
            const { min } = miamiClock(new Date())
            const next = j.arrivals
              .filter((x) => !x.toward || x.toward === way)
              .slice(0, 3)
              .map((x) => ({ at: min + x.minutes, wait: x.minutes, live: x.live }))
            setState({ key, next })
          })
          .catch(() => {})
        return
      }
      const q = new URLSearchParams({ route: leg.slug, dir: leg.feedDir, stop: leg.board.id })
      fetch(`/api/transit/county-arrivals?${q}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: StopTimes | null) => {
          if (!alive || !j) return
          const { live, scheduled } = j
          setState({
            key,
            next: mergeDepartures(live ? live.departures.map((x) => x.at) : [], scheduled ?? [], new Date()),
          })
        })
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
  return state.next
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

/** What a ride's badge says: its number, or a short mark for the train, the Mover, a line. */
export function legBadge(leg: Pick<Leg, 'number' | 'kind' | 'name' | 'slug'>): string {
  if (leg.number) return leg.number
  if (leg.kind === 'rail') return 'MR'
  if (leg.kind === 'mover') return 'MM'
  if (leg.slug === 'flamingo' || leg.slug === 'marlin') return leg.slug[0].toUpperCase()
  return 'T'
}

/** The colours rides take on the map and in the steps, in order. */
const RIDE_COLORS = [...DIR_COLORS, '#ffd23f']
const RIDE_FG = ['#fff6e5', '#0c0f14', '#0c0f14']

/**
 * A trip as numbered steps: walk, then for each ride take it (with the next
 * one live and whether it's free) and get off, a change between rides, and
 * the walk to the door. With the visitor followed, the steps behind them fade.
 */
export function TripSteps({
  lang,
  trip,
  destName,
  here = null,
  startsAtStop = false,
}: {
  lang: Lang
  trip: Trip
  destName: string
  /** The trip starts at the stop itself (a shared trip): no walk to it. */
  startsAtStop?: boolean
  /** Where the visitor is now, when the page follows them: the steps keep up. */
  here?: LatLng | null
}) {
  const c = busCopy(lang)
  const legs = trip.legs
  const first = legs[0]
  const last = legs[legs.length - 1]
  const next = useLegNext(first)
  const soon = next?.[0] ?? null
  const soonWait = soon && soon.wait <= 60 ? soon.wait : null
  const progress = here ? tripProgress(trip, here) : null
  // Still walking to the stop: the minutes count down as they go.
  const walkNow =
    here && !progress
      ? Math.min(first.board.walk, walkMinutes(meters(here, first.board.at)))
      : first.board.walk
  // Step numbers: 1 is the walk, then each ride is take (2 + 3k) and get off (3 + 3k),
  // with the change before it (1 + 3k). Steps before where the visitor is fade.
  const done = !progress ? 0 : 1 + 3 * (progress.leg - 1) + (progress.kind === 'atStop' ? 0 : 1)
  const ride = progress ? legs[progress.leg - 1] : null
  const after = progress ? legs[progress.leg] : null
  const banner = !progress || !ride
    ? null
    : progress.kind === 'atStop'
      ? progress.leg > 1
        ? c.tripAtChange(c.tripRouteInline(ride))
        : c.tripAtStop
      : progress.kind === 'riding'
        ? c.tripRiding(progress.left, ride.alight.name)
        : after
          ? c.tripGetOffChange(ride.alight.name, c.tripRouteInline(after))
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
          {legs.length > 1 ? c.tripAboutChanges(legs.length - 1) : c.tripAboutNote(soonWait !== null)}
        </span>
      </p>
      <ol className={b.tripSteps}>
        <li data-done={done >= 1 || undefined}>
          {startsAtStop && !here
            ? c.tripStartAt(first.board.name)
            : c.tripWalkTo(walkNow, first.board.name)}
        </li>
        {legs.map((leg, k) => (
          <RideSteps key={`${leg.slug}|${leg.board.id}`} lang={lang} legs={legs} k={k} done={done} next={k === 0 ? next : undefined} />
        ))}
        <li>{c.tripWalkFrom(last.alight.walk, destName)}</li>
      </ol>
    </>
  )
}

/** One ride's steps: the change to it (after the first), take it, get off. */
function RideSteps({
  lang,
  legs,
  k,
  done,
  next,
}: {
  lang: Lang
  legs: Leg[]
  k: number
  done: number
  /** The first ride's next buses, already being read by the steps. */
  next?: ReturnType<typeof useLegNext>
}) {
  const c = busCopy(lang)
  const leg = legs[k]
  const prev = k > 0 ? legs[k - 1] : null
  const own = useLegNext(next === undefined ? leg : null)
  const times = next === undefined ? own : next
  const base = 3 * k
  return (
    <>
      {prev ? (
        <li data-done={done >= base + 1 || undefined}>
          {prev.alight.id === leg.board.id || leg.board.walk === 0
            ? c.tripChangeSame(c.tripRouteInline(leg))
            : c.tripChangeWalk(leg.board.walk, leg.board.name, c.tripRouteInline(leg))}
        </li>
      ) : null}
      <li data-done={done >= base + 2 || undefined} className={b.stepTake}>
        <TakeLabel lang={lang} leg={leg} color={k} />
        {times && times.length ? (
          <Soon lang={lang} next={times} />
        ) : leg.headway && (times !== null || !leg.live) ? (
          <span>{c.tripEvery(leg.headway)}</span>
        ) : (
          <Soon lang={lang} next={times} />
        )}
      </li>
      <li data-done={done >= base + 3 || undefined}>{c.tripGetOff(leg.alight.name, leg.stops, leg.ride)}</li>
    </>
  )
}

/**
 * "Take Route 37 toward South Miami Station", made easy to spot: the ride's
 * badge in the colour it has on the map, the direction in bold, and whether
 * it's free or a fare.
 */
function TakeLabel({ lang, leg, color }: { lang: Lang; leg: Leg; color: number }) {
  const c = busCopy(lang)
  return (
    <span className={b.takeLine}>
      <span
        className={b.takeBadge}
        style={
          {
            '--c': RIDE_COLORS[color % RIDE_COLORS.length],
            '--fg': RIDE_FG[color % RIDE_FG.length],
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        {legBadge(leg)}
      </span>
      <span className={b.takeText}>
        <span className={b.takeRoute}>
          {c.tripTakeRoute(c.tripRouteInline(leg))}{' '}
          {leg.fare ? (
            <FareChip free={leg.fare === 'free'} label={leg.fare === 'free' ? c.fareFree : c.farePaidShort} />
          ) : null}
        </span>
        <span className={b.takeToward}>
          <span aria-hidden="true">→</span> {c.tripTakeToward(leg.toward)}
        </span>
      </span>
    </span>
  )
}

/** What the map draws of a trip: the walks dotted, each ride in its own colour. */
export function mapTrip(trip: Trip, from: LatLng, dest: Destination, label: string): MapTrip {
  const legs = trip.legs
  const last = legs[legs.length - 1]
  // At a stop or on a bus, the walk to the first stop is behind them.
  const along = tripProgress(trip, from) !== null
  const walks: LatLng[][] = []
  if (!along) walks.push([from, legs[0].board.at])
  legs.slice(1).forEach((leg, k) => {
    if (legs[k].alight.id !== leg.board.id) walks.push([legs[k].alight.at, leg.board.at])
  })
  walks.push([last.alight.at, dest.at])
  return {
    key: `${tripKey(trip)}|${dest.at.join(',')}`,
    walks,
    rides: legs.map((leg, k) => ({
      path: leg.path,
      color: RIDE_COLORS[k % RIDE_COLORS.length],
      number: legBadge(leg),
      toward: leg.toward,
    })),
    stops: legs.flatMap((leg) => [leg.board.at, leg.alight.at]),
    dest: { at: dest.at, label },
  }
}

/**
 * The route map a trip opens on: the first of its rides the site keeps a map
 * for (the map plans the same trip and draws all of it). Null when none has one.
 */
export function tripMapSlug(t: Trip): string | null {
  return t.legs.find((l) => l.page === 'bus')?.slug ?? null
}

/** A trip's identity: its rides and stops. */
export function tripKey(t: Trip): string {
  return t.legs.map((l) => `${l.slug}|${l.dir}|${l.board.id}|${l.alight.id}`).join('>')
}

/** "Ruta 37", "Ruta 37 → 54" or "Flamingo → MR", for a choice between trips. */
export function tripName(c: ReturnType<typeof busCopy>, t: Trip): string {
  const [first, ...rest] = t.legs
  return [c.tripRouteName(first), ...rest.map(legBadge)].join(' → ')
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
          <TripSteps
            lang={lang}
            trip={trip}
            destName={dest.name}
            here={from ? null : here}
            startsAtStop={!!from && meters(from.at, trip.legs[0].board.at) < 40}
          />
          <div className={b.sheetActions}>
            <ShareTrip
              lang={lang}
              link={{
                from: shareStart(trip, from ? { name: from.name, at: from.at } : null),
                to: { name: dest.name, at: dest.at },
                buses: tripBuses(trip),
              }}
            />
          </div>
          {tripMapSlug(trip) && !trip.legs.some((l) => l.slug === pageSlug) ? (
            <p className={b.meta}>
              <Link
                href={routes.busMap(lang, tripMapSlug(trip)!)}
                onClick={() => stashTrip({ dest, from: from ?? null })}
              >
                {c.tripOtherMap(c.tripRouteName(trip.legs.find((l) => l.page === 'bus')!))}
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
