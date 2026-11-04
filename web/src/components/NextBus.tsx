'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import {
  mergeDepartures,
  nearestStation,
  nextDepartures,
  stopMapsHref,
  type RouteTimes,
} from '../lib/busTime'
import { formatClock, walkMinutes } from '../lib/transitMath'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * "When's the next bus at my stop?" on a county route page: a stop picker per
 * direction, a button that picks the stop nearest the visitor, and the next
 * three buses from the county's schedule (lib/busTime.ts).
 *
 * Shown only in the browser: the page is cached, so a time worked out on the
 * server would be stale by the time anyone read it. The stop lists below it
 * stay server-rendered for crawlers.
 *
 * Live: on a Metrobus route the card asks our server for Swiftly's live
 * predictions at the chosen stop (api/transit/county-arrivals) every half
 * minute while the tab is in view. Live buses come first, marked so; the
 * schedule fills in after them, and stands alone when there's no live data.
 *
 * Privacy: a GPS position never leaves the browser. It picks a stop and is
 * forgotten. The live request carries only the route, direction and stop.
 */

const STORE = 'fc-bus-stop'
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

type Saved = { dir: number; stops: number[] }

function load(slug: string, dirs: number): Saved {
  const blank = { dir: 0, stops: Array(dirs).fill(0) }
  try {
    const all = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, Saved>
    const saved = all[slug]
    return saved && saved.stops?.length === dirs ? saved : blank
  } catch {
    return blank
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

/** Past this, the "nearest stop" is a trip of its own, and the picker says how far. */
const NEAR_WALK_MIN = 15

export function NextBus({
  slug,
  times,
  lang,
  live: liveOn = false,
}: {
  slug: string
  times: RouteTimes
  lang: Lang
  /** Ask for Swiftly's live predictions: Metrobus routes only (the city's trolley isn't in the feed). */
  live?: boolean
}) {
  const c = busCopy(lang)
  const now = useSyncExternalStore(subscribeTick, tick, () => 0)
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
  const [picked, setPicked] = useState<Saved | null>(null)
  const [walk, setWalk] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)
  // Hooks before the early return: which stop the live request is for.
  const pre = mounted && now ? (picked ?? load(slug, times.directions.length)) : null
  const preDir = pre ? (times.directions[pre.dir] ?? times.directions[0]) : null
  const preStop =
    pre && preDir
      ? preDir.stations[Math.min(pre.stops[pre.dir] ?? 0, preDir.stations.length - 1)]
      : null
  const liveState = useLive(liveOn && !!preStop, slug, preDir?.id ?? '', preStop?.id ?? '')

  // On the server and before hydration: the card's frame, so the page doesn't jump when it fills.
  if (!mounted || !now)
    return (
      <section className={s.card} aria-labelledby="next-bus">
        <h2 id="next-bus" className={s.cardTag}>
          {c.nextTitle}
        </h2>
        <p className={s.note}>{c.nextLead}</p>
        <div className={b.nextShell} />
      </section>
    )
  const state = picked ?? load(slug, times.directions.length)
  const choose = (v: Saved, walkMin: number | null = null) => {
    setPicked(v)
    setWalk(walkMin)
    save(slug, v)
  }

  const d = times.directions[state.dir] ?? times.directions[0]
  const i = Math.min(state.stops[state.dir] ?? 0, d.stations.length - 1)
  const station = d.stations[i]
  const endOfLine = i === d.stations.length - 1
  const at = new Date(now * TICK_MS)
  const live = liveState?.live ?? null
  const scheduled = endOfLine ? [] : nextDepartures(times, d, i, at, 6)
  const next = endOfLine
    ? []
    : mergeDepartures(live ? live.departures.map((x) => x.at) : [], scheduled, at)
  const anyLive = next.some((x) => x.live)
  const time = (at: number) =>
    at >= 1440 ? `${formatClock(at - 1440, lang)} ${c.tomorrow}` : formatClock(at, lang)

  const locate = () => {
    if (!navigator.geolocation) return setDenied(true)
    setLocating(true)
    setDenied(false)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const at: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        const near = times.directions.map((dir) => nearestStation(dir, at))
        choose(
          { dir: state.dir, stops: near.map((n) => n.index) },
          walkMinutes(near[state.dir].meters),
        )
      },
      () => {
        setLocating(false)
        setDenied(true)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  return (
    <section className={s.card} aria-labelledby="next-bus">
      <h2 id="next-bus" className={s.cardTag}>
        {c.nextTitle}
      </h2>
      <p className={s.note}>{c.nextLead}</p>

      <div className={b.dirs} role="group" aria-label={c.direction}>
        {times.directions.map((dir, k) => (
          <button
            key={dir.id}
            type="button"
            className={b.dirBtn}
            aria-pressed={k === state.dir}
            onClick={() => choose({ ...state, dir: k }, null)}
          >
            {c.toward(dir.toward)}
          </button>
        ))}
      </div>

      <label className={b.pick}>
        <span className={b.pickLabel}>{c.yourStop}</span>
        <select
          className={b.select}
          value={i}
          onChange={(e) => {
            const stops = [...state.stops]
            stops[state.dir] = Number(e.target.value)
            choose({ ...state, stops }, null)
          }}
        >
          {d.stations.map((st, k) => (
            <option key={`${k}-${st.name}`} value={k}>
              {st.name}
            </option>
          ))}
        </select>
      </label>

      <div className={s.actions}>
        <button type="button" className={s.action} onClick={locate} disabled={locating}>
          {locating ? c.locating : c.useLocation}
        </button>
      </div>
      {denied ? <p className={s.notice}>{c.denied}</p> : null}
      {walk !== null ? (
        <p className={s.note}>{walk > NEAR_WALK_MIN ? c.farFromYou(walk) : c.walkToStop(walk)}</p>
      ) : null}

      <div className={b.next} aria-live="polite">
        {endOfLine ? (
          <p className={s.note}>{c.endOfLine}</p>
        ) : next.length ? (
          <>
            <p className={b.nextFirst}>
              {next[0].live ? <span className={b.liveTag}>{c.liveTag}</span> : null}
              <span className={b.nextTime}>{time(next[0].at)}</span>
              <span className={b.nextWait}>{c.inMin(next[0].wait)}</span>
            </p>
            {next.length > 1 ? (
              <p className={b.nextThen}>
                {c.thenAt}{' '}
                {next
                  .slice(1)
                  .map(
                    (x) =>
                      `${time(x.at)} (${c.inMin(x.wait)}${anyLive ? `, ${x.live ? c.liveTag.toLowerCase() : c.scheduledTag}` : ''})`,
                  )
                  .join(' · ')}
              </p>
            ) : null}
          </>
        ) : (
          <p className={s.note}>{c.noMore}</p>
        )}
      </div>

      <p className={s.note}>{anyLive ? c.liveSource : c.scheduled}</p>
      <p className={b.meta}>
        <a href={stopMapsHref(station.at)} target="_blank" rel="noopener noreferrer">
          {c.mapsStop}
        </a>{' '}
        · {c.privacy}
      </p>
    </section>
  )
}
