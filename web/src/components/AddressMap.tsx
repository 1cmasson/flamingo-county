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
 * Layers come from /api/map/<layer>, a window at a time for the big ones, so a
 * phone zoomed into one block never downloads the county's flood map. The
 * address, when there is one, is a pin; nothing about the visitor is sent.
 * Everything the map shows is also in the list beside it.
 */


const STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const LIB = '/vendor/maplibre/maplibre-gl.mjs'
const FONT = ['Noto Sans Bold']
const INK = '#0c0f14'
const CREAM = '#fff6e5'
/** Miami-Dade, west/south/east/north. */
const COUNTY: [number, number, number, number] = [-80.87, 25.13, -80.12, 25.98]

/** Bright, distinct, in the site's family: districts and school zones cycle through it. */
const PALETTE = ['#ff2e88', '#16e0f2', '#ffd400', '#9b7bff', '#ff9a3c', '#3cc9a0', '#ff74ad', '#6aa8ff', '#b0135e', '#c8e64a', '#04aebe', '#ffb35c', '#e85d75']
/** Pickup schedules by their weekdays ("1-4" is Monday and Thursday). */
const DAYS_COLOR: Record<string, string> = { '1-4': '#ff2e88', '2-5': '#16e0f2', '3-6': '#ffd400', '1-3': '#9b7bff', '1-5': '#3cc9a0' }
const SURGE_COLOR: Record<string, string> = { A: '#b0135e', B: '#ff2e88', C: '#ff74ad', D: '#ffb35c', E: '#ffd400' }
const FLOOD_COLOR: Record<string, string> = { VE: '#04aebe', AE: '#16e0f2', AH: '#7cf0fa', AO: '#7cf0fa', A: '#7cf0fa' }
const PLACE_COLOR: Record<string, string> = { fire: '#ff2e88', police: '#2b7bff', hospital: '#ffffff', library: '#ffd400', park: '#3cc9a0' }

/** Which server layers each lens draws, and below what zoom it waits to be asked. */
const SOURCES: Record<LensId, { layers: string[]; minZoom: number; window: boolean }> = {
  garbage: { layers: ['garbage'], minZoom: 11, window: true },
  flood: { layers: ['flood'], minZoom: 11, window: true },
  surge: { layers: ['surge'], minZoom: 0, window: false },
  commission: { layers: ['commission'], minZoom: 0, window: false },
  polling: { layers: ['precinct', 'polling'], minZoom: 12, window: true },
  elementary: { layers: ['elementary'], minZoom: 10, window: true },
  places: { layers: ['places'], minZoom: 0, window: false },
  bus: { layers: [], minZoom: 0, window: false },
}

let lib: Promise<typeof ML> | null = null
function maplibre(): Promise<typeof ML> {
  const url = LIB
  lib ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<typeof ML>).catch((e) => {
    lib = null
    throw e
  })
  return lib
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)
type Collection = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: Record<string, unknown> | null; geometry: unknown }[] }
const empty: Collection = { type: 'FeatureCollection', features: [] }
const match = (prop: string, colors: Record<string, string>, fallback: string) =>
  ['match', ['get', prop], ...Object.entries(colors).flat(), fallback] as unknown as ML.ExpressionSpecification

export function AddressMap({
  at,
  copy,
  initialLens = 'garbage',
  onLens,
}: {
  at: LatLng | null
  copy: MapCopy
  initialLens?: LensId
  onLens?: (lens: LensId) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<ML.Map | null>(null)
  const ml = useRef<typeof ML | null>(null)
  const [lens, setLens] = useState<LensId>(initialLens)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tooFar, setTooFar] = useState(false)
  const lensRef = useRef(lens)
  const loaded = useRef(new Map<string, string>())

  const dayLabel = (key: string) => {
    const names = key.split('-').map((d) => copy.days[Number(d)] ?? '')
    const text = names.join(copy.and)
    return text ? text[0].toUpperCase() + text.slice(1) : copy.otherDays
  }

  /** Fetch the current lens's data for what's on screen, if it isn't already there. */
  async function refresh(m: ML.Map) {
    const cur = lensRef.current
    const src = SOURCES[cur]
    const far = m.getZoom() < src.minZoom
    setTooFar(far)
    if (far) return
    const b = m.getBounds()
    // A window a bit bigger than the screen, snapped so small pans reuse it.
    const snap = (v: number, f: (x: number) => number) => f(v * 50) / 50
    const bbox = [snap(b.getWest(), Math.floor), snap(b.getSouth(), Math.floor), snap(b.getEast(), Math.ceil), snap(b.getNorth(), Math.ceil)].join(',')
    await Promise.all(src.layers.map((layer) => fill(m, layer, src.window ? bbox : null)))
  }

  async function fill(m: ML.Map, layer: string, bbox: string | null) {
    const key = bbox ?? 'all'
    if (loaded.current.get(layer) === key) return
    loaded.current.set(layer, key)
    try {
      const res = await fetch(`/api/map/${layer}${bbox ? `?bbox=${bbox}` : ''}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as Collection
      for (const f of data.features) {
        const p = (f.properties ??= {})
        if (layer === 'garbage') p.label = dayLabel(String(p.days ?? ''))
        if (layer === 'elementary') p.color = PALETTE[Math.abs(hash(String(p.name))) % PALETTE.length]
        if (layer === 'commission') p.color = PALETTE[(Number(p.district) - 1) % PALETTE.length]
      }
      ;(m.getSource(layer) as ML.GeoJSONSource | undefined)?.setData(data as ML.GeoJSONSourceSpecification['data'])
    } catch {
      loaded.current.delete(layer)
    }
  }

  function popup(m: ML.Map, L: typeof ML, e: ML.MapMouseEvent) {
    const ids = LAYER_IDS[lensRef.current].filter((id) => m.getLayer(id) && !id.endsWith('-label') && !id.endsWith('-line'))
    const hit = m.queryRenderedFeatures(e.point, { layers: ids })[0]
    if (!hit) return
    const p = hit.properties ?? {}
    const line = (t: unknown, strong = false) => (t ? `<div style="${strong ? 'font-weight:800;font-size:16px' : 'font-size:14px'}">${esc(t)}</div>` : '')
    const html =
      hit.layer.id === 'commission-fill'
        ? line(`${copy.district} ${p.district}`, true) + line(p.name)
        : hit.layer.id === 'surge-fill'
          ? line(`${copy.surgeZone} ${p.zone}`, true) + line(copy.surgeNote)
          : hit.layer.id === 'flood-fill'
            ? line(`${copy.floodZone} ${p.zone}`, true) + line(String(p.zone).startsWith('V') ? copy.floodCoastal : copy.floodHigh)
            : hit.layer.id === 'garbage-fill'
              ? line(p.label, true)
              : hit.layer.id === 'precinct-fill'
                ? line(`${copy.precinct} ${p.precinct}`, true)
                : hit.layer.id === 'polling-dot'
                  ? line(copy.pollingPlace) + line(p.name, true) + line(p.address) + line(`${copy.precinct} ${p.precinct}`)
                  : hit.layer.id === 'elementary-fill'
                    ? line(copy.schoolZone) + line(p.name, true)
                    : hit.layer.id === 'places-dot'
                      ? line(copy.place[p.kind as keyof MapCopy['place']]) + line(p.name, true) + line(p.address) + line(p.phone)
                      : ''
    if (html) new L.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<div style="color:${INK};font-family:var(--body)">${html}</div>`).addTo(m)
  }

  /* ---- the map, once ---- */
  useEffect(() => {
    let alive = true
    let m: ML.Map | null = null
    maplibre()
      .then((L) => {
        if (!alive || !box.current) return
        ml.current = L
        m = new L.Map({
          container: box.current,
          style: STYLE,
          ...(at ? { center: [at[1], at[0]] as [number, number], zoom: 14.5 } : { bounds: COUNTY, fitBoundsOptions: { padding: 12 } }),
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          minZoom: 8,
          maxZoom: 18,
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
          inkAndSand(m)
          addLayers(m)
          if (at) {
            const el = document.createElement('div')
            el.className = `${rm.pin} ${rm.pinYou}`
            el.innerHTML = `<span class="${rm.pinLabel}">${esc(copy.you)}</span><span class="${rm.pinHead}" aria-hidden="true"></span>`
            new L.Marker({ element: el, anchor: 'bottom' }).setLngLat([at[1], at[0]]).addTo(m)
          }
          // City limits stay on under every layer: they're how people find their bearings.
          void fill(m, 'cities', null)
          setReady(true)
        })
        m.on('moveend', () => m && void refresh(m))
        m.on('click', (e) => m && popup(m, L, e))
        m.on('error', (e) => {
          if (!m?.loaded() && String((e as unknown as { error?: { message?: string } }).error?.message ?? '').includes('style')) setFailed(true)
        })
      })
      .catch(() => setFailed(true))
    return () => {
      alive = false
      m?.remove()
      map.current = null
    }
    // The map is built once; lens changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- switching layers ---- */
  useEffect(() => {
    lensRef.current = lens
    onLens?.(lens)
    const m = map.current
    if (!m || !ready) return
    for (const id of LENSES) {
      const v = id === lens ? 'visible' : 'none'
      for (const layer of LAYER_IDS[id]) if (m.getLayer(layer)) m.setLayoutProperty(layer, 'visibility', v)
    }
    void refresh(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens, ready])

  const legend = legendFor(lens, copy, dayLabel)

  return (
    <div className={s.mapBlock}>
      <div className={s.chips} role="toolbar" aria-label={copy.layers}>
        {LENSES.map((id) => (
          <button key={id} type="button" className={s.chip} aria-pressed={lens === id} onClick={() => setLens(id)}>
            {copy.lens[id]}
          </button>
        ))}
      </div>
      <div className={rm.wrap}>
        <div ref={box} className={rm.map} role="region" aria-label={copy.label} />
        {tooFar && ready ? <p className={rm.hint}>{copy.closer}</p> : null}
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

function addLayers(m: ML.Map) {
  for (const id of ['cities', 'garbage', 'flood', 'surge', 'commission', 'precinct', 'polling', 'elementary', 'places']) {
    m.addSource(id, { type: 'geojson', data: empty as ML.GeoJSONSourceSpecification['data'] })
  }
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
  const label = (field: ML.ExpressionSpecification, size = 13, extra: Partial<ML.SymbolLayerSpecification['layout']> = {}) => ({
    layout: { ...hidden, 'text-field': field, 'text-font': FONT, 'text-size': size, 'text-max-width': 10, ...extra },
    paint: { 'text-color': INK, 'text-halo-color': CREAM, 'text-halo-width': 2 },
  })
  const fillLayer = (id: string, color: ML.ExpressionSpecification | string, opacity: number) => {
    m.addLayer({ id: `${id}-fill`, type: 'fill', source: id, layout: hidden, paint: { 'fill-color': color, 'fill-opacity': opacity } })
    m.addLayer({ id: `${id}-line`, type: 'line', source: id, layout: hidden, paint: { 'line-color': INK, 'line-width': 1.4, 'line-opacity': 0.7 } })
  }

  fillLayer('garbage', match('days', DAYS_COLOR, '#cdbb94'), 0.42)
  m.addLayer({ id: 'garbage-label', type: 'symbol', source: 'garbage', minzoom: 13, ...label(['get', 'label'] as ML.ExpressionSpecification) })
  fillLayer('flood', match('zone', FLOOD_COLOR, '#7cf0fa'), 0.55)
  fillLayer('surge', match('zone', SURGE_COLOR, '#ffd400'), 0.45)
  m.addLayer({ id: 'surge-label', type: 'symbol', source: 'surge', minzoom: 11, ...label(['get', 'zone'] as ML.ExpressionSpecification, 18) })
  fillLayer('commission', ['get', 'color'] as ML.ExpressionSpecification, 0.38)
  m.setPaintProperty('commission-line', 'line-width', 2.6)
  m.addLayer({
    id: 'commission-label',
    type: 'symbol',
    source: 'commission',
    ...label(['concat', 'D', ['to-string', ['get', 'district']], '\n', ['get', 'name']] as ML.ExpressionSpecification, 14),
  })
  fillLayer('precinct', 'rgba(0,0,0,0)', 1)
  m.setPaintProperty('precinct-line', 'line-width', 1.6)
  m.addLayer({ id: 'precinct-label', type: 'symbol', source: 'precinct', minzoom: 14, ...label(['to-string', ['get', 'precinct']] as ML.ExpressionSpecification, 12) })
  m.addLayer({
    id: 'polling-dot',
    type: 'circle',
    source: 'polling',
    layout: hidden,
    paint: { 'circle-radius': 8, 'circle-color': '#ffd400', 'circle-stroke-color': INK, 'circle-stroke-width': 2.5 },
  })
  m.addLayer({ id: 'polling-label', type: 'symbol', source: 'polling', minzoom: 14, ...label(['get', 'name'] as ML.ExpressionSpecification, 12, { 'text-offset': [0, 1.3], 'text-anchor': 'top' }) })
  fillLayer('elementary', ['get', 'color'] as ML.ExpressionSpecification, 0.32)
  m.addLayer({ id: 'elementary-label', type: 'symbol', source: 'elementary', minzoom: 12, ...label(['get', 'name'] as ML.ExpressionSpecification, 12) })
  m.addLayer({
    id: 'places-dot',
    type: 'circle',
    source: 'places',
    layout: hidden,
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 8], 'circle-color': match('kind', PLACE_COLOR, '#ffffff'), 'circle-stroke-color': INK, 'circle-stroke-width': 2 },
  })
  m.addLayer({ id: 'places-label', type: 'symbol', source: 'places', minzoom: 14, ...label(['get', 'name'] as ML.ExpressionSpecification, 12, { 'text-offset': [0, 1.2], 'text-anchor': 'top' }) })
  m.addLayer({
    id: 'bus-line',
    type: 'line',
    source: 'bus',
    layout: { ...hidden, 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'] as ML.ExpressionSpecification, 'line-width': 5 },
  })
  m.addLayer({ id: 'cities-line', type: 'line', source: 'cities', paint: { 'line-color': INK, 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.55 } })
  m.addLayer({
    id: 'cities-label',
    type: 'symbol',
    source: 'cities',
    maxzoom: 12.5,
    // "Unincorporated Miami-Dade" isn't a place anyone looks for; it would only crowd the real names.
    filter: ['!', ['in', 'Unincorporated', ['get', 'name']]],
    layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12, 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 },
    paint: { 'text-color': INK, 'text-halo-color': CREAM, 'text-halo-width': 2, 'text-opacity': 0.75 },
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
