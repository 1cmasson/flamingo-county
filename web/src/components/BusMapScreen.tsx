'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { stopMapsHref, type RouteTimes } from '../lib/busTime'
import { meters } from '../lib/transitMath'
import type { MapPlaceCard } from '../lib/busPlaces'
import { BusMap, DIR_COLORS, type BusMapDirection } from './BusMap'
import { NextTimes } from './NextBus'
import { MAP_FROM, useRouteChoice } from './useRouteChoice'
import {
  TripPanel,
  TripSearch,
  mapTrip,
  takeStashedTrip,
  useTripPlan,
  type Destination,
} from './TripPlanner'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * The full map of a county route (/[lang]/bus/[route]/map): the whole screen
 * is the map, with a bar on top (back to the route page, which way) and a
 * panel at the bottom that answers for what was tapped: a stop's next buses,
 * or a place from the directory near the route.
 *
 * «¿A dónde vas?» plans a trip there by one bus from where the visitor is
 * (TripPlanner.tsx): the walk to the stop, the ride, the walk to the door,
 * all drawn on the map. If the phone already lets the site see its location,
 * the "you" pin and the walk to the nearest stop show as soon as it opens.
 *
 * It covers the site's own header and footer while it's open; the back link
 * (or the phone's back button) is the way out, to the route page it came
 * from. The chosen stop is remembered, so the route page shows the same one.
 */
export function BusMapScreen({
  slug,
  label,
  number,
  lang,
  times,
  directions,
  live,
  schedule,
  places,
  backHref,
}: {
  slug: string
  label: string
  number: string
  lang: Lang
  times: RouteTimes
  directions: BusMapDirection[]
  live: boolean
  schedule: boolean
  places: MapPlaceCard[]
  backHref: string
}) {
  const c = busCopy(lang)
  // The map follows the visitor's phone once they've shared where they are.
  const v = useRouteChoice(slug, times, { live, schedule, watch: true })
  // "Follow me": the map keeps the visitor in the middle until they drag it.
  const [follow, setFollow] = useState(false)
  const [placeId, setPlaceId] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)
  const [mode, setMode] = useState<'stop' | 'search' | 'trip'>('stop')
  // The bottom panel folds down to a bar, so the map can have the whole screen.
  const [open, setOpen] = useState(true)
  const [dest, setDest] = useState<Destination | null>(null)
  const [pick, setPick] = useState(0)
  // A start typed on the routes page, when the trip isn't from where the visitor is.
  const [from, setFrom] = useState<Destination | null>(null)

  // A trip planned on the routes page arrives here drawn.
  useEffect(() => {
    const t = takeStashedTrip()
    if (!t) return
    // A one-time hand-off from the page before, read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDest(t.dest)
    setFrom(t.from)
    setMode('trip')
  }, [])

  // Location already allowed for this site: pin the visitor and their nearest stop straight away.
  // (Asking unprompted would be a permission box before they've done anything.)
  const locate = useRef(v.locate)
  useEffect(() => {
    locate.current = v.locate
  })
  useEffect(() => {
    let alive = true
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => alive && p.state === 'granted' && locate.current())
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const goTo = (d: Destination) => {
    setOpen(true)
    setDest(d)
    setPick(0)
    setPlaceId(null)
    setMode('trip')
    if (!from && !v.origin && !v.locating) v.locate()
  }
  const start = from?.at ?? v.origin
  const plan = useTripPlan(
    mode === 'trip' ? start : null,
    mode === 'trip' ? (dest?.at ?? null) : null,
  )
  const trip = plan?.trips[pick] ?? null
  const shownTrip = useMemo(
    () =>
      mode === 'trip' && trip && start && dest ? mapTrip(trip, start, dest, c.tripDest) : null,
    [mode, trip, start, dest, c.tripDest],
  )

  // Opened from the route page: going back is the browser's back, which also keeps its scroll.
  const [fromRoute, setFromRoute] = useState(false)
  useEffect(() => {
    try {
      const here = window.location.pathname
      if (sessionStorage.getItem(MAP_FROM) === here) {
        sessionStorage.removeItem(MAP_FROM)
        // A one-time read of where we came from, after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFromRoute(true)
      }
    } catch {}
  }, [])

  // The page under the map shouldn't scroll while the map is the screen.
  useEffect(() => {
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = before
    }
  }, [])

  const place = places.find((p) => p.id === placeId) ?? null
  const { state, d, i, station } = v
  // A stop is the visitor's once they tap one, use "near me", or picked one on an earlier visit.
  const chosen = v.ready && (touched || v.origin !== null || v.saved)
  // "Routing me to the nearest stop": the dotted walk from the visitor to the chosen stop.
  // Only a walk someone would take: a stop picked across town gets no line from "you".
  const walkTo =
    mode !== 'trip' && v.origin && chosen && meters(v.origin, station.at) <= 2000
      ? [v.origin, station.at]
      : null

  // What the folded panel still says, so it's clear what opening it shows.
  const peek =
    mode === 'trip' && dest
      ? c.mapPeekTrip(dest.name)
      : mode === 'search'
        ? c.tripWhere
        : place
          ? place.name
          : chosen
            ? c.mapPeekStop(station.name)
            : c.mapPickTitle

  return (
    <div className={b.screen}>
      <header className={b.screenBar}>
        <Link
          href={backHref}
          className={b.screenBack}
          onClick={(e) => {
            if (!fromRoute) return
            e.preventDefault()
            window.history.back()
          }}
        >
          {c.mapBack(label)}
        </Link>
        <div className={b.screenDirs} role="group" aria-label={c.direction}>
          {directions.map((dir, k) => (
            <button
              key={dir.id}
              type="button"
              className={b.screenDir}
              aria-pressed={v.ready && k === state.dir}
              onClick={() => {
                v.setDir(k)
                setPlaceId(null)
                setTouched(true)
              }}
            >
              <span
                className={b.legendDot}
                style={{ background: DIR_COLORS[k] }}
                aria-hidden="true"
              />
              {c.toward(dir.toward)}
            </button>
          ))}
        </div>
      </header>

      <div className={b.screenMap}>
        <BusMap
          mode="full"
          slug={slug}
          label={label}
          number={number}
          lang={lang}
          directions={directions}
          live={live}
          // The direction's stops always show; the chosen one is marked (and flown to) once
          // the visitor has chosen, not on arrival, when the whole route is the view.
          selected={v.ready ? { dir: state.dir, stop: chosen ? i : -1 } : null}
          origin={v.origin}
          places={places}
          placeId={placeId}
          onPickStop={(dir, stop) => {
            setOpen(true)
            v.pickStop(dir, stop)
            setPlaceId(null)
            setTouched(true)
          }}
          onPickPlace={(id) => {
            setOpen(true)
            setPlaceId(id)
            setMode('stop')
          }}
          walkTo={walkTo}
          trip={shownTrip}
          accuracy={v.accuracy}
          follow={follow}
          onUserMove={() => setFollow(false)}
        />

        <details className={b.legendBox}>
          <summary>{c.mapLegend}</summary>
          <ul>
            {directions.map((dir, k) => (
              <li key={dir.id}>
                <span
                  className={b.legendLine}
                  style={{ background: DIR_COLORS[k] }}
                  aria-hidden="true"
                />
                {c.toward(dir.toward)}
              </li>
            ))}
            {live ? (
              <li>
                <span className={b.legendBus} aria-hidden="true">
                  {number}
                </span>
                {c.mapLegendBus}
              </li>
            ) : null}
            <li>
              <span className={b.legendStop} aria-hidden="true" />
              {c.mapLegendStop}
            </li>
            {places.length ? (
              <li>
                <span className={b.legendPlace} aria-hidden="true" />
                {c.mapLegendPlace}
              </li>
            ) : null}
          </ul>
        </details>

        {v.origin ? (
          <button
            type="button"
            className={b.followBtn}
            aria-pressed={follow}
            // On a trip the bottom right is often the destination: the button moves out of its way.
            style={mode === 'trip' ? { bottom: 28, left: 12, right: 'auto' } : undefined}
            onClick={() => setFollow((f) => !f)}
          >
            ➤ {follow ? c.mapFollowing : c.mapFollow}
          </button>
        ) : null}
        {mode === 'trip' ? null : (
          <button
            type="button"
            className={b.nearBtn}
            onClick={() => {
              setPlaceId(null)
              v.locate()
            }}
            disabled={v.locating}
          >
            ◎ {v.locating ? c.locating : c.mapNearMe}
          </button>
        )}
      </div>

      <section
        className={`${b.sheet} ${open ? '' : b.sheetClosed}`}
        aria-live="polite"
        aria-label={c.mapPanel}
      >
        {open ? (
          <div className={b.sheetHandle}>
            <button
              type="button"
              className={b.sheetToggle}
              aria-expanded="true"
              onClick={() => setOpen(false)}
            >
              ▾ {c.mapHidePanel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={b.sheetPeek}
            aria-expanded="false"
            onClick={() => setOpen(true)}
          >
            <span className={b.sheetPeekShow}>▴ {c.mapShowPanel}</span>
            <span className={b.sheetPeekText}>{peek}</span>
          </button>
        )}
        {!open ? null : mode === 'search' ? (
          <TripSearch lang={lang} onPick={goTo} onCancel={() => setMode(dest ? 'trip' : 'stop')} />
        ) : mode === 'trip' && dest ? (
          <TripPanel
            lang={lang}
            dest={dest}
            plan={start ? plan : null}
            pick={pick}
            onPick={setPick}
            needLocation={!start}
            from={from}
            here={v.origin}
            locating={v.locating}
            onLocate={v.locate}
            denied={v.denied}
            pageSlug={slug}
            onChange={() => setMode('search')}
            onClose={() => {
              setMode('stop')
              setDest(null)
              setFrom(null)
            }}
          />
        ) : place ? (
          <>
            <p className={b.sheetKicker}>{place.category ?? ''}</p>
            <p className={b.sheetTitle}>{place.name}</p>
            <p className={s.note}>{c.mapPlaceWalk(place.walk, place.stop)}</p>
            <div className={b.sheetActions}>
              <button
                type="button"
                className={s.action}
                onClick={() =>
                  goTo({
                    name: place.name,
                    sub: place.category ?? '',
                    at: place.at,
                    href: place.href,
                  })
                }
              >
                {c.tripHowBus}
              </button>
              <Link className={`${s.action} ${s.actionAlt}`} href={place.href}>
                {c.mapPlaceOpen}
              </Link>
              <button
                type="button"
                className={`${s.action} ${s.actionAlt}`}
                onClick={() => setPlaceId(null)}
              >
                {c.mapPlaceClose}
              </button>
            </div>
          </>
        ) : !v.ready ? (
          <p className={s.note}>{c.mapPickHint}</p>
        ) : (
          <>
            <button type="button" className={b.whereBtn} onClick={() => setMode('search')}>
              <span aria-hidden="true">⌕</span> {c.tripWhere}
            </button>
            {!chosen ? <p className={b.sheetTitle}>{c.mapPickTitle}</p> : null}
            <label className={b.sheetPick}>
              <span className={b.sheetKicker}>{chosen ? c.mapStopLabel : c.mapPickOr}</span>
              <select
                className={b.select}
                value={chosen ? i : -1}
                onChange={(e) => {
                  v.pickStop(state.dir, Number(e.target.value))
                  setTouched(true)
                }}
              >
                {!chosen ? (
                  <option value={-1} disabled>
                    {c.mapPickPlaceholder}
                  </option>
                ) : null}
                {d.stations.map((st, k) => (
                  <option key={`${k}-${st.name}`} value={k}>
                    {st.name}
                  </option>
                ))}
              </select>
            </label>
            {v.denied ? <p className={s.notice}>{c.denied}</p> : null}
            {v.closer ? (
              <p className={b.closer}>
                {c.mapCloser(v.closer.name, v.closer.walk)}
                <button
                  type="button"
                  className={b.textBtn}
                  onClick={() => {
                    v.pickStop(state.dir, v.closer!.index)
                    setTouched(true)
                  }}
                >
                  {c.mapUseCloser}
                </button>
              </p>
            ) : null}
            {chosen ? (
              <>
                {v.walk !== null ? <p className={s.note}>{c.walkToStop(v.walk)}</p> : null}
                {schedule || v.anyLive ? (
                  <NextTimes lang={lang} v={v} />
                ) : (
                  <p className={s.note}>{c.stale}</p>
                )}
                <p className={b.meta}>
                  {v.anyLive ? c.liveSource : schedule ? c.scheduled : ''}{' '}
                  <a href={stopMapsHref(station.at)} target="_blank" rel="noopener noreferrer">
                    {c.mapsStop}
                  </a>
                </p>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
