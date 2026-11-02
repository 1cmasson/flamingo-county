'use client'

import { useState, useSyncExternalStore } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { nearestStation, nextDepartures, stopMapsHref, type RouteTimes } from '../lib/busTime'
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
 * Privacy: a GPS position never leaves the browser. It picks a stop and is
 * forgotten.
 */

const STORE = 'fc-bus-stop'
const TICK_MS = 30_000

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

export function NextBus({ slug, times, lang }: { slug: string; times: RouteTimes; lang: Lang }) {
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
  const next = endOfLine ? [] : nextDepartures(times, d, i, new Date(now * TICK_MS))
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
              <span className={b.nextTime}>{time(next[0].at)}</span>
              <span className={b.nextWait}>{c.inMin(next[0].wait)}</span>
            </p>
            {next.length > 1 ? (
              <p className={b.nextThen}>
                {c.thenAt}{' '}
                {next
                  .slice(1)
                  .map((x) => `${time(x.at)} (${c.inMin(x.wait)})`)
                  .join(' · ')}
              </p>
            ) : null}
          </>
        ) : (
          <p className={s.note}>{c.noMore}</p>
        )}
      </div>

      <p className={s.note}>{c.scheduled}</p>
      <p className={b.meta}>
        <a href={stopMapsHref(station.at)} target="_blank" rel="noopener noreferrer">
          {c.mapsStop}
        </a>{' '}
        · {c.privacy}
      </p>
    </section>
  )
}
