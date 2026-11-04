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

/**
 * A county route on the site's street map, with its buses where Swiftly says
 * they are (api/transit/county-vehicles: the server's shared copy of the
 * feed, read every 15 s while the map is on screen).
 *
 * Two modes:
 * - `preview`, at the top of the route page: a still picture of the route and
 *   its buses. It takes no gestures (the page scrolls over it) and the page
 *   wraps it in a link to the full map.
 * - `full`, the map page (/[lang]/bus/[route]/map): the whole screen. The
 *   chosen direction's stops can be tapped, the chosen stop is marked, the
 *   visitor's own spot shows once they ask for it, and places from the
 *   directory near the route are pins that open their card.
 *
 * The two directions are drawn side by side in the brand's pink and cyan, and
 * each bus takes its direction's colour, with a wedge for where it's heading.
 */

const LIB = '/vendor/maplibre/maplibre-gl.mjs'
const FALLBACK_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const INK = '#0c0f14'
const CREAM = '#fff6e5'
const YELLOW = '#ffd400'
/** Direction colours, in the order the page lists the directions. */
export const DIR_COLORS = ['#ff2e88', '#16e0f2']
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

export type BusMapDirection = {
  id: string
  toward: string
  path: LatLng[]
  stops: { name: string; at: LatLng }[]
}

/** A directory listing near one of the route's stops. */
export type MapPlace = { id: number; name: string; at: LatLng }

type Bus = { id: string; dir: string; lat: number; lng: number; bearing: number; ts: number }
type Answer = { live: { asOf: number; buses: Bus[] } | null }

const lngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat]
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const empty = { type: 'FeatureCollection' as const, features: [] }

export type BusMapProps = {
  mode: 'preview' | 'full'
  slug: string
  /** "Ruta 54", for the map's name and each bus's description. */
  label: string
  /** What each bus marker says: the route number. */
  number: string
  lang: Lang
  directions: BusMapDirection[]
  /** Poll Swiftly's buses: Metrobus only (the trolley isn't in the feed). */
  live: boolean
  /** Full map: the chosen direction and stop, by index. */
  selected?: { dir: number; stop: number } | null
  origin?: LatLng | null
  places?: MapPlace[]
  /** The place whose card is open, so its pin stands out. */
  placeId?: number | null
  onPickStop?: (dir: number, stop: number) => void
  onPickPlace?: (id: number) => void
  /** Pixels at the bottom covered by the page's own panel: the map centres above it. */
  padBottom?: number
}

export function BusMap(props: BusMapProps) {
  const { mode, slug, label, number, lang, directions, live } = props
  const full = mode === 'full'
  const c = busCopy(lang)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<ML.Map | null>(null)
  const ml = useRef<typeof ML | null>(null)
  const markers = useRef(new Map<string, ML.Marker>())
  const you = useRef<ML.Marker | null>(null)
  const [start, setStart] = useState(full)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // The latest callbacks, for listeners registered once.
  const cb = useRef(props)
  useEffect(() => {
    cb.current = props
  })

  // The preview waits for the page to be idle: the times come first.
  useEffect(() => {
    if (full) return
    const go = () => setStart(true)
    const w = window as Window & {
      requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number
    }
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2500 })
    else setTimeout(go, 1200)
  }, [full])

  const {
    data,
    at,
    failed: pollFailed,
  } = usePoll<Answer>(
    start && live ? `/api/transit/county-vehicles?route=${encodeURIComponent(slug)}` : null,
    POLL_MS,
  )
  const ago = useAgo(at)
  const liveData = data?.live ?? null
  const buses = useMemo(() => liveData?.buses ?? [], [liveData])

  /* ---- the map, once ---- */
  useEffect(() => {
    if (!start) return
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
          // The preview is a picture the page scrolls over; the full map is the whole screen.
          interactive: full,
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
          },
        })
        if (full) {
          m.touchZoomRotate.disableRotation()
          m.keyboard.disableRotation()
          m.addControl(new L.NavigationControl({ showCompass: false }), 'top-right')
        }
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
          if (full) {
            m.addSource('places', { type: 'geojson', data: empty })
            m.addSource('stops', { type: 'geojson', data: empty })
            m.addSource('picked', { type: 'geojson', data: empty })
            m.addLayer({
              id: 'places',
              type: 'circle',
              source: 'places',
              minzoom: 12,
              paint: {
                'circle-radius': ['case', ['get', 'open'], 10, 6.5],
                'circle-color': YELLOW,
                'circle-stroke-color': INK,
                'circle-stroke-width': ['case', ['get', 'open'], 3.5, 2.5],
              },
            })
            m.addLayer({
              id: 'stops',
              type: 'circle',
              source: 'stops',
              paint: {
                'circle-radius': width(3),
                'circle-color': CREAM,
                'circle-stroke-color': INK,
                'circle-stroke-width': 2,
              },
            })
            m.addLayer({
              id: 'picked',
              type: 'circle',
              source: 'picked',
              paint: {
                'circle-radius': width(6),
                'circle-color': ['get', 'color'],
                'circle-stroke-color': INK,
                'circle-stroke-width': 3.5,
              },
            })
            // A finger is wider than a stop: anything within 14 px of the tap counts.
            m.on('click', (e) => {
              if (
                (e.originalEvent.target as Element | null)?.closest?.(
                  '.maplibregl-marker, .maplibregl-popup',
                )
              )
                return
              const r = 14
              const hits = m!.queryRenderedFeatures(
                [
                  [e.point.x - r, e.point.y - r],
                  [e.point.x + r, e.point.y + r],
                ],
                { layers: ['stops', 'places'] },
              )
              const near = (f: ML.MapGeoJSONFeature) => {
                const [x, y] = (f.geometry as GeoJSON.Point).coordinates
                const p = m!.project([x, y])
                return (p.x - e.point.x) ** 2 + (p.y - e.point.y) ** 2
              }
              const hit = hits.sort((a, z) => near(a) - near(z))[0]
              if (!hit) return
              const p = hit.properties as { dir?: number; stop?: number; place?: number }
              if (hit.layer.id === 'stops' && p.dir !== undefined && p.stop !== undefined)
                cb.current.onPickStop?.(p.dir, p.stop)
              else if (hit.layer.id === 'places' && p.place !== undefined)
                cb.current.onPickPlace?.(p.place)
            })
            m.on('mouseenter', 'stops', () => (m!.getCanvas().style.cursor = 'pointer'))
            m.on('mouseleave', 'stops', () => (m!.getCanvas().style.cursor = ''))
            m.on('mouseenter', 'places', () => (m!.getCanvas().style.cursor = 'pointer'))
            m.on('mouseleave', 'places', () => (m!.getCanvas().style.cursor = ''))
          }
          box.current
            ?.querySelector('.maplibregl-compact-show')
            ?.classList.remove('maplibregl-compact-show')
          m.resize()
          m.fitBounds(bounds, {
            padding: full
              ? { top: 24, bottom: 24 + (cb.current.padBottom ?? 0), left: 24, right: 64 }
              : 16,
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
      you.current = null
      m?.remove()
      map.current = null
    }
    // A route's lines never change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start])

  /* ---- full map: the chosen direction's stops, and the chosen stop ---- */
  const sel = props.selected
  const selDir = sel?.dir ?? -1
  const selStop = sel?.stop ?? -1
  useEffect(() => {
    const m = map.current
    if (!full || !ready || !m) return
    const d = directions[selDir]
    const stops = m.getSource('stops') as ML.GeoJSONSource | undefined
    const picked = m.getSource('picked') as ML.GeoJSONSource | undefined
    stops?.setData({
      type: 'FeatureCollection',
      features: (d?.stops ?? []).map((st, k) => ({
        type: 'Feature',
        properties: { dir: selDir, stop: k },
        geometry: { type: 'Point', coordinates: lngLat(st.at) },
      })),
    })
    const st = d?.stops[selStop]
    picked?.setData(
      st
        ? {
            type: 'Feature',
            properties: { color: DIR_COLORS[selDir] ?? DIR_COLORS[0] },
            geometry: { type: 'Point', coordinates: lngLat(st.at) },
          }
        : empty,
    )
  }, [full, ready, directions, selDir, selStop])

  // A stop chosen (on the map, from the list or by "near me") is brought into view above the panel.
  const pad = props.padBottom ?? 0
  useEffect(() => {
    const m = map.current
    const st = directions[selDir]?.stops[selStop]
    if (!full || !ready || !m || !st) return
    m.easeTo({
      center: lngLat(st.at),
      zoom: Math.max(m.getZoom(), 15),
      padding: { top: 40, bottom: pad + 20, left: 20, right: 20 },
      duration: 600,
    })
  }, [full, ready, directions, selDir, selStop, pad])

  /* ---- full map: places near the route ---- */
  const places = props.places
  const placeId = props.placeId ?? null
  useEffect(() => {
    const m = map.current
    if (!full || !ready || !m) return
    ;(m.getSource('places') as ML.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: (places ?? []).map((p) => ({
        type: 'Feature',
        properties: { place: p.id, open: p.id === placeId },
        geometry: { type: 'Point', coordinates: lngLat(p.at) },
      })),
    })
  }, [full, ready, places, placeId])

  /* ---- full map: "you" ---- */
  const origin = props.origin ?? null
  useEffect(() => {
    const m = map.current
    const L = ml.current
    if (!full || !ready || !m || !L) return
    if (!origin) {
      you.current?.remove()
      you.current = null
      return
    }
    if (!you.current) {
      const el = document.createElement('div')
      el.className = `${rm.pin} ${rm.pinYou}`
      el.innerHTML = `<span class="${rm.pinLabel}">${esc(c.mapYou)}</span><span class="${rm.pinHead}" aria-hidden="true"></span>`
      you.current = new L.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(lngLat(origin))
        .addTo(m)
    } else you.current.setLngLat(lngLat(origin))
  }, [full, ready, origin, c])

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
        const el = document.createElement(full ? 'button' : 'span')
        if (full) (el as HTMLButtonElement).type = 'button'
        el.className = rm.bus
        // The bus badge's own `position: relative` can win over MapLibre's `absolute` depending on
        // stylesheet order, and then the markers stack like lines of text. Absolute, always.
        el.style.position = 'absolute'
        mk = new L.Marker({ element: el, anchor: 'center' }).setLngLat([v.lng, v.lat]).addTo(m)
        if (full)
          mk.setPopup(
            new L.Popup({ offset: 26, closeButton: true, maxWidth: '260px', className: rm.popup }),
          )
        have.set(v.id, mk)
      } else mk.setLngLat([v.lng, v.lat])
      const el = mk.getElement()
      el.style.setProperty('--c', DIR_COLORS[k] ?? DIR_COLORS[0])
      el.style.setProperty('--fg', DIR_FG[k] ?? CREAM)
      el.style.setProperty('--bearing', `${v.bearing}deg`)
      if (full) el.setAttribute('aria-label', words)
      else el.setAttribute('aria-hidden', 'true')
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
  }, [ready, buses, directions, label, number, c, full])

  const counts = directions.map((d) => buses.filter((v) => v.dir === d.id).length)
  let status: string
  if (!live) status = c.mapNoLiveTrolley
  else if (!data && !pollFailed) status = c.mapLoading
  else if (!liveData) status = c.mapNoLive
  else if (!buses.length) status = c.mapNone
  else if (full) status = c.mapCountShort(buses.length)
  else
    status = c.mapCount(
      buses.length,
      directions.map((d, k) => [d.toward, counts[k]] as [string, number]),
    )
  const updated = liveData && ago !== null ? ` ${c.mapUpdated(ago)}` : ''

  return (
    <div className={full ? b.fullMapWrap : b.previewWrap}>
      <div
        ref={box}
        className={full ? b.fullMap : b.previewMap}
        role={full ? 'region' : 'img'}
        aria-label={c.mapLabel(label)}
      />
      {!ready ? (
        <p className={rm.status} role="status">
          {failed ? c.mapFailed : c.mapLoading}
        </p>
      ) : null}
      <p className={full ? b.fullStatus : b.previewStatus} aria-live="polite">
        {status}
        {updated}
      </p>
    </div>
  )
}
