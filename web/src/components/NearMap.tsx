'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import type * as ML from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import type { LatLng } from '../lib/transitMath'
import type { NearbyRoute, Network } from '../lib/tripPlan'
import { FALLBACK_STYLE, maplibre, sandStyle } from './mapLib'
import b from './bus.module.css'
import rm from './ridemap.module.css'

/**
 * "The buses near me" as a picture, at the top of the routes hub once the
 * visitor has shared where they are: them, the routes they can walk to (each
 * in its own colour, the same as its row below), the stop of each they'd
 * walk to, and those routes' buses where Swiftly says they are.
 *
 * A picture, not a tool: it takes no gestures (the page scrolls over it), and
 * the rows under it open each route's full map. The buses come from the
 * server's shared copy of the feed (api/transit/county-vehicles), one request
 * per route every 15 s while the page is in view.
 */

const INK = '#0c0f14'
const CREAM = '#fff6e5'
/** One colour per nearby route, in the order the rows list them. */
export const NEAR_COLORS = ['#ff2e88', '#16e0f2', '#ffd400', '#19c26b', '#a46bff', '#ff8a1f']
const NEAR_FG = [CREAM, INK, INK, INK, CREAM, INK]

const lngLat = ([lat, lng]: LatLng): [number, number] => [lng, lat]
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

type Bus = { id: string; dir: string; lat: number; lng: number; bearing: number; ts: number }

export function NearMap({
  lang,
  from,
  near,
  net,
}: {
  lang: Lang
  from: LatLng
  near: NearbyRoute[]
  net: Network
}) {
  const c = busCopy(lang)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<ML.Map | null>(null)
  const ml = useRef<typeof ML | null>(null)
  const markers = useRef<ML.Marker[]>([])
  const busMarkers = useRef(new Map<string, ML.Marker>())
  const [ready, setReady] = useState(false)
  const [buses, setBuses] = useState<{ slug: string; bus: Bus }[]>([])

  /* ---- the map, once ---- */
  useEffect(() => {
    let alive = true
    let m: ML.Map | null = null
    Promise.all([maplibre(), sandStyle()])
      .then(([L, doc]) => {
        if (!alive || !box.current) return
        ml.current = L
        m = new L.Map({
          container: box.current,
          style: (doc as ML.StyleSpecification | null) ?? FALLBACK_STYLE,
          center: lngLat(from),
          zoom: 14,
          interactive: false,
          attributionControl: { compact: true },
        })
        map.current = m
        m.on('load', () => {
          if (!alive || !m) return
          m.addSource('near-lines', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          })
          m.addLayer({
            id: 'near-casing',
            type: 'line',
            source: 'near-lines',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': INK, 'line-width': 6 },
          })
          m.addLayer({
            id: 'near-fill',
            type: 'line',
            source: 'near-lines',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ['get', 'color'], 'line-width': 3.2 },
          })
          box.current
            ?.querySelector('.maplibregl-compact-show')
            ?.classList.remove('maplibregl-compact-show')
          setReady(true)
        })
      })
      .catch(() => {})
    const have = busMarkers.current
    return () => {
      alive = false
      have.clear()
      markers.current = []
      m?.remove()
      map.current = null
    }
    // The map is made once; what's on it follows below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- the visitor, the routes near them, and the stop of each ---- */
  const key = near.map((r) => r.slug).join(',')
  useEffect(() => {
    const m = map.current
    const L = ml.current
    if (!ready || !m || !L) return
    const lines = near.flatMap((r, k) => {
      const route = net.routes.find((x) => x.slug === r.slug)
      return (route?.directions ?? []).map((d) => ({
        type: 'Feature' as const,
        properties: { color: NEAR_COLORS[k % NEAR_COLORS.length] },
        geometry: { type: 'LineString' as const, coordinates: d.path.map(lngLat) },
      }))
    })
    ;(m.getSource('near-lines') as ML.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: lines,
    })
    for (const mk of markers.current) mk.remove()
    markers.current = []
    const bounds = new L.LngLatBounds(lngLat(from), lngLat(from))
    near.forEach((r, k) => {
      const st = net.routes
        .find((x) => x.slug === r.slug)
        ?.directions.find((d) => d.id === r.dirs[0].dir)?.stations[r.dirs[0].index]
      if (!st) return
      bounds.extend(lngLat(st.at))
      const el = document.createElement('span')
      el.className = b.nearStop
      el.style.position = 'absolute'
      el.style.setProperty('--c', NEAR_COLORS[k % NEAR_COLORS.length])
      el.style.setProperty('--fg', NEAR_FG[k % NEAR_FG.length])
      el.setAttribute('aria-hidden', 'true')
      el.textContent = r.number ?? 'T'
      markers.current.push(
        new L.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat(st.at)).addTo(m),
      )
    })
    const you = document.createElement('div')
    you.className = `${rm.pin} ${rm.pinYou}`
    you.innerHTML = `<span class="${rm.pinLabel}">${esc(c.mapYou)}</span><span class="${rm.pinHead}" aria-hidden="true"></span>`
    markers.current.push(
      new L.Marker({ element: you, anchor: 'bottom' }).setLngLat(lngLat(from)).addTo(m),
    )
    m.resize()
    m.fitBounds(bounds, {
      padding: { top: 50, bottom: 30, left: 40, right: 40 },
      maxZoom: 16,
      duration: 0,
    })
    // `key` stands for the list of routes; `from` moves the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, from])

  /* ---- their buses, every 15 s while the page is in view ---- */
  useEffect(() => {
    if (!ready || !near.length) return
    let alive = true
    const read = () => {
      if (document.visibilityState !== 'visible') return
      Promise.all(
        near.map((r) =>
          r.kind === 'bus'
            ? fetch(`/api/transit/county-vehicles?route=${encodeURIComponent(r.slug)}`)
                .then((res) => (res.ok ? res.json() : null))
                .then((j: { live: { buses: Bus[] } | null } | null) =>
                  (j?.live?.buses ?? []).map((bus) => ({ slug: r.slug, bus })),
                )
                .catch(() => [])
            : Promise.resolve([]),
        ),
      ).then((all) => alive && setBuses(all.flat()))
    }
    read()
    const id = setInterval(read, 15_000)
    return () => {
      alive = false
      clearInterval(id)
    }
    // `key` stands for the list of routes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key])

  useEffect(() => {
    const m = map.current
    const L = ml.current
    if (!ready || !m || !L) return
    const have = busMarkers.current
    const seen = new Set<string>()
    for (const { slug, bus } of buses) {
      const k = near.findIndex((r) => r.slug === slug)
      if (k < 0) continue
      const id = `${slug}:${bus.id}`
      seen.add(id)
      let mk = have.get(id)
      if (!mk) {
        const el = document.createElement('span')
        el.className = rm.bus
        el.style.position = 'absolute'
        el.setAttribute('aria-hidden', 'true')
        mk = new L.Marker({ element: el, anchor: 'center' }).setLngLat([bus.lng, bus.lat]).addTo(m)
        have.set(id, mk)
      } else mk.setLngLat([bus.lng, bus.lat])
      const el = mk.getElement()
      el.style.setProperty('--c', NEAR_COLORS[k % NEAR_COLORS.length])
      el.style.setProperty('--fg', NEAR_FG[k % NEAR_FG.length])
      el.style.setProperty('--bearing', `${bus.bearing}deg`)
      const n = near[k].number ?? 'T'
      el.innerHTML = `<span class="${rm.arrow}"></span><span class="${rm.letter} ${n.length > 2 ? b.busNumSmall : ''}">${esc(n)}</span>`
    }
    for (const [id, mk] of have) {
      if (seen.has(id)) continue
      mk.remove()
      have.delete(id)
    }
  }, [ready, buses, near])

  return (
    <div className={b.nearMapWrap}>
      <div ref={box} className={b.nearMap} role="img" aria-label={c.finderMapLabel} />
    </div>
  )
}
