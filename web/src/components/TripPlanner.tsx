'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { mergeDepartures, type Departure } from '../lib/busTime'
import { routes } from '../lib/routes'
import { formatClock, type LatLng } from '../lib/transitMath'
import {
  planTrips,
  transitDirectionsHref,
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
  return useMemo(() => (net && from && to ? planTrips(net, from, to) : null), [net, from, to])
}

/* ------------------------------------------------------------- the search */

type Result = Destination & { kind: 'place' | 'address'; id: string }

export function TripSearch({
  lang,
  onPick,
  onCancel,
}: {
  lang: Lang
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
  const results = answer && want.length >= 2 ? answer.results : []
  const waiting = want.length >= 2 && answer?.q !== want

  return (
    <>
      <label className={b.sheetPick}>
        <span className={b.sheetKicker}>{c.tripWhere}</span>
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
                {r.sub ? <span className={b.tripResultSub}>{r.sub}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : want.length >= 2 ? (
        <p className={s.note}>{waiting ? c.tripSearching : c.tripNoResults}</p>
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

/** The next buses at the trip's boarding stop: live, then the schedule. Refreshed every 30 s. */
function useBoardTimes(trip: Trip | null) {
  const key = trip ? `${trip.slug}|${trip.dir}|${trip.board.id}` : null
  const [state, setState] = useState<{ key: string; times: StopTimes } | null>(null)
  useEffect(() => {
    if (!trip || !key) return
    let alive = true
    const read = () => {
      if (document.visibilityState !== 'visible') return
      const q = new URLSearchParams({ route: trip.slug, dir: trip.dir, stop: trip.board.id })
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
    // `key` stands for the trip's route, direction and stop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!state || state.key !== key) return null
  const { live, scheduled } = state.times
  return mergeDepartures(live ? live.departures.map((x) => x.at) : [], scheduled ?? [], new Date())
}

/** What the map draws of a trip. */
export function mapTrip(trip: Trip, from: LatLng, dest: Destination, label: string): MapTrip {
  return {
    key: `${trip.slug}|${trip.dir}|${trip.board.id}|${trip.alight.id}|${dest.at.join(',')}`,
    walks: [
      [from, trip.board.at],
      [trip.alight.at, dest.at],
    ],
    ride: trip.path,
    color: DIR_COLORS[Number(trip.dir)] ?? DIR_COLORS[0],
    stops: [trip.board.at, trip.alight.at],
    dest: { at: dest.at, label },
  }
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
  onChange: () => void
  onClose: () => void
}) {
  const c = busCopy(lang)
  const trip = plan?.trips[pick] ?? null
  const next = useBoardTimes(trip)
  const time = (at: number) =>
    at >= 1440 ? `${formatClock(at - 1440, lang)} ${c.tomorrow}` : formatClock(at, lang)
  const soon = next?.[0] ?? null
  const soonWait = soon && soon.wait <= 60 ? soon.wait : null
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
                  key={t.slug}
                  type="button"
                  className={b.tripOption}
                  aria-pressed={k === pick}
                  onClick={() => onPick(k)}
                >
                  {c.tripOption(c.tripRouteName(t.number), t.total)}
                </button>
              ))}
            </div>
          ) : null}
          <p className={b.tripTotal}>
            {/* A wait past an hour is tomorrow's first bus, not part of the trip. */}
            {c.tripAbout(trip.total + (soonWait ?? 0))}{' '}
            <span className={b.tripTotalNote}>{c.tripAboutNote(soonWait !== null)}</span>
          </p>
          <ol className={b.tripSteps}>
            <li>{c.tripWalkTo(trip.board.walk, trip.board.name)}</li>
            <li>
              {c.tripTake(c.tripRouteInline(trip.number), trip.toward)}{' '}
              {soon ? (
                soon.live ? (
                  <strong className={b.tripLive}>{c.tripSoonLive(c.inMin(soon.wait))}</strong>
                ) : (
                  <span>{c.tripSoonScheduled(time(soon.at), c.inMin(soon.wait))}</span>
                )
              ) : next ? (
                <span>{c.tripSoonNone}</span>
              ) : null}
            </li>
            <li>{c.tripGetOff(trip.alight.name, trip.stops, trip.ride)}</li>
            <li>{c.tripWalkFrom(trip.alight.walk, dest.name)}</li>
          </ol>
          {trip.slug !== pageSlug ? (
            <p className={b.meta}>
              <Link href={routes.busMap(lang, trip.slug)}>
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
