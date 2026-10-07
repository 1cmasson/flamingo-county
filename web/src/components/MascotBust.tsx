import type { CSSProperties } from 'react'
import type { Media } from '../payload-types'
import { buildSrcSet } from '../lib/srcset'

/** The hard drop shadow every mascot carries over a photo. */
export const MASCOT_SHADOW = 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))'

/**
 * A city mascot standing at the side of an image: the site's one way of putting
 * a character on a photo or a poster.
 *
 * The character stands free over the picture, with its hard ink shadow. It is
 * never boxed into a shape: a cyan disc around the mascot on the business page
 * was retired for this, at the owner's request, so the masthead reads like the
 * directory card it opens from.
 *
 * Two ways to stand it:
 *
 * - `top` hangs the figure from a point inside the frame. Make it taller than
 *   what is left below that point and the frame's `overflow: hidden` crops it at
 *   the waist, which is what makes it a bust leaning into the picture (the
 *   directory card, the business masthead).
 * - `bottom` stands the figure on the frame's lower edge (default -14, so its
 *   feet sink just past the border), for a full figure beside a poster (event
 *   and season pages).
 *
 * The parent owns the frame: it must be `position: relative`, and for a bust
 * also `overflow: hidden`. The mascot is decoration, so it is `alt=""` and
 * takes no pointer events. Keep text and badges out of the side it stands on;
 * callers reserve that room themselves.
 */
export function MascotBust({
  media,
  side = 'right',
  inset = 12,
  height,
  top,
  bottom,
  maxWidth,
  shadow = MASCOT_SHADOW,
  sizes = '200px',
}: {
  media: Media | null | undefined
  /** Which side of the frame it stands on. */
  side?: 'left' | 'right'
  /** Distance from that side. */
  inset?: number | string
  /** The figure's full height (before any crop). */
  height: number | string
  /** Hang the figure from here: a bust, cropped by the parent's overflow. */
  top?: number | string
  /** Stand the figure on the frame's lower edge. Ignored when `top` is set. */
  bottom?: number | string
  maxWidth?: number | string
  shadow?: string
  /** The rendered width, for the srcset choice. */
  sizes?: string
}) {
  if (!media?.url) return null
  const srcSet = buildSrcSet(media)
  const style: CSSProperties = {
    position: 'absolute',
    [side]: inset,
    ...(top !== undefined ? { top } : { bottom: bottom ?? -14 }),
    height,
    width: 'auto',
    maxWidth,
    objectFit: 'contain',
    objectPosition: top !== undefined ? 'top' : 'bottom',
    pointerEvents: 'none',
    filter: shadow,
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      data-mascot-bust
      src={media.url}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt=""
      style={style}
    />
  )
}
