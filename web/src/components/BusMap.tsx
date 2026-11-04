'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import type * as ML from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import type { LatLng } from '../lib/transitMath'
import { useAgo, usePoll } from './LiveTransit'
import b from './bus.module.css'
import rm from './ridemap.module.css'
import s from './vote.module.css'

/**
 * A county route's buses on a street map, where Swiftly says they are
 * (api/transit/county-vehicles, the server's shared copy of the feed, read
 * every 15 s while the map is in view).
 *
 * The two directions are drawn side by side in the brand's pink and cyan, and
 * each bus takes its direction's colour, with a wedge for where it's heading.
 * A sentence under the map says the same thing in words.
 *
 * The map library (~800 KB) and the street style load only when the card
 * scrolls near the screen, so the page stays light for the people who only
 * came for the times.
 */

const LIB = '/vendor/maplibre/maplibre-gl.mjs'
const FALLBACK_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const INK = '#0c0f14'
const CREAM = '#fff6e5'
/** Direction colours, in the order the page lists the directions. */
const DIR_COLORS = ['#ff2e88', '#16e0f2']
const DIR_FG = [CREAM, INK]
const POLL_MS = 15_000

let lib: Promise<typeof ML> | null = null
function maplibre(): Promise<typeof ML> {
  const url = LIB
  lib ??= (
    import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<typeof ML>
  ).catch((e) => {
    lib = null
    throw e
  })
  return lib
}

let style: Promise<unknown> | null = null
function sandStyle(): Promise<unknown> {
  style ??= fetch('/api/map/style')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  return style
}

export type BusMapDirection = { id: string; toward: string; path: LatLng[]; stops: LatLng[] }

type Bus = { id: string; dir: string; lat: number; lng: number; bearing: number; ts: number }
type Answer = { live: { asOf: number; buses: Bus[] } | null }

const lngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat]
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function BusMap({
  slug,
  label,
  number,
  lang,
  directions,
}: {
  slug: string
  /** "Ruta 54", for the map's name and each bus's description. */
  label: string
  /** What each bus marker says: the route number. */
  number: string
  lang: Lang
  directions: BusMapDirection[]
}) {
  const c = busCopy(lang)
  const card = useRef<HTMLElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<ML.Map | null>(null)
  const ml = useRef<typeof ML | null>(null)
  const markers = useRef(new Map<string, ML.Marker>())
  const [near, setNear] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // Load nothing until the card is about to be seen.
  useEffect(() => {
    const el = card.current
    if (!el) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), {
      rootMargin: '300px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const {
    data,
    at,
    failed: pollFailed,
  } = usePoll<Answer>(
    near ? `/api/transit/county-vehicles?route=${encodeURIComponent(slug)}` : null,
    POLL_MS,
  )
  const ago = useAgo(at)
  const live = data?.live ?? null
  const buses = useMemo(() => live?.buses ?? [], [live])

  /* ---- the map, once it's near ---- */
  useEffect(() => {
    if (!near) return
    let alive = true
    let m: ML.Map | null = null
    Promise.all([maplibre(), sandStyle()])
      .then(([L, doc]) => {
        if (!alive || !box.current) return
        ml.current = L
        const bounds = new L.LngLatBounds()
        for (const d of directions) for (const p of d.path) bounds.extend(lngLat(p))
        m = new L.Map({
          container: box.current,
          style: (doc as ML.StyleSpecification | null) ?? FALLBACK_STYLE,
          bounds,
          fitBoundsOptions: { padding: 24 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxZoom: 18,
          locale: {
            'NavigationControl.ZoomIn': c.mapZoomIn,
            'NavigationControl.ZoomOut': c.mapZoomOut,
            'Popup.Close': c.mapClose,
            'AttributionControl.ToggleAttribution': c.mapCredits,
            'Map.Title': c.mapLabel(label),
            'CooperativeGesturesHandler.MobileHelpText': c.mapTwoFingers,
          },
        })
        m.touchZoomRotate.disableRotation()
        m.keyboard.disableRotation()
        m.addControl(new L.NavigationControl({ showCompass: false }), 'top-right')
        map.current = m
        m.on('load', () => {
          if (!alive || !m) return
          m.addSource('lines', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: directions.map((d, k) => ({
                type: 'Feature',
                properties: { color: DIR_COLORS[k] ?? DIR_COLORS[0] },
                geometry: { type: 'LineString', coordinates: d.path.map(lngLat) },
              })),
            },
          })
          m.addSource('stops', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: directions.flatMap((d) =>
                d.stops.map((p) => ({
                  type: 'Feature' as const,
                  properties: {},
                  geometry: { type: 'Point' as const, coordinates: lngLat(p) },
                })),
              ),
            },
          })
          const width = (base: number) =>
            [
              'interpolate',
              ['linear'],
              ['zoom'],
              11,
              base,
              16,
              base * 2.2,
            ] as ML.ExpressionSpecification
          // Each direction a little to its own right, so both show where they share a street.
          const offset = [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            2,
            16,
            5,
          ] as ML.ExpressionSpecification
          m.addLayer({
            id: 'line-casing',
            type: 'line',
            source: 'lines',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': INK, 'line-width': width(4.6), 'line-offset': offset },
          })
          m.addLayer({
            id: 'line-fill',
            type: 'line',
            source: 'lines',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': ['get', 'color'],
              'line-width': width(2.4),
              'line-offset': offset,
            },
          })
          m.addLayer({
            id: 'stops',
            type: 'circle',
            source: 'stops',
            minzoom: 13.5,
            paint: {
              'circle-radius': width(2.2),
              'circle-color': CREAM,
              'circle-stroke-color': INK,
              'circle-stroke-width': 1.5,
            },
          })
          box.current
            ?.querySelector('.maplibregl-compact-show')
            ?.classList.remove('maplibregl-compact-show')
          m.resize()
          m.fitBounds(bounds, {
            padding: { top: 24, bottom: 24, left: 24, right: 64 },
            duration: 0,
          })
          setReady(true)
        })
        m.on('error', (e) => {
          if (!m?.isStyleLoaded() && /style/i.test(String(e.error?.message ?? ''))) setFailed(true)
        })
      })
      .catch(() => alive && setFailed(true))
    const have = markers.current
    return () => {
      alive = false
      have.clear()
      m?.remove()
      map.current = null
    }
    // A route's lines never change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near])

  /* ---- the buses ---- */
  useEffect(() => {
    const m = map.current
    const L = ml.current
    if (!ready || !m || !L) return
    const have = markers.current
    const seen = new Set<string>()
    const nowS = Date.now() / 1000
    for (const v of buses) {
      const k = Math.max(
        0,
        directions.findIndex((d) => d.id === v.dir),
      )
      const words = c.mapBus(
        label,
        directions[k]?.toward ?? '',
        Math.max(0, Math.round(nowS - v.ts)),
      )
      seen.add(v.id)
      let mk = have.get(v.id)
      if (!mk) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = rm.bus
        mk = new L.Marker({ element: el, anchor: 'center' })
          .setLngLat([v.lng, v.lat])
          .setPopup(
            new L.Popup({ offset: 26, closeButton: true, maxWidth: '260px', className: rm.popup }),
          )
          .addTo(m)
        have.set(v.id, mk)
      } else mk.setLngLat([v.lng, v.lat])
      const el = mk.getElement()
      el.style.setProperty('--c', DIR_COLORS[k] ?? DIR_COLORS[0])
      el.style.setProperty('--fg', DIR_FG[k] ?? CREAM)
      el.style.setProperty('--bearing', `${v.bearing}deg`)
      el.setAttribute('aria-label', words)
      el.innerHTML = `<span class="${rm.arrow}" aria-hidden="true"></span><span class="${rm.letter} ${
        number.length > 2 ? b.busNumSmall : ''
      }" aria-hidden="true">${esc(number)}</span>`
      mk.getPopup()?.setText(words)
    }
    for (const [id, mk] of have) {
      if (seen.has(id)) continue
      mk.remove()
      have.delete(id)
    }
  }, [ready, buses, directions, label, number, c])

  const counts = directions.map((d) => buses.filter((v) => v.dir === d.id).length)
  let status: string
  if (!data && !pollFailed) status = c.mapLoading
  else if (!live) status = c.mapNoLive
  else if (!buses.length) status = c.mapNone
  else
    status = c.mapCount(
      buses.length,
      directions.map((d, k) => [d.toward, counts[k]] as [string, number]),
    )

  return (
    <section ref={card} className={s.card} aria-labelledby="bus-map">
      <h2 id="bus-map" className={s.cardTag}>
        {c.mapTitle}
      </h2>
      <ul className={b.legend}>
        {directions.map((d, k) => (
          <li key={d.id}>
            <span
              className={b.legendDot}
              style={{ background: DIR_COLORS[k] }}
              aria-hidden="true"
            />
            {c.toward(d.toward)}
          </li>
        ))}
      </ul>
      <div className={rm.wrap}>
        <div
          ref={box}
          className={`${rm.map} ${b.busMap}`}
          role="region"
          aria-label={c.mapLabel(label)}
        />
        {!ready ? (
          <p className={rm.status} role="status">
            {failed ? c.mapFailed : c.mapLoading}
          </p>
        ) : null}
      </div>
      <p className={s.note} aria-live="polite">
        {status}
        {live && ago !== null ? ` ${c.mapUpdated(ago)}` : ''}
      </p>
    </section>
  )
}
