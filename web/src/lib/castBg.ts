import type { City, Media } from '../payload-types'
import { rel } from './data'

/**
 * The panel a city mascot stands on.
 *
 * `fc-data.js` carries a literal `castBg: '#00feff'` on every city, but nothing
 * that draws a mascot actually uses it — `About.dc.html:148` shadows the field
 * with a computed value, and the event pages do the same. The literal is dead
 * data that got imported anyway, and rendering it is what turned all three city
 * panels flat cyan.
 *
 * What the source actually draws is the city's own street photo under a wash of
 * that city's accent at 62%, so the mascot reads against Hialeah pink, Miami
 * Lakes cyan and Little Havana yellow rather than one shared colour. With no
 * photo it falls back to the flat accent — never to `castBg`.
 */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function castBg(city: City | null | undefined): string {
  const accent = city?.accent || '#FF2E88'
  const photo = rel<Media>(city?.photo)
  if (!photo?.url) return accent
  const wash = rgba(accent, 0.62)
  // Position defaults to `center`, matching the source's `c.photoPos || 'center'`.
  return `linear-gradient(${wash},${wash}), url("${photo.url}") ${city?.photoPos || 'center'}/cover no-repeat`
}
