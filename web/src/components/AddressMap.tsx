'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import type * as ML from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { MapCopy } from '../lib/addressCopy'
import { MAP_LENSES as LENSES, type LensId } from '../lib/mapLenses'
import { TRANSIT, type LatLng } from '../lib/transit'
import { inkAndSand } from './RideMap'
import rm from './ridemap.module.css'
import s from './address.module.css'

/**
 * The county on a map, one layer at a time: trash days, flood and storm-surge
 * zones, commission districts, precincts and polling places, school zones,
 * public services and the free buses, over the site's ink-and-sand streets.
 *
 * Built to do almost nothing per visit:
 * - Every layer comes in one set of vector tiles, cut when the data is
 *   refreshed (src/lib/civicTiles.ts) and cached for a year under a versioned
 *   URL. Switching layers only shows and hides what the phone already has.
 * - The street style arrives already in the site's colours (/api/map/style),
 *   so the map's first frame is its last.
 * - The map isn't built until it scrolls into view, and draws at no more than
 *   twice the screen's CSS pixels.
 * Full screen takes over the viewport (iPhones allow the real Fullscreen API
 * only for video), and there one finger moves the map.
 */

const FALLBACK_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const LIB = '/vendor/maplibre/maplibre-gl.mjs'
const FONT = ['Noto Sans Bold']
const INK = '#0c0f14'
const CREAM = '#fff6e5'
/** Miami-Dade, west/south/east/north. */
const COUNTY: [number, number, number, number] = [-80.87, 25.13, -80.12, 25.98]

const PALETTE = ['#ff2e88', '#16e0f2', '#ffd400', '#9b7bff', '#ff9a3c', '#3cc9a0', '#ff74ad', '#6aa8ff', '#b0135e', '#c8e64a', '#04aebe', '#ffb35c', '#e85d75']
const DAYS_COLOR: Record<string, string> = { '1-4': '#ff2e88', '2-5': '#16e0f2', '3-6': '#ffd400', '1-3': '#9b7bff', '1-5': '#3cc9a0' }
const SURGE_COLOR: Record<string, string> = { A: '#b0135e', B: '#ff2e88', C: '#ff74ad', D: '#ffb35c', E: '#ffd400' }
const FLOOD_COLOR: Record<string, string> = { VE: '#04aebe', AE: '#16e0f2', AH: '#7cf0fa', AO: '#7cf0fa', A: '#7cf0fa' }
const PLACE_COLOR: Record<string, string> = { fire: '#ff2e88', police: '#2b7bff', hospital: '#ffffff', library: '#ffd400', park: '#3cc9a0' }

/** Below this zoom a lens has too much detail to be worth drawing. */
const MIN_ZOOM: Record<LensId, number> = { garbage: 11, flood: 10, surge: 0, commission: 0, polling: 12, elementary: 10, places: 0, bus: 0 }

let lib: Promise<typeof ML> | null = null
function maplibre(): Promise<typeof ML> {
  const url = LIB
  lib ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<typeof ML>).catch((e) => {
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

/** Starts the map's downloads early (the library and the style), so opening it feels instant. */
export function warmMap() {
  void maplibre().catch(() => {})
  void sandStyle()
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const match = (prop: string, colors: Record<string, string>, fallback: string) =>
  ['match', ['get', prop], ...Object.entries(colors).flat(), fallback] as unknown as ML.ExpressionSpecification

export function AddressMap({
  at,
  copy,
  version,
  initialLens = 'garbage',
  onLens,
}: {
  at: LatLng | null
  copy: MapCopy
  /** The data version: part of every tile URL, so a refresh is a new address. */
  version: string
  initialLens?: LensId
  onLens?: (lens: LensId) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<ML.Map | null>(null)
  const [lens, setLens] = useState<LensId>(initialLens)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState(at ? 14.5 : 9)
  const [visible, setVisible] = useState(false)
  const [full, setFull] = useState(false)
  const lensRef = useRef(lens)

  const dayLabel = (key: string) => {
    const text = key
      .split('-')
      .map((d) => copy.days[Number(d)] ?? '')
      .join(copy.and)
    return text ? text[0].toUpperCase() + text.slice(1) : copy.otherDays
  }

  function show(m: ML.Map, which: LensId) {
    for (const id of LENSES) {
      const v = id === which ? 'visible' : 'none'
      for (const layer of LAYER_IDS[id]) if (m.getLayer(layer)) m.setLayoutProperty(layer, 'visibility', v)
    }
  }

  function popup(m: ML.Map, L: typeof ML, e: ML.MapMouseEvent) {
    const ids = LAYER_IDS[lensRef.current].filter((id) => m.getLayer(id) && /-(fill|dot)$/.test(id))
    const hit = m.queryRenderedFeatures(e.point, { layers: ids })[0]
    if (!hit) return
    const p = hit.properties ?? {}
    const line = (t: unknown, strong = false) => (t ? `<div style="${strong ? 'font-weight:800;font-size:16px' : 'font-size:14px'}">${esc(t)}</div>` : '')
    const html: Record<string, () => string> = {
      'commission-fill': () => line(`${copy.district} ${p.district}`, true) + line(p.name),
      'surge-fill': () => line(`${copy.surgeZone} ${p.zone}`, true) + line(copy.surgeNote),
      'flood-fill': () => line(`${copy.floodZone} ${p.zone}`, true) + line(String(p.zone).startsWith('V') ? copy.floodCoastal : copy.floodHigh),
      'garbage-fill': () => line(dayLabel(String(p.days)), true),
      'precinct-fill': () => line(`${copy.precinct} ${p.precinct}`, true),
      'polling-dot': () => line(copy.pollingPlace) + line(p.name, true) + line(p.address) + line(`${copy.precinct} ${p.precinct}`),
      'elementary-fill': () => line(copy.schoolZone) + line(p.name, true),
      'places-dot': () => line(copy.place[p.kind as keyof MapCopy['place']]) + line(p.name, true) + line(p.address) + line(p.phone),
    }
    const body = html[hit.layer.id]?.()
    if (body) new L.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<div style="color:${INK};font-family:var(--body)">${body}</div>`).addTo(m)
  }

  /* ---- build the map only once it's (nearly) on screen ---- */
  useEffect(() => {
    const el = box.current
    if (!el) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let alive = true
    let m: ML.Map | null = null
    Promise.all([maplibre(), sandStyle()])
      .then(([L, doc]) => {
        if (!alive || !box.current) return
        m = new L.Map({
          container: box.current,
          style: (doc as ML.StyleSpecification | null) ?? FALLBACK_STYLE,
          ...(at ? { center: [at[1], at[0]] as [number, number], zoom: 14.5 } : { bounds: COUNTY, fitBoundsOptions: { padding: 12 } }),
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          minZoom: 8,
          maxZoom: 18,
          // A 3x phone screen drawn at 2x looks the same and costs up to half the work.
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          fadeDuration: 120,
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
        m.addControl(new L.NavigationControl({ showCompass: false }), 'top-right')
        map.current = m

        m.on('load', () => {
          if (!alive || !m) return
          if (!doc) inkAndSand(m)
          addLayers(m, version, dayLabel)
          show(m, lensRef.current)
          if (at) {
            const pin = document.createElement('div')
            pin.className = `${rm.pin} ${rm.pinYou}`
            pin.innerHTML = `<span class="${rm.pinLabel}">${esc(copy.you)}</span><span class="${rm.pinHead}" aria-hidden="true"></span>`
            new L.Marker({ element: pin, anchor: 'bottom' }).setLngLat([at[1], at[0]]).addTo(m)
          }
          setZoom(m.getZoom())
          setReady(true)
        })
        m.on('zoomend', () => m && setZoom(m.getZoom()))
        m.on('click', (e) => m && popup(m, L, e))
      })
      .catch(() => setFailed(true))
    return () => {
      alive = false
      m?.remove()
      map.current = null
    }
    // Built once; lens, full screen and size are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  /* ---- switching layers: visibility only, nothing to download ---- */
  useEffect(() => {
    lensRef.current = lens
    onLens?.(lens)
    if (map.current && ready) show(map.current, lens)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, ready])

  /* ---- full screen: the map takes the viewport, one finger moves it ---- */
  useEffect(() => {
    const m = map.current
    if (m) {
      if (full) m.cooperativeGestures.disable()
      else m.cooperativeGestures.enable()
      requestAnimationFrame(() => m.resize())
    }
    if (!full) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // The phone's back button closes full screen instead of leaving the page.
    window.history.pushState({ mapFull: true }, '')
    const onPop = () => setFull(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && window.history.back()
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
    }
  }, [full])

  const close = () => (window.history.state?.mapFull ? window.history.back() : setFull(false))
  const legend = legendFor(lens, copy, dayLabel)
  const tooFar = ready && zoom < MIN_ZOOM[lens]

  return (
    <div
      className={`${s.mapBlock} ${full ? s.mapFull : ''}`}
      role={full ? 'dialog' : undefined}
      aria-modal={full || undefined}
      aria-label={full ? copy.label : undefined}
    >
      <div className={s.chipsRow}>
        <div className={s.chips} role="toolbar" aria-label={copy.layers}>
          {LENSES.map((id) => (
            <button key={id} type="button" className={s.chip} aria-pressed={lens === id} onClick={() => setLens(id)}>
              {copy.lens[id]}
            </button>
          ))}
        </div>
        {full ? (
          <button type="button" className={s.closeFull} onClick={close}>
            ✕ {copy.closeFull}
          </button>
        ) : null}
      </div>
      <div className={`${rm.wrap} ${s.mapWrap}`}>
        <div ref={box} className={`${rm.map} ${s.mapCanvas}`} role="region" aria-label={copy.label} />
        {!full && ready ? (
          <button type="button" className={s.fullBtn} onClick={() => setFull(true)}>
            ⤢ {copy.fullScreen}
          </button>
        ) : null}
        {tooFar ? <p className={`${rm.hint} ${full ? '' : s.hintBelow}`}>{copy.closer}</p> : null}
        {!ready && !failed ? <p className={rm.status}>{copy.loading}</p> : null}
        {failed ? <p className={rm.status}>{copy.failed}</p> : null}
      </div>
      <p className={s.mapHint}>{copy.hint[lens]}</p>
      {legend.length ? (
        <ul className={s.legend}>
          {legend.map(([color, text]) => (
            <li key={text}>
              <span className={s.swatch} style={{ background: color }} aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

const LAYER_IDS: Record<LensId, string[]> = {
  garbage: ['garbage-fill', 'garbage-line', 'garbage-label'],
  flood: ['flood-fill', 'flood-line'],
  surge: ['surge-fill', 'surge-line', 'surge-label'],
  commission: ['commission-fill', 'commission-line', 'commission-label'],
  polling: ['precinct-fill', 'precinct-line', 'precinct-label', 'polling-dot', 'polling-label'],
  elementary: ['elementary-fill', 'elementary-line', 'elementary-label'],
  places: ['places-dot', 'places-label'],
  bus: ['bus-line'],
}

function addLayers(m: ML.Map, version: string, dayLabel: (k: string) => string) {
  m.addSource('civic', {
    type: 'vector',
    tiles: [`${window.location.origin}/api/tiles/{z}/{x}/{y}?v=${version}`],
    minzoom: 8,
    maxzoom: 14,
    attribution: 'Miami-Dade County, FEMA, City of Hialeah, City of Miami',
  })
  m.addSource('bus', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: TRANSIT.routes.map((r) => ({
        type: 'Feature',
        properties: { color: r.slug === 'flamingo' ? '#ff2e88' : '#16e0f2' },
        geometry: { type: 'LineString', coordinates: r.path.map(([lat, lng]) => [lng, lat]) },
      })),
    },
  })
  const hidden = { visibility: 'none' as const }
  const text = { 'text-color': INK, 'text-halo-color': CREAM, 'text-halo-width': 2 }
  const on = (layer: string, min = 0) => ({ source: 'civic', 'source-layer': layer, minzoom: min })
  const zone = (id: string, min: number, color: ML.ExpressionSpecification | string, opacity: number, width = 1.4) => {
    // Width 0: no outlines, and no antialiased seams where pieces of one zone meet.
    m.addLayer({ id: `${id}-fill`, type: 'fill', ...on(id, min), layout: hidden, paint: { 'fill-color': color, 'fill-opacity': opacity, 'fill-antialias': width > 0 } })
    m.addLayer({ id: `${id}-line`, type: 'line', ...on(id, min), layout: hidden, paint: { 'line-color': INK, 'line-width': width, 'line-opacity': width > 0 ? 0.7 : 0 } })
  }
  const label = (id: string, field: unknown, size: number, min = 0) =>
    m.addLayer({
      id: `${id}-label`,
      type: 'symbol',
      ...on('labels', min),
      filter: ['==', ['get', 'lens'], id],
      layout: { ...hidden, 'text-field': field as ML.ExpressionSpecification, 'text-font': FONT, 'text-size': size, 'text-max-width': 10 },
      paint: text,
    })

  zone('garbage', MIN_ZOOM.garbage, match('days', DAYS_COLOR, '#cdbb94'), 0.42)
  label('garbage', ['match', ['get', 'days'], ...Object.keys(DAYS_COLOR).flatMap((k) => [k, dayLabel(k)]), ''], 13, 13)
  zone('flood', MIN_ZOOM.flood, match('zone', FLOOD_COLOR, '#7cf0fa'), 0.55)
  // The county draws surge zones as a grid of small cells: outlined, they read as graph paper.
  zone('surge', 0, match('zone', SURGE_COLOR, '#ffd400'), 0.45, 0)
  label('surge', ['get', 'zone'], 18, 11)
  zone('commission', 0, ['to-color', ['at', ['%', ['-', ['get', 'district'], 1], PALETTE.length], ['literal', PALETTE]]] as unknown as ML.ExpressionSpecification, 0.38, 2.6)
  label('commission', ['concat', 'D', ['to-string', ['get', 'district']], '\n', ['get', 'name']], 14)
  zone('precinct', MIN_ZOOM.polling, 'rgba(0,0,0,0)', 1, 1.6)
  label('precinct', ['to-string', ['get', 'precinct']], 12, 14)
  m.addLayer({
    id: 'polling-dot',
    type: 'circle',
    ...on('polling', MIN_ZOOM.polling),
    layout: hidden,
    paint: { 'circle-radius': 8, 'circle-color': '#ffd400', 'circle-stroke-color': INK, 'circle-stroke-width': 2.5 },
  })
  m.addLayer({
    id: 'polling-label',
    type: 'symbol',
    ...on('polling', 14),
    layout: { ...hidden, 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-max-width': 10 },
    paint: text,
  })
  zone('elementary', MIN_ZOOM.elementary, ['to-color', ['at', ['get', 'c'], ['literal', PALETTE]]] as unknown as ML.ExpressionSpecification, 0.32)
  label('elementary', ['get', 'name'], 12, 12)
  m.addLayer({
    id: 'places-dot',
    type: 'circle',
    ...on('places'),
    layout: hidden,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 8], 'circle-color': match('kind', PLACE_COLOR, '#ffffff'), 'circle-stroke-color': INK, 'circle-stroke-width': 2 },
  })
  m.addLayer({
    id: 'places-label',
    type: 'symbol',
    ...on('places', 14),
    layout: { ...hidden, 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-max-width': 10 },
    paint: text,
  })
  m.addLayer({
    id: 'bus-line',
    type: 'line',
    source: 'bus',
    layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'] as ML.ExpressionSpecification, 'line-width': 5 },
  })
  // City limits stay on under every layer: they're how people find their bearings.
  m.addLayer({ id: 'cities-line', type: 'line', ...on('cities'), paint: { 'line-color': INK, 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.55 } })
  m.addLayer({
    id: 'cities-label',
    type: 'symbol',
    ...on('labels'),
    maxzoom: 12.5,
    filter: ['==', ['get', 'lens'], 'cities'],
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 },
    paint: { ...text, 'text-opacity': 0.75 },
  })
}

function legendFor(lens: LensId, copy: MapCopy, dayLabel: (k: string) => string): [string, string][] {
  switch (lens) {
    case 'garbage':
      return [...Object.entries(DAYS_COLOR).map(([k, c]) => [c, dayLabel(k)] as [string, string]), ['#cdbb94', copy.otherDays]]
    case 'flood':
      return [
        [FLOOD_COLOR.VE, `VE · ${copy.floodCoastal}`],
        [FLOOD_COLOR.AE, `AE · ${copy.floodHigh}`],
        [FLOOD_COLOR.AH, `AH / A · ${copy.floodHigh}`],
      ]
    case 'surge':
      return Object.entries(SURGE_COLOR).map(([z, c]) => [c, `${copy.surgeZone} ${z}`])
    case 'polling':
      return [['#ffd400', copy.pollingPlace]]
    case 'places':
      return Object.entries(PLACE_COLOR).map(([k, c]) => [c, copy.place[k as keyof MapCopy['place']]])
    case 'bus':
      return [
        ['#ff2e88', `Flamingo · ${copy.free}`],
        ['#16e0f2', `Marlin · ${copy.free}`],
      ]
    default:
      return []
  }
}
