import type { Media } from '../payload-types'

/**
 * Build a `srcSet` from the variants Payload generated on upload.
 *
 * `Media.upload.imageSizes` asks for three — `thumbnail` 400w, `card` 828w,
 * `hero` 1920w — but Sharp **skips any target wider than the original**, so what
 * a document actually carries varies: a 1600px storefront gets thumbnail and
 * card but no hero, `havana-1920.webp` gets all three, and a 353px mascot gets
 * none at all. Reading the three names directly would therefore emit `undefined
 * 1920w` for most of the library.
 *
 * So the set is assembled from whatever exists, plus the original, deduped by
 * width — `havana-1920` *is* its own hero, and listing it twice would be dead
 * bytes in the markup.
 *
 * Returns undefined below two candidates, where a `srcSet` cannot help and the
 * plain `src` is the honest answer.
 */
export function buildSrcSet(doc: Media | null | undefined): string | undefined {
  if (!doc) return undefined

  const byWidth = new Map<number, string>()
  for (const variant of Object.values(doc.sizes ?? {})) {
    if (variant?.url && variant.width) byWidth.set(variant.width, variant.url)
  }
  if (doc.url && doc.width) byWidth.set(doc.width, doc.url)

  if (byWidth.size < 2) return undefined

  return Array.from(byWidth.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([width, url]) => `${url} ${width}w`)
    .join(', ')
}

/**
 * The shell is capped at 1280 with padding either side, so a slot spanning the
 * content column is ~1200px once the viewport is wider than that, and 100vw
 * below it. Shared because the four hero slots — business, event, story, city —
 * all resolve to the same measurement.
 */
export const FULL_WIDTH_SIZES = '(min-width: 1280px) 1200px, 100vw'
