import type { LatLng } from './transitMath'

/**
 * Walking directions to a point, in Apple Maps, for visitors on an Apple
 * device. The site never sends anyone to Google Maps (owner, Nov 10: it is the
 * competitor; the site's own maps and trip planner do that job), so on any
 * other device there is no walking link at all: the stop is on our map.
 */
export const APPLE_DEVICE = /iphone|ipad|ipod|macintosh/i

export function appleWalkHref(to: LatLng, from?: LatLng | null): string {
  const d = `${to[0]},${to[1]}`
  return `https://maps.apple.com/?${from ? `saddr=${from[0]},${from[1]}&` : ''}daddr=${d}&dirflg=w`
}
