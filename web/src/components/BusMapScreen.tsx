'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { stopMapsHref, type RouteTimes } from '../lib/busTime'
import type { MapPlaceCard } from '../lib/busPlaces'
import { BusMap, DIR_COLORS, type BusMapDirection } from './BusMap'
import { NextTimes } from './NextBus'
import { MAP_FROM, useRouteChoice } from './useRouteChoice'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * The full map of a county route (/[lang]/bus/[route]/map): the whole screen
 * is the map, with a bar on top (back to the route page, which way) and a
 * panel at the bottom that answers for what was tapped: a stop's next buses,
 * or a place from the directory near the route.
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
  const v = useRouteChoice(slug, times, { live, schedule })
  const [placeId, setPlaceId] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)

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
            v.pickStop(dir, stop)
            setPlaceId(null)
            setTouched(true)
          }}
          onPickPlace={(id) => setPlaceId(id)}
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
      </div>

      <section className={b.sheet} aria-live="polite">
        {place ? (
          <>
            <p className={b.sheetKicker}>{place.category ?? ''}</p>
            <p className={b.sheetTitle}>{place.name}</p>
            <p className={s.note}>{c.mapPlaceWalk(place.walk, place.stop)}</p>
            <div className={b.sheetActions}>
              <Link className={s.action} href={place.href}>
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
