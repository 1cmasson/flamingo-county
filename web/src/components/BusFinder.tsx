'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { routes } from '../lib/routes'
import { walkMinutes, meters, type LatLng } from '../lib/transitMath'
import {
  nearbyRoutes,
  planTrips,
  transitDirectionsHref,
  type Network,
  type NearbyRoute,
  type Trip,
} from '../lib/tripPlan'
import {
  Soon,
  TripSearch,
  TripSteps,
  stashTrip,
  useStopNext,
  type Destination,
} from './TripPlanner'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * «¿Qué guagua cojo?» at the top of the routes hub (/[lang]/bus): from where
 * the visitor is (or an address they type), the routes they can walk to, and
 * with a destination, the trips there by one bus. Each answer opens the
 * route's map, the trip already drawn.
 *
 * Everything is worked out in the browser over /api/transit/network; the
 * visitor's location never leaves the phone. Only typed searches go to the
 * server (/api/transit/where), as on the map.
 */

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

const STOP_STORE = 'fc-bus-stop'

/** Open a route at the stop nearest the visitor: the route page and its map remember it. */
function rememberStop(route: NearbyRoute, net: Network) {
  const r = net.routes.find((x) => x.slug === route.slug)
  if (!r) return
  const stops = r.directions.map((d) => route.dirs.find((x) => x.dir === d.id)?.index ?? 0)
  const dir = Math.max(
    0,
    r.directions.findIndex((d) => d.id === route.dirs[0]?.dir),
  )
  try {
    const all = JSON.parse(localStorage.getItem(STOP_STORE) ?? '{}') as Record<string, unknown>
    localStorage.setItem(STOP_STORE, JSON.stringify({ ...all, [route.slug]: { dir, stops } }))
  } catch {}
}

export function BusFinder({ lang }: { lang: Lang }) {
  const c = busCopy(lang)
  const [net, setNet] = useState<Network | null>(null)
  const [here, setHere] = useState<LatLng | null>(null)
  const [typedFrom, setTypedFrom] = useState<Destination | null>(null)
  const [dest, setDest] = useState<Destination | null>(null)
  const [searching, setSearching] = useState<'from' | 'to' | null>(null)
  const [locating, setLocating] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    let alive = true
    loadNetwork().then((n) => alive && setNet(n))
    return () => {
      alive = false
    }
  }, [])

  const locate = () => {
    if (!navigator.geolocation) return setDenied(true)
    setLocating(true)
    setDenied(false)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setTypedFrom(null)
        setHere([pos.coords.latitude, pos.coords.longitude])
      },
      () => {
        setLocating(false)
        setDenied(true)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  // Location already allowed for the site: answer straight away, no button.
  useEffect(() => {
    let alive = true
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => {
        if (!alive || p.state !== 'granted') return
        navigator.geolocation.getCurrentPosition(
          (pos) => alive && setHere([pos.coords.latitude, pos.coords.longitude]),
          () => {},
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
        )
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const from = typedFrom?.at ?? here
  const near = useMemo(
    () => (net && from ? nearbyRoutes(net, from).slice(0, 6) : null),
    [net, from],
  )
  const plan = useMemo(
    () => (net && from && dest ? planTrips(net, from, dest.at) : null),
    [net, from, dest],
  )

  return (
    <section className={s.card} aria-labelledby="bus-finder">
      <h2 id="bus-finder" className={s.cardTag}>
        {c.finderTitle}
      </h2>
      <p className={s.note}>{c.finderLead}</p>

      {searching ? (
        <div className={b.finderSearch}>
          <TripSearch
            lang={lang}
            label={searching === 'from' ? c.finderFromSearch : c.tripWhere}
            onPick={(d) => {
              if (searching === 'from') setTypedFrom(d)
              else setDest(d)
              setSearching(null)
            }}
            onCancel={() => setSearching(null)}
          />
        </div>
      ) : (
        <div className={b.finderFields}>
          <div className={b.finderField}>
            <span className={b.sheetKicker}>{c.finderFrom}</span>
            {typedFrom ? (
              <button type="button" className={b.finderValue} onClick={() => setSearching('from')}>
                {typedFrom.name}
              </button>
            ) : here ? (
              <button type="button" className={b.finderValue} onClick={() => setSearching('from')}>
                ◎ {c.finderMyLocation}
              </button>
            ) : (
              <div className={b.sheetActions}>
                <button type="button" className={s.action} onClick={locate} disabled={locating}>
                  ◎ {locating ? c.locating : c.tripUseLocation}
                </button>
                <button type="button" className={b.textBtn} onClick={() => setSearching('from')}>
                  {c.finderTypeFrom}
                </button>
              </div>
            )}
            {typedFrom ? (
              <button type="button" className={b.textBtn} onClick={locate} disabled={locating}>
                ◎ {locating ? c.locating : c.finderUseMine}
              </button>
            ) : null}
          </div>
          <div className={b.finderField}>
            <span className={b.sheetKicker}>{c.finderTo}</span>
            <button type="button" className={b.whereBtn} onClick={() => setSearching('to')}>
              <span aria-hidden="true">⌕</span> {dest ? dest.name : c.tripWhere}
            </button>
            {dest ? (
              <button type="button" className={b.textBtn} onClick={() => setDest(null)}>
                {c.finderClearDest}
              </button>
            ) : null}
          </div>
          {denied ? <p className={s.notice}>{c.finderDenied}</p> : null}
        </div>
      )}

      {searching || !from ? null : !net ? (
        <p className={s.note}>{c.tripSearching}</p>
      ) : dest && plan ? (
        <FinderTrips lang={lang} plan={plan} dest={dest} from={typedFrom} />
      ) : near ? (
        <NearList lang={lang} near={near} net={net} from={from} />
      ) : null}
    </section>
  )
}

function NearList({
  lang,
  near,
  net,
  from,
}: {
  lang: Lang
  near: NearbyRoute[]
  net: Network
  from: LatLng
}) {
  const c = busCopy(lang)
  if (!near.length) {
    // The nearest stop of any route, so "none in a walk" says how far it is.
    let far = Infinity
    for (const r of net.routes)
      for (const d of r.directions)
        for (const st of d.stations) far = Math.min(far, meters(from, st.at))
    return <p className={s.note}>{c.finderNoneNear(walkMinutes(far))}</p>
  }
  return (
    <>
      <h3 className={b.finderHeading}>{c.finderNearTitle}</h3>
      <ul className={b.finderList}>
        {near.map((r) => (
          <li key={r.slug}>
            <NearRow lang={lang} route={r} net={net} />
          </li>
        ))}
      </ul>
    </>
  )
}

function NearRow({ lang, route, net }: { lang: Lang; route: NearbyRoute; net: Network }) {
  const c = busCopy(lang)
  const first = route.dirs[0]
  const second = route.dirs[1]
  const nextA = useStopNext(route.slug, first.dir, first.id)
  const nextB = useStopNext(second ? route.slug : null, second?.dir ?? '', second?.id ?? '')
  return (
    <Link
      href={routes.busMap(lang, route.slug)}
      className={b.finderRow}
      onClick={() => rememberStop(route, net)}
    >
      <span className={b.finderBullet} aria-hidden="true">
        {route.number ?? 'T'}
      </span>
      <span className={b.finderRowBody}>
        <span className={b.finderRowName}>
          {c.tripRouteName(route.number)} · {c.finderWalk(route.walk)}
        </span>
        <span className={b.finderRowLine}>
          {c.finderToward(first.toward)} <Soon lang={lang} next={nextA} />
        </span>
        {second ? (
          <span className={b.finderRowLine}>
            {c.finderToward(second.toward)} <Soon lang={lang} next={nextB} />
          </span>
        ) : null}
        <span className={b.finderRowStop}>{c.finderAtStop(first.name)}</span>
      </span>
      <span className={b.finderGo} aria-hidden="true">
        →
      </span>
    </Link>
  )
}

function FinderTrips({
  lang,
  plan,
  dest,
  from,
}: {
  lang: Lang
  plan: NonNullable<ReturnType<typeof planTrips>>
  dest: Destination
  from: Destination | null
}) {
  const c = busCopy(lang)
  if (!plan.trips.length)
    return (
      <>
        <p className={s.note}>
          {plan.walkOnly !== null && plan.walkOnly <= 25
            ? c.tripJustWalk(plan.walkOnly)
            : c.tripNoBus}
        </p>
        <div className={b.sheetActions}>
          <a
            className={`${s.action} ${s.actionAlt}`}
            href={transitDirectionsHref(dest.at)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c.tripGoogle}
          </a>
        </div>
      </>
    )
  return (
    <>
      <h3 className={b.finderHeading}>{c.finderTripsTitle(dest.name)}</h3>
      <ul className={b.finderList}>
        {plan.trips.map((t: Trip, k) => (
          <li key={t.slug} className={b.finderTrip}>
            <p className={b.finderTripHead}>
              <span className={b.finderBullet} aria-hidden="true">
                {t.number ?? 'T'}
              </span>
              {k === 0 ? c.finderBest : c.finderAlso}
            </p>
            <TripSteps lang={lang} trip={t} destName={dest.name} />
            <div className={b.sheetActions}>
              <Link
                className={s.action}
                href={routes.busMap(lang, t.slug)}
                onClick={() => stashTrip({ dest, from })}
              >
                {c.finderSeeMap}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {plan.walkOnly !== null ? <p className={s.note}>{c.tripJustWalk(plan.walkOnly)}</p> : null}
    </>
  )
}
