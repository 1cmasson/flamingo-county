import type { Lang } from '../i18n'
import { SITE_TZ } from './dates'

/**
 * The arithmetic every transit page shares, with no data behind it: distance,
 * a walk, Miami's clock. A browser component can import this without pulling
 * a feed's JSON into its bundle (lib/transit.ts and lib/county.ts both do).
 */

export type LatLng = [number, number]

/** Day of week (0 = Sunday) and minutes past midnight, on Miami's clock. */
export function miamiClock(now: Date = new Date()): { dow: number; min: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
  // `hour` can come back as 24 at midnight under hour12:false.
  return { dow, min: (Number(get('hour')) % 24) * 60 + Number(get('minute')) }
}

/** "7:30 PM" / "7:30 p. m." — the way each language writes a clock time. */
export function formatClock(min: number, lang: Lang): string {
  const h24 = Math.floor(min / 60)
  const m = min % 60
  const h = h24 % 12 || 12
  const mm = m ? `:${String(m).padStart(2, '0')}` : ''
  if (lang === 'es') return `${h}${mm} ${h24 < 12 ? 'a. m.' : 'p. m.'}`
  return `${h}${mm} ${h24 < 12 ? 'AM' : 'PM'}`
}

export function meters(a: LatLng, b: LatLng): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Straight-line distance understates a walk on a street grid by roughly a
 * third; 80 m a minute is an unhurried pace. Rounded up, never below one.
 */
export function walkMinutes(m: number): number {
  return Math.max(1, Math.ceil((m * 1.3) / 80))
}
