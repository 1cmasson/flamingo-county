'use server'

import { geocodeDetailed, hasStreetNumber } from './geocode'
import type { LatLng } from './transit'

export type LocateResult =
  | { ok: true; at: LatLng; matched: string }
  | { ok: false; error: 'no-number' | 'not-found' }

/**
 * A typed address → coordinates, for "where are you?" on the free-rides pages.
 *
 * Server-side because the Census geocoder sends no CORS headers. Only the typed
 * text leaves the visitor's device; a location from the phone's GPS never comes
 * here at all — the nearest-stop maths for that runs in the browser.
 *
 * Someone in Hialeah types "1201 W 44th Pl", not a full postal address, and the
 * Census can't place a bare street line. So an address with no city and no ZIP
 * is assumed to be in Hialeah, which is the only place these buses run.
 */
export async function locateAddress(q: string): Promise<LocateResult> {
  const raw = String(q ?? '').trim().slice(0, 140)
  if (!hasStreetNumber(raw)) return { ok: false, error: 'no-number' }
  const hasPlace = /,/.test(raw) || /\b\d{5}\b/.test(raw.replace(/^\s*\d+/, ''))
  const hit = await geocodeDetailed(hasPlace ? raw : `${raw}, Hialeah, FL`)
  return hit ? { ok: true, at: hit.at, matched: hit.matched } : { ok: false, error: 'not-found' }
}
