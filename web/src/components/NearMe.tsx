'use client'

import type * as React from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { locateAddress } from '../lib/locate'
import type { LiveSnapshot, LiveVehicle } from '../lib/live'
import {
  LINKS,
  ROUTE_STYLE,
  TRANSIT,
  nearestStops,
  walkMinutes,
  type LatLng,
  type NearestStop,
  type TransitRoute,
} from '../lib/transit'
import { LeaveTimes, busSentence, usePoll, type BusWordsCopy, type LeaveCopy } from './LiveTransit'
import type { RideMapCopy } from './RideMap'
import tr from './transit.module.css'

/**
 * "Where are you?" — the nearest free stop from the visitor's own spot, and
 * when to leave to catch the bus there.
 *
 * Three ways in, because not everyone will (or can) share a location: the
 * location button; a street map to tap; or a box that takes a street address
 * (looked up on the server) or the name of a stop (matched right here —
 * "49 St", "Palm"). None of them ends in a dead end: however far away the
 * spot, the answer is the closest stop on each line, how far that really is,
 * and Freebee when it's too far to walk.
 *
 * Privacy: a GPS position never leaves the browser. Typed addresses go to the
 * server and from there to the Census geocoder. The street map loads tiles for
 * the part of the city it shows, and nothing else.
 */

const RideMap = dynamic(() => import('./RideMap'), { ssr: false })

export type NearMeCopy = Record<
  | 'title'
  | 'lead'
  | 'useLocation'
  | 'locating'
  | 'pickOnMap'
  | 'hideMap'
  | 'typeLabel'
  | 'placeholder'
  | 'find'
  | 'finding'
  | 'stopsMatching'
  | 'privacy'
  | 'denied'
  | 'deniedIphone'
  | 'deniedAndroid'
  | 'unavailable'
  | 'noNumber'
  | 'notFound'
  | 'showingFor'
  | 'yourLocation'
  | 'pickedSpot'
  | 'change'
  | 'yourStop'
  | 'walk'
  | 'distance'
  | 'directions'
  | 'seeStop'
  | 'rideTo'
  | 'ride'
  | 'walkFromStop'
  | 'far'
  | 'outside'
  | 'freebee'
  | 'line',
  string
>

export type NearMePlace = { name: string; href: string; route: TransitRoute['slug']; index: number; walk: number }

type Origin = { at: LatLng; label: string; fromGps: boolean; picked?: boolean }

const STORE = 'fc-free-rides-origin'
const noop = () => () => {}
/** About a twenty-minute walk. Past that, say so first and offer Freebee. */
const LONG_WALK_MIN = 20
/** About five miles: not a walk to a stop at all, but somewhere the buses don't go. */
const OUTSIDE_METERS = 8000

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Every pole on the chosen lines, once, for matching typed stop names. */
function stopIndex(routes: TransitRoute[]) {
  const out: { name: string; at: LatLng; route: TransitRoute; key: string }[] = []
  const seen = new Set<string>()
  for (const route of routes) {
    for (const st of route.stations) {
      st.points.forEach((at, k) => {
        const name = st.names[k] ?? st.name
        const key = `${route.slug}:${name}`
        if (seen.has(key)) return
        seen.add(key)
        out.push({ name, at, route, key: norm(name) })
      })
    }
  }
  return out
}

/**
 * A stop with a pole on each side of the street where the city's tracker
 * knows only one: the other direction's buses stop there too, unseen. The
 * line's two ends have one way to go, so they don't count.
 */
const isOneSided = (a: NearestStop) =>
  a.index > 0 && a.index < a.route.stations.length - 1 && a.station.points.length > 1 && a.etaIds.length === 1

/** The pole a stop answer is measured to. */
const poleOf = (a: NearestStop): LatLng => a.station.points[a.station.names.indexOf(a.stopName)] ?? a.station.points[0]

/** ETA stop number → its pole, for "the bus that way stops across the street". */
function polesOf(a: NearestStop): Record<number, { at: LatLng; name: string }> {
  const out: Record<number, { at: LatLng; name: string }> = {}
  a.station.eta.forEach((id, k) => {
    if (id !== null) out[id] = { at: a.station.points[k], name: a.station.names[k] ?? a.station.name }
  })
  return out
}

function Bullet({ route, size = 28 }: { route: TransitRoute; size?: number }) {
  const st = ROUTE_STYLE[route.slug]
  return (
    <span
      aria-hidden="true"
      style={{
        flex: '0 0 auto',
        width: size,
        height: size,
        borderRadius: '50%',
        background: st.grad,
        color: st.ink,
        border: '3px solid var(--ink)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--display)',
        fontSize: Math.round(size * 0.52),
        paddingTop: Math.round(size * 0.08),
      }}
    >
      {route.name[0]}
    </span>
  )
}

const bigButton = (primary: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  width: '100%',
  minHeight: 58,
  fontFamily: 'var(--display)',
  fontSize: 20,
  lineHeight: 1.1,
  padding: '14px 18px 11px',
  border: '4px solid var(--ink)',
  background: primary ? 'var(--ink)' : 'var(--cream)',
  color: primary ? 'var(--yellow)' : 'var(--ink)',
  boxShadow: primary ? '4px 4px 0 var(--pink)' : '4px 4px 0 var(--ink)',
  cursor: 'pointer',
  textAlign: 'center',
})

export function NearMe({
  copy,
  leave,
  mapCopy,
  busWords,
  lang,
  places,
  only,
  routeHref,
}: {
  copy: NearMeCopy
  leave: LeaveCopy
  mapCopy: RideMapCopy
  busWords: BusWordsCopy
  lang: 'en' | 'es'
  places: NearMePlace[]
  /** On a route page, answer for that line only. */
  only?: TransitRoute['slug']
  /** `/{lang}/free-rides/{slug}` — built on the server, where routes.ts lives. */
  routeHref: Record<string, string>
}) {
  const routes = useMemo(() => TRANSIT.routes.filter((r) => !only || r.slug === only), [only])
  const stops = useMemo(() => stopIndex(routes), [routes])
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [yourBus, setYourBus] = useState<string | null>(null)
  const [busChosen, setBusChosen] = useState(false)
  const [q, setQ] = useState('')
  const [error, setError] = useState<'denied' | 'unavailable' | 'noNumber' | 'notFound' | null>(null)
  const [locating, setLocating] = useState(false)
  const [searching, startSearch] = useTransition()
  // Apple Maps on iPhone, Google Maps everywhere else. False on the server.
  const ios = useSyncExternalStore(noop, () => /iphone|ipad|ipod/i.test(navigator.userAgent), () => false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const id = useId()

  // Back from a listing — or back tomorrow — the answer is still there. A
  // spot someone typed or tapped is kept on this device; a GPS fix only for
  // this tab, since they'll have moved by next time.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE) ?? localStorage.getItem(STORE)
      // Read after hydration, not in useState's initialiser: the server has no
      // storage, and rendering results it didn't would be a mismatch.
      if (saved) {
        const o = JSON.parse(saved) as Origin
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrigin(o)
        if (o.picked) setMapOpen(true)
      }
    } catch {}
  }, [])

  const choose = (o: Origin, scroll = true) => {
    setOrigin(o)
    setError(null)
    setBusChosen(false)
    try {
      sessionStorage.setItem(STORE, JSON.stringify(o))
      if (o.fromGps) localStorage.removeItem(STORE)
      else localStorage.setItem(STORE, JSON.stringify(o))
    } catch {}
    // On a phone the answer lands below the fold; take the reader to it.
    if (scroll) requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const clear = () => {
    setOrigin(null)
    setQ('')
    setYourBus(null)
    try {
      sessionStorage.removeItem(STORE)
      localStorage.removeItem(STORE)
    } catch {}
    inputRef.current?.focus()
  }

  const useLocation = () => {
    if (!('geolocation' in navigator)) return setError('unavailable')
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setMapOpen(true)
        choose({ at: [pos.coords.latitude, pos.coords.longitude], label: copy.yourLocation, fromGps: true })
      },
      (err) => {
        setLocating(false)
        setError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  const openMap = () => {
    setError(null)
    setMapOpen(true)
    requestAnimationFrame(() => mapRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const onPick = useCallback(
    (at: LatLng) => choose({ at, label: copy.pickedSpot, fromGps: false, picked: true }, false),
    [copy.pickedSpot],
  )

  const matches = useMemo(() => {
    const tokens = norm(q).split(' ').filter(Boolean)
    if (tokens.join('').length < 2) return []
    return stops.filter((s) => tokens.every((tk) => s.key.split(' ').some((w) => w.startsWith(tk)))).slice(0, 6)
  }, [q, stops])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = q.trim()
    if (!text) return inputRef.current?.focus()
    if (!/^\s*\d+[A-Za-z]?\s+\S/.test(text)) {
      if (matches[0]) return choose({ at: matches[0].at, label: matches[0].name, fromGps: false })
      return setError('noNumber')
    }
    setError(null)
    startSearch(async () => {
      const res = await locateAddress(text)
      if (res.ok) {
        setMapOpen(true)
        return choose({ at: res.at, label: res.matched, fromGps: false })
      }
      // "49 St & 12 Ave" reads as an address to the geocoder and fails; if it
      // names a stop, that was what they meant.
      if (matches[0]) return choose({ at: matches[0].at, label: matches[0].name, fromGps: false })
      setError(res.error === 'no-number' ? 'noNumber' : 'notFound')
    })
  }

  // The closest stop on each line, however far: a long walk is still an
  // answer, said honestly, never "nothing near you".
  const answers = useMemo(
    () => (origin ? nearestStops(origin.at, Infinity).filter((a) => !only || a.route.slug === only) : []),
    [origin, only],
  )
  const nearestWalk = answers[0] ? walkMinutes(answers[0].meters) : 0
  const outside = answers[0] ? answers[0].meters > OUTSIDE_METERS : false
  const target = useMemo(() => (answers[0] ? { at: poleOf(answers[0]), label: answers[0].stopName } : null), [answers])

  // Live buses for the map — only once the map is open.
  const { data: live } = usePoll<LiveSnapshot>(mapOpen ? '/api/transit/live' : null, 15_000)
  const vehicles = useMemo(() => (live?.ok ? live.vehicles : []), [live])
  const describe = useCallback((v: LiveVehicle) => busSentence(v, busWords), [busWords])
  const onFirstLive = useCallback(
    (bus: string | null) => {
      if (!busChosen) setYourBus(bus)
    },
    [busChosen],
  )
  const showBus = (bus: string) => {
    setYourBus(bus)
    setBusChosen(true)
    setMapOpen(true)
    requestAnimationFrame(() => mapRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const directions = (to: LatLng) => {
    const d = to.join(',')
    const o = origin ? origin.at.join(',') : null
    return ios
      ? `https://maps.apple.com/?${o ? `saddr=${o}&` : ''}daddr=${d}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&${o ? `origin=${o}&` : ''}destination=${d}&travelmode=walking`
  }

  const miles = (m: number) =>
    // Street distance, not as the crow flies: the same allowance walkMinutes makes.
    new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.max(0.1, (m * 1.3) / 1609.34))

  const errorText =
    error === 'denied' ? copy.denied : error === 'unavailable' ? copy.unavailable : error === 'noNumber' ? copy.noNumber : error === 'notFound' ? copy.notFound : null

  return (
    <section
      id="near-me"
      aria-labelledby={`${id}-h`}
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '9px 9px 0 var(--ink)',
        padding: 'clamp(16px,3.5vw,26px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        scrollMarginTop: 110,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 id={`${id}-h`} style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 'clamp(28px,7vw,34px)', lineHeight: 1 }}>
          {copy.title}
        </h2>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 600, lineHeight: 1.45, maxWidth: '60ch', textWrap: 'pretty' }}>{copy.lead}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 12 }}>
        <button type="button" onClick={useLocation} disabled={locating} className={tr.btn} style={{ ...bigButton(true), cursor: locating ? 'progress' : 'pointer' }}>
          {locating ? <span className={tr.spin} aria-hidden="true" /> : <PinIcon />}
          {locating ? copy.locating : copy.useLocation}
        </button>
        <button
          type="button"
          onClick={mapOpen ? () => setMapOpen(false) : openMap}
          aria-expanded={mapOpen}
          aria-controls={`${id}-map`}
          className={tr.btn}
          style={bigButton(false)}
        >
          <MapIcon />
          {mapOpen ? copy.hideMap : copy.pickOnMap}
        </button>
      </div>

      <form onSubmit={submit} role="search" style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <label htmlFor={`${id}-q`} style={{ fontWeight: 800, fontSize: 16 }}>
          {copy.typeLabel}
        </label>
        <div style={{ display: 'flex', minWidth: 0 }}>
          <input
            ref={inputRef}
            id={`${id}-q`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setError(null)
            }}
            placeholder={copy.placeholder}
            autoComplete="street-address"
            enterKeyHint="search"
            className={tr.field}
            aria-describedby={`${id}-help`}
            aria-invalid={error === 'noNumber' || error === 'notFound' ? true : undefined}
            aria-controls={matches.length ? `${id}-stops` : undefined}
          />
          <button
            type="submit"
            disabled={searching}
            className={tr.btn}
            style={{
              fontFamily: 'var(--display)',
              fontSize: 18,
              lineHeight: 1,
              minWidth: 84,
              padding: '12px 16px 9px',
              border: '4px solid var(--ink)',
              borderLeft: 0,
              background: 'var(--yellow)',
              color: 'var(--ink)',
              cursor: searching ? 'progress' : 'pointer',
              flex: '0 0 auto',
            }}
          >
            {searching ? copy.finding : copy.find}
          </button>
        </div>
      </form>

      {matches.length && !origin ? (
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '1.2px', marginBottom: 8 }}>{copy.stopsMatching}</div>
          <ul id={`${id}-stops`} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {matches.map((m) => (
              <li key={`${m.route.slug}-${m.name}`}>
                <button
                  type="button"
                  onClick={() => {
                    setMapOpen(true)
                    choose({ at: m.at, label: m.name, fromGps: false })
                  }}
                  className={tr.place}
                  style={{ gap: 8, minHeight: 44, padding: '8px 12px 7px 8px', cursor: 'pointer', font: 'inherit' }}
                >
                  <Bullet route={m.route} size={26} />
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p id={`${id}-help`} style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.45, color: '#3d4248' }}>
        {copy.privacy}
      </p>

      {errorText ? (
        <div role="alert" style={{ background: 'var(--ink)', color: 'var(--cream)', padding: '14px 14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 17, lineHeight: 1.4 }}>{errorText}</p>
          {error === 'denied' ? (
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 16, fontWeight: 600, lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>{copy.deniedIphone}</li>
              <li>{copy.deniedAndroid}</li>
            </ul>
          ) : null}
          {error === 'denied' || error === 'unavailable' || error === 'notFound' ? (
            <button type="button" onClick={openMap} className={tr.btn} style={{ ...bigButton(false), boxShadow: '4px 4px 0 var(--yellow)' }}>
              <MapIcon />
              {copy.pickOnMap}
            </button>
          ) : null}
        </div>
      ) : null}

      {mapOpen ? (
        <div ref={mapRef} id={`${id}-map`} style={{ scrollMarginTop: 110 }}>
          <RideMap
            only={only}
            origin={origin?.at ?? null}
            target={target}
            vehicles={vehicles}
            yourBus={yourBus}
            describe={describe}
            onPick={onPick}
            copy={mapCopy}
          />
        </div>
      ) : null}

      <div ref={resultsRef} style={{ scrollMarginTop: 110 }}>
        {origin ? (
          <div className={tr.reveal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              {/* Announced when the spot changes — not the cards, whose times refresh every 30s. */}
              <div aria-live="polite" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4, minWidth: 0 }}>
                {copy.showingFor} <strong style={{ fontWeight: 800 }}>{origin.label}</strong>
              </div>
              <button
                type="button"
                onClick={clear}
                className={tr.btn}
                style={{ minHeight: 44, font: 'inherit', fontWeight: 800, fontSize: 16, padding: '8px 14px', border: '3px solid var(--ink)', background: 'var(--cream)', color: 'var(--ink)', cursor: 'pointer' }}
              >
                {copy.change}
              </button>
            </div>

            {nearestWalk > LONG_WALK_MIN ? (
              <div style={{ border: '4px solid var(--ink)', background: 'var(--yellow)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 18, lineHeight: 1.4 }}>
                  {outside ? copy.outside : fill(copy.far, { n: nearestWalk, mi: miles(answers[0].meters) })}
                </p>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 16, lineHeight: 1.45 }}>{copy.freebee}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {[
                    { href: LINKS.freebeeIos, label: 'Freebee · iPhone ↗' },
                    { href: LINKS.freebeeAndroid, label: 'Freebee · Android ↗' },
                  ].map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={tr.btn}
                      style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, background: 'var(--ink)', color: 'var(--cream)', fontWeight: 800, fontSize: 16, padding: '8px 14px' }}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {outside ? null : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))', gap: 16 }}>
              {answers.map((a, n) => {
                const st = ROUTE_STYLE[a.route.slug]
                const walk = walkMinutes(a.meters)
                const at = poleOf(a)
                const rides = places
                  .filter((p) => p.route === a.route.slug)
                  .map((p) => ({ ...p, ride: Math.abs(a.route.stations[p.index].min - a.station.min) }))
                  .sort((x, y) => x.ride - y.ride)
                  .slice(0, 5)
                return (
                  <article key={a.route.slug} style={{ border: '4px solid var(--ink)', background: 'var(--cream)', boxShadow: '6px 6px 0 var(--ink)' }}>
                    <div style={{ background: st.grad, color: st.ink, borderBottom: '4px solid var(--ink)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Bullet route={a.route} size={34} />
                      <h3 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 22, lineHeight: 1, paddingTop: 3 }}>
                        {fill(copy.line, { name: a.route.name.toUpperCase() })}
                      </h3>
                    </div>
                    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '1.2px' }}>{copy.yourStop}</div>
                        <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800, lineHeight: 1.25 }}>{a.stopName}</div>
                        <div style={{ marginTop: 4, fontSize: 17, fontWeight: 600 }}>
                          {fill(copy.walk, { n: walk })} · {fill(copy.distance, { mi: miles(a.meters) })}
                        </div>
                      </div>
                      <a
                        href={directions(at)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={tr.btn}
                        style={{ ...bigButton(true), minHeight: 52, fontSize: 18, boxShadow: `4px 4px 0 ${st.color}` }}
                      >
                        {copy.directions}
                      </a>

                      <LeaveTimes
                        route={a.route}
                        stops={a.etaIds}
                        walk={walk}
                        nearestPole={at}
                        poles={polesOf(a)}
                        lang={lang}
                        copy={leave}
                        walkHref={directions}
                        onShowBus={showBus}
                        onFirstLive={n === 0 ? onFirstLive : undefined}
                        oneSide={isOneSided(a)}
                      />

                      {rides.length ? (
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '1.2px', margin: '2px 0 8px' }}>{copy.rideTo}</div>
                          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {rides.map((p) => (
                              <li key={p.href}>
                                <Link href={p.href} className={tr.place} style={{ flexWrap: 'wrap', rowGap: 2, padding: '10px 12px 9px' }}>
                                  <span style={{ fontFamily: 'var(--display)', fontSize: 17, lineHeight: 1.1 }}>{p.name}</span>
                                  <span style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>
                                    {p.ride ? fill(copy.ride, { n: p.ride }) : null}
                                    {p.ride ? ' · ' : ''}
                                    {fill(copy.walkFromStop, { n: p.walk })} →
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <Link
                        href={`${routeHref[a.route.slug]}#stop-${a.station.id}`}
                        style={{ alignSelf: 'flex-start', fontWeight: 800, fontSize: 16, textDecoration: 'underline', padding: '8px 0' }}
                      >
                        {copy.seeStop}
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function PinIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.6" fill="var(--ink)" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  )
}
