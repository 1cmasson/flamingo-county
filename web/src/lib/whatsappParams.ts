import type { LatLng } from './transitMath'

/**
 * A location someone shared on WhatsApp (Twilio's Latitude/Longitude), or
 * null. Only points in or near Miami-Dade count; anything else is treated as
 * no location (the bus planner only knows Miami-Dade).
 */
export function readLocation(params: URLSearchParams): LatLng | null {
  const lat = Number(params.get('Latitude'))
  const lng = Number(params.get('Longitude'))
  if (!params.get('Latitude') || !params.get('Longitude') || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < 25.1 || lat > 26.4 || lng < -80.9 || lng > -80.0) return null
  return [lat, lng]
}
