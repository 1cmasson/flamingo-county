'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import type * as ML from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { LiveVehicle } from '../lib/live'
import { TRANSIT, type LatLng, type TransitRoute } from '../lib/transit'
import rm from './ridemap.module.css'

/**
 * The street map behind "Where are you?": real streets with their names, the
 * two free lines over them, the buses where the city's tracker says they are,
 * and the rider's own spot — which they set, or move, by tapping the map.
 *
 * Streets come from OpenFreeMap (OpenStreetMap data, no key). The map library
 * is fetched only when this component mounts, from the site's own copy
 * (scripts/vendor-maplibre.mjs), and nothing about the rider is sent anywhere:
 * the tile server only learns which part of the city the map is showing.
 *
 * Everything the map says is also said in text next to it. The map is for
 * seeing; the cards are the answer.
 */

const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const LIB = '/vendor/maplibre/maplibre-gl.mjs'

/** The palette from globals.css. The map draws on a canvas, which can't read CSS variables. */
const INK = '#0c0f14'
const CREAM = '#fff6e5'
const LINE_COLOR: Record<TransitRoute['slug'], string> = { flamingo: '#ff2e88', marlin: '#16e0f2' }

let lib: Promise<typeof ML> | null = null
function maplibre(): Promise<typeof ML> {
  const url = LIB
  lib ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<typeof ML>).catch((e) => {
    // A dropped connection shouldn't cost the map for the rest of the visit:
    // closing and reopening it tries again.
    lib = null
    throw e
  })
  return lib
}

export type RideMapCopy = Record<
  'label' | 'tapHint' | 'you' | 'yourStop' | 'yourBus' | 'loading' | 'failed' | 'zoomIn' | 'zoomOut' | 'close' | 'credits' | 'twoFingers',
  string
>

export type RideMapProps = {
  only?: TransitRoute['slug']
  origin: LatLng | null
  /** The pole the rider should walk to, and what to call it. */
  target: { at: LatLng; label: string } | null
  vehicles: LiveVehicle[]
  /** The bus the answer is about, if it's on the road. */
  yourBus: string | null
  /** What a bus says when tapped — a sentence, built by the caller in the page's language. */
  describe: (v: LiveVehicle) => string
  onPick: (at: LatLng) => void
  copy: RideMapCopy
}

const lngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat]

export default function RideMap({ only, origin, target, vehicles, yourBus, describe, onPick, copy }: RideMapProps) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<ML.Map | null>(null)
  const ml = useRef<typeof ML | null>(null)
  const markers = useRef<{ origin?: ML.Marker; target?: ML.Marker; buses: Map<string, ML.Marker> }>({ buses: new Map() })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  // The latest callbacks, for listeners registered once.
  const pick = useRef(onPick)
  const say = useRef(describe)
  useEffect(() => {
    pick.current = onPick
    say.current = describe
  })

  const routes = TRANSIT.routes.filter((r) => !only || r.slug === only)

  /* ---- the map itself, once ---- */
  useEffect(() => {
    let alive = true
    let m: ML.Map | null = null
    maplibre()
      .then((lib) => {
        if (!alive || !box.current) return
        ml.current = lib
        const pts = routes.flatMap((r) => r.stations.flatMap((s) => s.points))
        const bounds = new lib.LngLatBounds()
        for (const p of pts) bounds.extend(lngLat(p))
        m = new lib.Map({
          container: box.current,
          style: STYLE,
          bounds,
          fitBoundsOptions: { padding: 24 },
          attributionControl: { compact: true },
          // One finger scrolls the page, two move the map: a map that eats
          // the scroll strands people half-way down a phone screen.
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          maxZoom: 18,
          // MapLibre's own buttons and messages, in the page's language.
          locale: {
            'NavigationControl.ZoomIn': copy.zoomIn,
            'NavigationControl.ZoomOut': copy.zoomOut,
            'Popup.Close': copy.close,
            'AttributionControl.ToggleAttribution': copy.credits,
            'Map.Title': copy.label,
            'CooperativeGesturesHandler.MobileHelpText': copy.twoFingers,
          },
        })
        m.touchZoomRotate.disableRotation()
        m.keyboard.disableRotation()
        m.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right')
        map.current = m

        m.on('load', () => {
          if (!alive || !m) return
          inkAndSand(m)
          m.addSource('lines', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: routes.map((r) => ({
                type: 'Feature',
                properties: { color: LINE_COLOR[r.slug] },
                geometry: { type: 'LineString', coordinates: r.stations.map((s) => lngLat(s.points[0])) },
              })),
            },
          })
          m.addSource('stops', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: routes.flatMap((r) =>
                r.stations.flatMap((s) =>
                  s.points.map((p) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: lngLat(p) } })),
                ),
              ),
            },
          })
          m.addSource('walk', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
          const width = (base: number) => ['interpolate', ['linear'], ['zoom'], 11, base, 16, base * 2.2] as ML.ExpressionSpecification
          m.addLayer({ id: 'line-casing', type: 'line', source: 'lines', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': INK, 'line-width': width(5) } })
          m.addLayer({ id: 'line-fill', type: 'line', source: 'lines', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': width(2.6) } })
          m.addLayer({
            id: 'stops',
            type: 'circle',
            source: 'stops',
            minzoom: 13,
            paint: { 'circle-radius': width(2.6), 'circle-color': CREAM, 'circle-stroke-color': INK, 'circle-stroke-width': 2 },
          })
          m.addLayer({
            id: 'walk',
            type: 'line',
            source: 'walk',
            layout: { 'line-cap': 'round' },
            paint: { 'line-color': INK, 'line-width': 4, 'line-dasharray': [0.2, 2] },
          })
          // The credit starts folded to its ⓘ button: open, it covers a
          // third of a phone-sized map.
          box.current?.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show')
          // The box can still be settling when the map is made; fit the lines
          // to the size it ended up.
          m.resize()
          m.fitBounds(bounds, { padding: { top: 64, bottom: 24, left: 24, right: 64 }, duration: 0 })
          setReady(true)
        })

        m.on('click', (e) => {
          // A tap on a bus opens its card; it doesn't move the rider.
          if ((e.originalEvent.target as Element | null)?.closest?.('.maplibregl-marker, .maplibregl-popup')) return
          pick.current([Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6))])
        })
        m.on('error', (e) => {
          // A tile that fails is a hole in the map; a style that fails is no map.
          if (!m?.isStyleLoaded() && /style/i.test(String(e.error?.message ?? ''))) setFailed(true)
        })
      })
      .catch(() => alive && setFailed(true))
    const busMarkers = markers.current.buses
    return () => {
      alive = false
      busMarkers.clear()
      m?.remove()
      map.current = null
    }
    // The lines a page shows never change while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- the rider, their stop, and the dotted walk between ---- */
  useEffect(() => {
    const m = map.current
    const lib = ml.current
    if (!ready || !m || !lib) return
    const mk = markers.current

    if (origin) {
      if (!mk.origin) {
        // Not draggable: with one finger kept for scrolling the page, a drag
        // never reaches the pin on a phone. Tapping somewhere else moves it.
        mk.origin = new lib.Marker({ element: pin('you', copy.you), anchor: 'bottom' }).setLngLat(lngLat(origin)).addTo(m)
      } else mk.origin.setLngLat(lngLat(origin))
    } else {
      mk.origin?.remove()
      mk.origin = undefined
    }

    if (target) {
      if (!mk.target) mk.target = new lib.Marker({ element: pin('stop', copy.yourStop), anchor: 'bottom' }).setLngLat(lngLat(target.at)).addTo(m)
      else mk.target.setLngLat(lngLat(target.at))
    } else {
      mk.target?.remove()
      mk.target = undefined
    }

    const walk = m.getSource('walk') as ML.GeoJSONSource | undefined
    walk?.setData(
      origin && target
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [lngLat(origin), lngLat(target.at)] } }
        : { type: 'FeatureCollection', features: [] },
    )

    if (origin) {
      const b = new lib.LngLatBounds(lngLat(origin), lngLat(origin))
      if (target) b.extend(lngLat(target.at))
      m.fitBounds(b, { padding: { top: 80, bottom: 50, left: 50, right: 70 }, maxZoom: 16.5, duration: 700 })
    }
  }, [ready, origin, target, copy.you, copy.yourStop])

  /* ---- the buses ---- */
  useEffect(() => {
    const m = map.current
    const lib = ml.current
    if (!ready || !m || !lib) return
    const have = markers.current.buses
    const shown = vehicles.filter((v) => !only || v.route === only)
    const seen = new Set<string>()
    for (const v of shown) {
      seen.add(v.id)
      const mine = v.id === yourBus
      let mk = have.get(v.id)
      if (!mk) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = rm.bus
        mk = new lib.Marker({ element: el, anchor: 'center' })
          .setLngLat([v.lng, v.lat])
          .setPopup(new lib.Popup({ offset: 26, closeButton: true, maxWidth: '260px', className: rm.popup }))
          .addTo(m)
        have.set(v.id, mk)
      } else mk.setLngLat([v.lng, v.lat])
      const el = mk.getElement()
      const name = TRANSIT.routes.find((r) => r.slug === v.route)?.name ?? ''
      el.style.setProperty('--c', LINE_COLOR[v.route])
      el.style.setProperty('--fg', v.route === 'marlin' ? INK : CREAM)
      el.style.setProperty('--bearing', `${v.bearing}deg`)
      el.toggleAttribute('data-yours', mine)
      el.setAttribute('aria-label', say.current(v))
      el.innerHTML = `<span class="${rm.arrow}" aria-hidden="true"></span><span class="${rm.letter}" aria-hidden="true">${name[0] ?? ''}</span>${
        mine ? `<span class="${rm.yours}" aria-hidden="true">${escapeHtml(copy.yourBus)}</span>` : ''
      }`
      mk.getPopup()?.setText(say.current(v))
      // Your bus on top of any bus beside it.
      el.style.zIndex = mine ? '3' : '1'
    }
    for (const [id, mk] of have) {
      if (seen.has(id)) continue
      mk.remove()
      have.delete(id)
    }
  }, [ready, vehicles, yourBus, only, copy.yourBus])

  return (
    <div className={rm.wrap}>
      <div ref={box} className={rm.map} role="region" aria-label={copy.label} />
      <p className={rm.hint} aria-hidden="true">
        {copy.tapHint}
      </p>
      {!ready ? (
        <p className={rm.status} role="status">
          {failed ? copy.failed : copy.loading}
        </p>
      ) : null}
    </div>
  )
}

/**
 * OpenFreeMap's streets, recoloured to match the drawn city map: sand ground,
 * cream streets with ink edges, ink labels. The street names stay — they're
 * how someone finds their own block — but it reads as the same design as the
 * map at the top of the page.
 */
function inkAndSand(m: ML.Map) {
  const set = (id: string, prop: Parameters<ML.Map['setPaintProperty']>[1], value: string | number) => {
    try {
      m.setPaintProperty(id, prop, value)
    } catch {}
  }
  for (const layer of m.getStyle().layers ?? []) {
    const id = layer.id
    const hide = () => m.setLayoutProperty(id, 'visibility', 'none')
    if (layer.type === 'background') set(id, 'background-color', '#eadbbd')
    else if (layer.type === 'raster' || layer.type === 'fill-extrusion') hide()
    else if (layer.type === 'fill') {
      if (id === 'water') set(id, 'fill-color', '#b9d8d3')
      else if (id === 'building') {
        set(id, 'fill-color', '#dcc79f')
        set(id, 'fill-outline-color', 'rgba(12,15,20,0.18)')
      } else if (id === 'road_area_pattern') hide()
      else if (/park|grass|wood|wetland|pitch|cemetery/.test(id)) set(id, 'fill-color', '#dfd3a6')
      else set(id, 'fill-color', '#e6d6b4')
    } else if (layer.type === 'line') {
      if (/rail/.test(id)) set(id, 'line-color', 'rgba(12,15,20,0.45)')
      else if (/casing/.test(id)) set(id, 'line-color', 'rgba(12,15,20,0.4)')
      else if (/^(road|bridge|tunnel)_/.test(id)) set(id, 'line-color', '#fffaf0')
      else if (/waterway/.test(id)) set(id, 'line-color', '#9fc8c2')
      else if (/boundary/.test(id)) set(id, 'line-color', 'rgba(12,15,20,0.3)')
      else if (id === 'park_outline') hide()
      else set(id, 'line-color', '#d8c8a4')
    } else if (layer.type === 'symbol') {
      if (/one_way/.test(id)) hide()
      set(id, 'text-color', INK)
      set(id, 'text-halo-color', CREAM)
      set(id, 'text-halo-width', 1.6)
    }
  }
}

/** A teardrop pin with a word under it: "You", "Your stop". */
function pin(kind: 'you' | 'stop', label: string): HTMLElement {
  const el = document.createElement('div')
  el.className = `${rm.pin} ${kind === 'you' ? rm.pinYou : rm.pinStop}`
  el.innerHTML = `<span class="${rm.pinLabel}">${escapeHtml(label)}</span><span class="${rm.pinHead}" aria-hidden="true"></span>`
  return el
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
