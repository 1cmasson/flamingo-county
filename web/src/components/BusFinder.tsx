'use client'

import Link from 'next/link'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { routes } from '../lib/routes'
import { walkMinutes, meters, type LatLng } from '../lib/transitMath'
import {
  nearbyRoutes,
  planTrips,
  type Network,
  type NearbyRoute,
  type Trip,
} from '../lib/tripPlan'
import { NEAR_COLORS, NearMap } from './NearMap'
import {
  Soon,
  TripSearch,
  TripSteps,
  legBadge,
  loadNetwork,
  stashTrip,
  tripKey,
  tripMapSlug,
  useLegNext,
  type Destination,
} from './TripPlanner'
import { FareChip } from './FareChip'
import { ShareTrip, shareStart } from './TripShare'
import { readHubDest, tripBuses } from '../lib/tripLink'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * «¿Qué guagua cojo?» at the top of the routes hub (/[lang]/bus): from where
 * the visitor is (or an address they type), the routes they can walk to, and
 * with a destination, the trips there with every route in the county (up to
 * two changes, free rides marked). An answer on a route the site keeps a map
 * for opens that map, the trip already drawn.
 *
 * Everything is worked out in the browser over /api/transit/network; the
 * visitor's location never leaves the phone. Only typed searches go to the
 * server (/api/transit/where), as on the map.
 */

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

  // A destination handed over in the link (`?a=…&ac=…`, as a trip link written
  // with only where to go becomes): it plans from where the visitor is.
  useEffect(() => {
    const to = readHubDest(new URLSearchParams(window.location.search))
    // The URL is only readable after hydration, so this can't be the initial state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (to) setDest({ name: to.name, sub: '', at: to.at, href: null })
  }, [])

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

  const located = from !== null
  return (
    <section className={b.finder} aria-labelledby="bus-finder">
      <h1 id="bus-finder" className={b.finderTitle}>
        {c.finderTitle}
      </h1>

      {searching ? (
        <TripSearch
          lang={lang}
          near={here}
          label={searching === 'from' ? c.finderFromSearch : c.tripWhere}
          onPick={(d) => {
            if (searching === 'from') setTypedFrom(d)
            else {
              setDest(d)
              // Where to go before where from: the tap on the place is the
              // gesture that lets the phone ask for the location right away.
              if (!from && !locating) locate()
            }
            setSearching(null)
          }}
          onCancel={() => setSearching(null)}
        />
      ) : (
        <>
          {located ? (
            <p className={b.finderFromLine}>
              <span>◎ {typedFrom ? typedFrom.name : c.finderNearYou}</span>
              <button type="button" className={b.textBtn} onClick={() => setSearching('from')}>
                {c.finderChangeFrom}
              </button>
              {typedFrom ? (
                <button type="button" className={b.textBtn} onClick={locate} disabled={locating}>
                  {locating ? c.locating : c.finderUseMine}
                </button>
              ) : null}
            </p>
          ) : dest ? null : (
            <button type="button" className={b.bigLocate} onClick={locate} disabled={locating}>
              <span aria-hidden="true">◎</span> {locating ? c.locating : c.finderLocate}
            </button>
          )}
          <button type="button" className={b.whereBtn} onClick={() => setSearching('to')}>
            <span aria-hidden="true">⌕</span> {dest ? dest.name : c.tripWhere}
          </button>
          {dest ? (
            <button type="button" className={b.textBtn} onClick={() => setDest(null)}>
              {c.finderClearDest}
            </button>
          ) : null}
          {!located && !dest ? (
            <button type="button" className={b.fromBtn} onClick={() => setSearching('from')}>
              <span aria-hidden="true">✎</span> {c.finderTypeFrom}
            </button>
          ) : null}
          {denied && !dest ? <p className={s.notice}>{c.finderDenied}</p> : null}
        </>
      )}

      {searching ? null : !from ? (
        dest ? (
          <AskFrom
            lang={lang}
            place={dest.name}
            locating={locating}
            denied={denied}
            onLocate={locate}
            onType={() => setSearching('from')}
          />
        ) : null
      ) : !net ? (
        <p className={s.note}>{c.tripSearching}</p>
      ) : dest && plan ? (
        <FinderTrips lang={lang} plan={plan} dest={dest} from={typedFrom} />
      ) : near ? (
        <NearList lang={lang} near={near} net={net} from={from} />
      ) : null}
    </section>
  )
}

/**
 * A destination but no start yet: one question, two equal ways to answer it.
 * In Instagram's and Facebook's in-app browsers the location prompt is often
 * refused, so typing the address is a full-size button, not a footnote.
 */
function AskFrom({
  lang,
  place,
  locating,
  denied,
  onLocate,
  onType,
}: {
  lang: Lang
  place: string
  locating: boolean
  denied: boolean
  onLocate: () => void
  onType: () => void
}) {
  const c = busCopy(lang)
  return (
    <div className={b.askFrom} role="group" aria-labelledby="bus-ask-from">
      <p id="bus-ask-from" className={b.askFromTitle}>
        {c.finderAskFrom(place)}
      </p>
      {locating ? (
        <p className={s.note} role="status">
          {c.finderLocatingYou}
        </p>
      ) : (
        <button type="button" className={b.bigLocate} onClick={onLocate}>
          <span aria-hidden="true">◎</span> {c.finderHereBtn}
        </button>
      )}
      <button type="button" className={b.fromBtn} onClick={onType}>
        <span aria-hidden="true">✎</span> {c.finderTypeFromBtn}
      </button>
      {denied ? (
        <p className={s.notice} role="status">
          {c.finderDenied}
        </p>
      ) : null}
    </div>
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
      <NearMap lang={lang} from={from} near={near} net={net} />
      <ul className={b.nearRows}>
        {near.map((r, k) => (
          <li key={r.slug}>
            <NearRow lang={lang} route={r} net={net} color={k} />
          </li>
        ))}
      </ul>
    </>
  )
}

function NearRow({
  lang,
  route,
  net,
  color,
}: {
  lang: Lang
  route: NearbyRoute
  net: Network
  /** Its colour on the map above, by position. */
  color: number
}) {
  const c = busCopy(lang)
  const first = route.dirs[0]
  const second = route.dirs[1]
  const key = (d: NearbyRoute['dirs'][number]) => ({
    slug: route.slug,
    live: route.live,
    feedDir: d.feedDir,
    board: { id: d.id, eta: d.eta },
  })
  const nextA = useLegNext(key(first))
  const nextB = useLegNext(second ? key(second) : null)
  // The route's own page when the site has one: a county route's map, a free line's page.
  const href =
    route.page === 'bus'
      ? routes.busMap(lang, route.slug)
      : route.page === 'free'
        ? routes.freeRoute(lang, route.slug)
        : null
  const body = (
    <>
      <span
        className={b.nearBullet}
        style={
          {
            '--c': NEAR_COLORS[color % NEAR_COLORS.length],
            '--fg':
              color % NEAR_COLORS.length === 0 || color % NEAR_COLORS.length === 4
                ? '#fff6e5'
                : '#0c0f14',
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        {legBadge(route)}
      </span>
      <span className={b.nearBody}>
        <span className={b.nearName}>
          {c.tripRouteName(route)}{' '}
          {route.fare ? (
            <FareChip
              free={route.fare === 'free'}
              label={route.fare === 'free' ? c.fareFree : c.farePaidShort}
            />
          ) : null}{' '}
          <span className={b.nearWalk}>{c.finderWalk(route.walk)}</span>
        </span>
        <span className={b.nearLine}>
          → {first.toward}: <Soon lang={lang} next={nextA} short />
        </span>
        {second ? (
          <span className={b.nearLine}>
            → {second.toward}: <Soon lang={lang} next={nextB} short />
          </span>
        ) : null}
      </span>
      {href ? (
        <span className={b.finderGo} aria-hidden="true">
          ›
        </span>
      ) : null}
    </>
  )
  return href ? (
    <Link href={href} className={b.nearRow} onClick={() => rememberStop(route, net)}>
      {body}
    </Link>
  ) : (
    <div className={b.nearRow}>{body}</div>
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
      </>
    )
  return (
    <>
      <h3 className={b.finderHeading}>{c.finderTripsTitle(dest.name)}</h3>
      <ul className={b.finderList}>
        {plan.trips.map((t: Trip, k) => (
          <li key={tripKey(t)} className={b.finderTrip}>
            <p className={b.finderTripHead}>
              {t.legs.map((l, x) => (
                <span key={x} className={b.finderLegs}>
                  {x > 0 ? <span aria-hidden="true">→</span> : null}
                  <span className={b.finderBullet} aria-hidden="true">
                    {legBadge(l)}
                  </span>
                </span>
              ))}
              {k === 0 ? c.finderBest : c.finderAlso}
            </p>
            <TripSteps lang={lang} trip={t} destName={dest.name} />
            <div className={b.sheetActions}>
              {tripMapSlug(t) ? (
                <Link
                  className={s.action}
                  href={routes.busMap(lang, tripMapSlug(t)!)}
                  onClick={() => stashTrip({ dest, from, key: tripKey(t) })}
                >
                  {c.finderSeeMap}
                </Link>
              ) : null}
              <ShareTrip
                lang={lang}
                link={{
                  from: shareStart(t, from ? { name: from.name, at: from.at } : null),
                  to: { name: dest.name, at: dest.at },
                  buses: tripBuses(t),
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      {plan.walkOnly !== null ? <p className={s.note}>{c.tripJustWalk(plan.walkOnly)}</p> : null}
    </>
  )
}
