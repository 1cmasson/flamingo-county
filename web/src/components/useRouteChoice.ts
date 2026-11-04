'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  mergeDepartures,
  nearestStation,
  nextDepartures,
  type RouteTimes,
  type Upcoming,
} from '../lib/busTime'
import { meters, walkMinutes, type LatLng } from '../lib/transitMath'

/**
 * "Which stop, which way, and when's the next bus" for one county route, shared
 * by the route page's «Próxima guagua» card (NextBus.tsx) and the full map
 * (BusMapScreen.tsx). The choice is remembered per route in this browser, so a
 * stop picked on the map is the one the card shows back on the route page.
 *
 * Live: on a Metrobus route it asks our server for Swiftly's predictions at
 * the chosen stop (api/transit/county-arrivals) every half minute while the
 * tab is in view. Live buses come first; the schedule fills in after them, and
 * stands alone when there's no live data.
 *
 * Privacy: a GPS position never leaves the browser. It picks a stop and, on
 * the map, draws a "you" pin.
 *
 * Following: with `watch` (the full map), after the first fix the phone keeps
 * sending positions (watchPosition) and the pin, the walk and its minutes move
 * with the visitor. The chosen stop doesn't jump as they walk; when another
 * stop is clearly nearer, it's offered (`closer`). Watching stops while the
 * tab is hidden or the phone is locked, and resumes when it's back.
 */

/** A walk the page states as "N min from you"; a stop further than this gets no line or minutes. */
export const WALK_SHOWN_M = 2000
/** Offer a nearer stop only when it saves at least this much walking. */
const CLOSER_BY_M = 150

const STORE = 'fc-bus-stop'
/** Session key: the route page opened this map, so the map's back button is the browser's back. */
export const MAP_FROM = 'fc-bus-map-from'
const TICK_MS = 30_000
const POLL_MS = 30_000

type Live = { asOf: number; departures: { at: number }[]; canceled: number } | null
type LiveState = { key: string; live: Live }

/** Live predictions for one stop, refreshed while the page is in view. Null until the first answer. */
function useLive(enabled: boolean, slug: string, dir: string, stop: string): LiveState | null {
  const key = `${slug}|${dir}|${stop}`
  const [state, setState] = useState<LiveState | null>(null)
  useEffect(() => {
    if (!enabled || !stop) return
    let ctrl: AbortController | null = null
    const read = () => {
      if (document.visibilityState !== 'visible') return
      ctrl?.abort()
      ctrl = new AbortController()
      const q = new URLSearchParams({ route: slug, dir, stop })
      fetch(`/api/transit/county-arrivals?${q}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { live: null }))
        .then((j: { live: Live }) => setState({ key, live: j.live ?? null }))
        .catch((e: unknown) => {
          if ((e as Error)?.name !== 'AbortError') setState({ key, live: null })
        })
    }
    read()
    const id = setInterval(read, POLL_MS)
    document.addEventListener('visibilitychange', read)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', read)
      ctrl?.abort()
    }
  }, [enabled, slug, dir, stop, key])
  return state?.key === key ? state : null
}

const noop = () => () => {}
/** A number that changes every half minute, so the waits count down; 0 on the server. */
const subscribeTick = (cb: () => void) => {
  const id = setInterval(cb, TICK_MS)
  return () => clearInterval(id)
}
const tick = () => Math.floor(Date.now() / TICK_MS)

export type Saved = { dir: number; stops: number[] }

/** The stop remembered for a route, or null when this browser hasn't picked one. */
function stored(slug: string, dirs: number): Saved | null {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Saved>
    const saved = all[slug]
    return saved && saved.stops?.length === dirs ? saved : null
  } catch {
    return null
  }
}

function save(slug: string, v: Saved) {
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Saved>
    localStorage.setItem(STORE, JSON.stringify({ ...all, [slug]: v }))
  } catch {
    // Private windows and blocked storage: the choice just isn't remembered.
  }
}

export type RouteChoice = {
  /** False on the server and before hydration: nothing below is the visitor's yet. */
  ready: boolean
  /** The visitor has picked a stop on this route, now or on an earlier visit. */
  saved: boolean
  state: Saved
  d: RouteTimes['directions'][number]
  i: number
  station: RouteTimes['directions'][number]['stations'][number]
  endOfLine: boolean
  next: Upcoming[]
  anyLive: boolean
  /** Minutes on foot from the visitor to the chosen stop, when it's a walk. */
  walk: number | null
  /** Where the visitor is, once they asked to find the stop near them. */
  origin: LatLng | null
  /** How sure the phone is of `origin`, metres (the radius it could be off by). */
  accuracy: number | null
  /** A stop of this direction clearly nearer the visitor than the chosen one, to offer. */
  closer: { index: number; name: string; walk: number } | null
  locating: boolean
  denied: boolean
  setDir: (dir: number) => void
  pickStop: (dir: number, stop: number) => void
  locate: () => void
}

export function useRouteChoice(
  slug: string,
  times: RouteTimes,
  opts: { live: boolean; schedule: boolean; watch?: boolean },
): RouteChoice {
  const now = useSyncExternalStore(subscribeTick, tick, () => 0)
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
  const [picked, setPicked] = useState<Saved | null>(null)
  const [origin, setOrigin] = useState<LatLng | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)

  const ready = mounted && !!now
  const n = times.directions.length
  const remembered = ready && !picked ? stored(slug, n) : null
  const state = picked ?? remembered ?? { dir: 0, stops: Array(n).fill(0) }
  const saved = picked !== null || remembered !== null
  const d = times.directions[state.dir] ?? times.directions[0]
  const i = Math.min(state.stops[state.dir] ?? 0, d.stations.length - 1)
  const station = d.stations[i]
  const endOfLine = i === d.stations.length - 1
  const live = useLive(opts.live && ready, slug, d.id, station.id)?.live ?? null

  const at = new Date((now || 0) * TICK_MS)
  const scheduled = ready && !endOfLine && opts.schedule ? nextDepartures(times, d, i, at, 6) : []
  const next =
    ready && !endOfLine
      ? mergeDepartures(live ? live.departures.map((x) => x.at) : [], scheduled, at)
      : []

  const toStop = origin ? meters(origin, station.at) : null
  const walk = toStop !== null && toStop <= WALK_SHOWN_M ? walkMinutes(toStop) : null
  let closer: RouteChoice['closer'] = null
  if (origin && toStop !== null && !endOfLine) {
    const near = nearestStation(d, origin)
    if (
      near.index !== i &&
      near.index < d.stations.length - 1 &&
      toStop - near.meters >= CLOSER_BY_M
    )
      closer = {
        index: near.index,
        name: d.stations[near.index].name,
        walk: walkMinutes(near.meters),
      }
  }

  const choose = (v: Saved) => {
    setPicked(v)
    save(slug, v)
  }
  const setDir = (dir: number) => choose({ ...state, dir })
  const pickStop = (dir: number, stop: number) => {
    const stops = [...state.stops]
    stops[dir] = stop
    choose({ dir, stops })
  }
  /* ---- following the visitor ---- */
  const watchId = useRef<number | null>(null)
  const following = useRef(false)
  const stopWatch = () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }
  const startWatch = () => {
    if (!opts.watch || watchId.current !== null || !navigator.geolocation) return
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setOrigin([pos.coords.latitude, pos.coords.longitude])
        setAccuracy(pos.coords.accuracy ?? null)
      },
      // A lost signal keeps the last position on the map; the next fix moves it.
      () => {},
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    )
  }
  const watchFns = useRef({ startWatch, stopWatch })
  useEffect(() => {
    watchFns.current = { startWatch, stopWatch }
  })
  // Hidden tab or locked phone: stop asking for positions (battery); back in view: resume.
  useEffect(() => {
    const onVis = () => {
      if (!following.current) return
      if (document.visibilityState === 'visible') watchFns.current.startWatch()
      else watchFns.current.stopWatch()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      watchFns.current.stopWatch()
    }
  }, [])

  const locate = () => {
    if (!navigator.geolocation) return setDenied(true)
    setLocating(true)
    setDenied(false)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const here: LatLng = [pos.coords.latitude, pos.coords.longitude]
        setOrigin(here)
        setAccuracy(pos.coords.accuracy ?? null)
        const near = times.directions.map((dir) => nearestStation(dir, here))
        choose({ dir: state.dir, stops: near.map((x) => x.index) })
        following.current = true
        startWatch()
      },
      () => {
        setLocating(false)
        setDenied(true)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  return {
    ready,
    saved,
    state,
    d,
    i,
    station,
    endOfLine,
    next,
    anyLive: next.some((x) => x.live),
    walk,
    origin,
    accuracy,
    closer,
    locating,
    denied,
    setDir,
    pickStop,
    locate,
  }
}
