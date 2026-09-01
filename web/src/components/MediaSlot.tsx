import type { Media } from '../payload-types'
import { buildSrcSet } from '../lib/srcset'

/**
 * Replaces `<image-slot>` — a 65 KB custom element built for the Claude Design
 * canvas (drag/drop, reframing, Unsplash attribution), none of which belongs in
 * a Payload-backed site.
 *
 * An empty slot renders NOTHING. It used to reproduce the canvas element's
 * empty state — a dashed box with a photo icon and the `imageHint` printed
 * inside it — because that is what the deployed site showed at the time, every
 * slot being empty. That has inverted: every listing has a hero now, and the
 * only empty slots left were the two spare tiles in the business page's gallery
 * strip, where three dashed boxes on all eleven pages advertised the absence of
 * photos nobody had promised. Art direction is for the admin, not the reader.
 *
 * `imageHint` is still a field on `listings` and `events` — it tells whoever
 * fills the slot what to shoot. It is simply no longer rendered.
 *
 * Callers own the frame. A slot with no media collapses to nothing inside it,
 * so a caller that draws its own border must not render that border when it
 * has no photo to put in it.
 *
 * `sizes` is worth passing accurately. It is what decides which `srcSet`
 * candidate the browser picks, and it must describe the slot's CSS width — not
 * the image's. Left unset it falls back to `100vw`, which is safe but makes a
 * 300px card pull the 828w variant on every phone.
 */
export function MediaSlot({
  media,
  fit = 'cover',
  className,
  style,
  sizes,
  priority,
}: {
  media?: Media | number | string | null
  fit?: 'cover' | 'contain'
  className?: string
  style?: React.CSSProperties
  sizes?: string
  priority?: boolean
}) {
  const doc = media && typeof media === 'object' ? (media as Media) : null

  if (doc?.url) {
    // Undefined whenever there is only one candidate — a mascot small enough
    // that Payload generated no variants has nothing to choose between, and an
    // empty `sizes` on a lone `src` is just noise in the markup.
    const srcSet = buildSrcSet(doc)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={doc.url}
        alt={doc.alt ?? ''}
        width={doc.width ?? undefined}
        height={doc.height ?? undefined}
        srcSet={srcSet}
        sizes={srcSet ? (sizes ?? '100vw') : undefined}
        loading={priority ? 'eager' : 'lazy'}
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: fit,
          display: 'block',
          ...style,
        }}
      />
    )
  }

  return null
}
