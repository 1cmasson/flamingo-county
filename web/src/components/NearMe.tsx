'use client'

import type * as React from 'react'
import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { locateAddress } from '../lib/locate'
import {
  LINKS,
  ROUTE_STYLE,
  TRANSIT,
  nearestStops,
  walkMinutes,
  type LatLng,
  type TransitRoute,
} from '../lib/transit'
import { NextBus, type NextBusCopy } from './LiveTransit'
import tr from './transit.module.css'

/**
 * "Where are you?" — the nearest free stop from the visitor's own position.
 *
 * Two ways in, because a phone's location is the fast path but not everyone
 * grants it: the location button, or a box that takes either a street address
 * (looked up on the server) or the name of a stop (matched right here, no
 * request — "49 St", "Palm"). Intersections are what people actually know in
 * Hialeah, and the stops are already named after them.
 *
 * Privacy: a GPS position never leaves the browser. Only typed addresses go to
 * the server, and from there to the Census geocoder.
 */

export type NearMeCopy = Record<
  | 'title'
  | 'lead'
  | 'useLocation'
  | 'locating'
  | 'placeholder'
  | 'find'
  | 'finding'
  | 'stopsMatching'
  | 'privacy'
  | 'denied'
  | 'unavailable'
  | 'noNumber'
  | 'notFound'
  | 'showingFor'
  | 'yourLocation'
  | 'clear'
  | 'walk'
  | 'toStop'
  | 'directions'
  | 'seeStop'
  | 'rideTo'
  | 'ride'
  | 'walkFromStop'
  | 'longWalk'
  | 'tooFar'
  | 'freebee'
  | 'line',
  string
>

export type NearMePlace = { name: string; href: string; route: TransitRoute['slug']; index: number; walk: number }

type Origin = { at: LatLng; label: string; fromGps: boolean }

const STORE = 'fc-free-rides-origin'
const noop = () => () => {}
/** About a half-hour walk. Past that, the honest answer is Freebee. */
const FURTHEST = 2400

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

export function NearMe({
  copy,
  nextBus,
  places,
  only,
  routeHref,
}: {
  copy: NearMeCopy
  nextBus: NextBusCopy
  places: NearMePlace[]
  /** On a route page, answer for that line only. */
  only?: TransitRoute['slug']
  /** `/{lang}/free-rides/{slug}` — built on the server, where routes.ts lives. */
  routeHref: Record<string, string>
}) {
  const routes = useMemo(() => TRANSIT.routes.filter((r) => !only || r.slug === only), [only])
  const stops = useMemo(() => stopIndex(routes), [routes])
  const [origin, setOrigin] = useState<Origin | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [searching, startSearch] = useTransition()
  // Apple Maps on iPhone, Google Maps everywhere else. False on the server.
  const ios = useSyncExternalStore(noop, () => /iphone|ipad|ipod/i.test(navigator.userAgent), () => false)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const id = useId()

  // Back from a listing, the answer is still there. Per tab, and only if
  // storage is allowed at all.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE)
      // Read after hydration, not in useState's initialiser: the server has no
      // session, and rendering results it didn't would be a mismatch.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setOrigin(JSON.parse(saved) as Origin)
    } catch {}
  }, [])

  const choose = (o: Origin) => {
    setOrigin(o)
    setError(null)
    try {
      sessionStorage.setItem(STORE, JSON.stringify(o))
    } catch {}
    // On a phone the answer lands below the fold; take the reader to it.
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }

  const clear = () => {
    setOrigin(null)
    setQ('')
    try {
      sessionStorage.removeItem(STORE)
    } catch {}
    inputRef.current?.focus()
  }

  const useLocation = () => {
    if (!('geolocation' in navigator)) return setError(copy.unavailable)
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        choose({ at: [pos.coords.latitude, pos.coords.longitude], label: copy.yourLocation, fromGps: true })
      },
      (err) => {
        setLocating(false)
        setError(err.code === err.PERMISSION_DENIED ? copy.denied : copy.unavailable)
        inputRef.current?.focus()
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

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
      return setError(copy.noNumber)
    }
    setError(null)
    startSearch(async () => {
      const res = await locateAddress(text)
      if (res.ok) return choose({ at: res.at, label: res.matched, fromGps: false })
      // "49 St & 12 Ave" reads as an address to the geocoder and fails; if it
      // names a stop, that was what they meant.
      if (matches[0]) return choose({ at: matches[0].at, label: matches[0].name, fromGps: false })
      setError(res.error === 'no-number' ? copy.noNumber : copy.notFound)
    })
  }

  const answers = useMemo(() => (origin ? nearestStops(origin.at, FURTHEST) : []), [origin])

  const directions = (to: LatLng) => {
    const [o, d] = [origin!.at.join(','), to.join(',')]
    return ios
      ? `https://maps.apple.com/?saddr=${o}&daddr=${d}&dirflg=w`
      : `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=walking`
  }

  return (
    <section
      aria-labelledby={`${id}-h`}
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '9px 9px 0 var(--ink)',
        padding: 'clamp(16px,3.5vw,26px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 id={`${id}-h`} style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 'clamp(24px,5vw,30px)', lineHeight: 1 }}>
          {copy.title}
        </h2>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, maxWidth: '60ch', textWrap: 'pretty' }}>{copy.lead}</p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' }}>
        <button
          type="button"
          onClick={useLocation}
          disabled={locating}
          className={tr.btn}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            fontFamily: 'var(--display)',
            fontSize: 18,
            lineHeight: 1,
            padding: '14px 18px 11px',
            border: '4px solid var(--ink)',
            background: 'var(--ink)',
            color: 'var(--yellow)',
            boxShadow: '4px 4px 0 var(--pink)',
            cursor: locating ? 'progress' : 'pointer',
            flex: '1 1 220px',
          }}
        >
          {locating ? <span className={tr.spin} aria-hidden="true" /> : <PinIcon />}
          {locating ? copy.locating : copy.useLocation}
        </button>

        <form onSubmit={submit} role="search" style={{ flex: '999 1 300px', display: 'flex', gap: 0, minWidth: 0 }}>
          <label htmlFor={`${id}-q`} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            {copy.placeholder}
          </label>
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
            aria-controls={matches.length ? `${id}-stops` : undefined}
          />
          <button
            type="submit"
            disabled={searching}
            className={tr.btn}
            style={{
              fontFamily: 'var(--display)',
              fontSize: 17,
              lineHeight: 1,
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
        </form>
      </div>

      {matches.length && !origin ? (
        <div>
          <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.4px', marginBottom: 8 }}>{copy.stopsMatching}</div>
          <ul id={`${id}-stops`} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {matches.map((m) => (
              <li key={`${m.route.slug}-${m.name}`}>
                <button
                  type="button"
                  onClick={() => choose({ at: m.at, label: m.name, fromGps: false })}
                  className={tr.place}
                  style={{ gap: 8, padding: '6px 10px 5px 6px', cursor: 'pointer', font: 'inherit' }}
                >
                  <Bullet route={m.route} size={22} />
                  <span style={{ fontWeight: 800, fontSize: 13 }}>{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p id={`${id}-help`} style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#4a4f55' }}>
        {copy.privacy}
      </p>

      <div ref={resultsRef} aria-live="polite" style={{ scrollMarginTop: 120 }}>
        {error ? (
          <p role="alert" style={{ margin: 0, background: 'var(--ink)', color: 'var(--cream)', fontWeight: 800, fontSize: 14, padding: '10px 12px' }}>
            {error}
          </p>
        ) : null}

        {origin ? (
          <div className={tr.reveal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {copy.showingFor} <strong style={{ fontWeight: 800 }}>{origin.label}</strong>
              </div>
              <button
                type="button"
                onClick={clear}
                style={{ font: 'inherit', fontWeight: 800, fontSize: 13, textDecoration: 'underline', background: 'none', border: 0, padding: 4, cursor: 'pointer' }}
              >
                {copy.clear}
              </button>
            </div>

            {answers.length ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))',
                  gap: 14,
                }}
              >
                {answers.map((a) => {
                  const st = ROUTE_STYLE[a.route.slug]
                  const walk = walkMinutes(a.meters)
                  const at = a.station.points[a.station.names.indexOf(a.stopName)] ?? a.station.points[0]
                  const rides = places
                    .filter((p) => p.route === a.route.slug)
                    .map((p) => ({ ...p, ride: Math.abs(a.route.stations[p.index].min - a.station.min) }))
                    .sort((x, y) => x.ride - y.ride)
                    .slice(0, 5)
                  return (
                    <article key={a.route.slug} style={{ border: '4px solid var(--ink)', background: 'var(--cream)', boxShadow: '6px 6px 0 var(--ink)' }}>
                      <div style={{ background: st.grad, color: st.ink, borderBottom: '4px solid var(--ink)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Bullet route={a.route} size={32} />
                        <span style={{ fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1, paddingTop: 3 }}>
                          {fill(copy.line, { name: a.route.name.toUpperCase() })}
                        </span>
                      </div>
                      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <div style={{ fontFamily: 'var(--display)', fontSize: 30, lineHeight: 0.95 }}>{fill(copy.walk, { n: walk })}</div>
                          <div style={{ marginTop: 5, fontSize: 14, fontWeight: 600 }}>
                            {copy.toStop} <strong style={{ fontWeight: 800 }}>{a.stopName}</strong>
                          </div>
                        </div>
                        <NextBus stops={a.etaIds} route={a.route.slug} copy={nextBus} />
                        {walk > 15 ? (
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
                            {copy.longWalk}{' '}
                            <a href={LINKS.freebeeIos} rel="noopener noreferrer" target="_blank" style={{ fontWeight: 800, textDecoration: 'underline' }}>
                              Freebee ↗
                            </a>
                          </p>
                        ) : null}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          <a
                            href={directions(at)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={tr.btn}
                            style={{ fontFamily: 'var(--display)', fontSize: 15, lineHeight: 1, padding: '10px 12px 8px', border: '3px solid var(--ink)', background: 'var(--ink)', color: 'var(--yellow)', boxShadow: `3px 3px 0 ${st.color}` }}
                          >
                            {copy.directions}
                          </a>
                          <Link
                            href={`${routeHref[a.route.slug]}#stop-${a.station.id}`}
                            className={tr.btn}
                            style={{ fontFamily: 'var(--display)', fontSize: 15, lineHeight: 1, padding: '10px 12px 8px', border: '3px solid var(--ink)', background: 'var(--cream)', color: 'var(--ink)', boxShadow: '3px 3px 0 var(--ink)' }}
                          >
                            {copy.seeStop}
                          </Link>
                        </div>
                        {rides.length ? (
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.4px', margin: '2px 0 8px' }}>{copy.rideTo}</div>
                            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {rides.map((p) => (
                                <li key={p.href}>
                                  <Link href={p.href} className={tr.place} style={{ flexWrap: 'wrap', rowGap: 2, padding: '8px 10px 7px' }}>
                                    <span style={{ fontFamily: 'var(--display)', fontSize: 16, lineHeight: 1.1 }}>{p.name}</span>
                                    <span style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>
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
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <div style={{ border: '4px solid var(--ink)', background: 'var(--yellow)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 15, lineHeight: 1.45 }}>{copy.tooFar}</p>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, lineHeight: 1.45 }}>{copy.freebee}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={LINKS.freebeeIos} target="_blank" rel="noopener noreferrer" className={tr.btn} style={{ background: 'var(--ink)', color: 'var(--cream)', fontWeight: 800, fontSize: 13, padding: '8px 11px 7px' }}>
                    iPhone ↗
                  </a>
                  <a href={LINKS.freebeeAndroid} target="_blank" rel="noopener noreferrer" className={tr.btn} style={{ background: 'var(--ink)', color: 'var(--cream)', fontWeight: 800, fontSize: 13, padding: '8px 11px 7px' }}>
                    Android ↗
                  </a>
                </div>
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
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path
        d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.6" fill="var(--ink)" />
    </svg>
  )
}
