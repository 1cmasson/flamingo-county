import type { Payload, PayloadRequest } from 'payload'
import sharp from 'sharp'

/**
 * Artwork Flamingo County made (a drawn cover, our own photo), into the public
 * `media` library. Three ways in share this file: the one-shot MCP tool
 * (`hqAddSiteArtworkFromUpload`, base64 in the call), the upload link
 * (`hqStartSiteArtworkUpload`, then a PUT to /api/hq/artwork-upload/<token>)
 * and the chunked fallback (lib/artworkUpload.ts). Whichever way the bytes
 * arrive, they are checked and stored here, the same way.
 */

/** Who made it. Nothing else can be stored this way: an archive's photo goes through hqAddSiteMediaFromUrl. */
export const ARTWORK_ORIGINS = ['own-illustration', 'own-photo'] as const
export type ArtworkOrigin = (typeof ARTWORK_ORIGINS)[number]
/** The site's image budget (scripts/check-image-budget.mjs), applied to the stored original. */
export const ARTWORK_BUDGET = 400 * 1024
/** What may be sent: a full-size PNG from the drawing pipeline is several MB before it is compressed here. */
export const ARTWORK_UPLOAD_LIMIT = 25 * 1024 * 1024
/** The credit our artwork carries: it is ours, so the name is not a parameter. */
export const ARTWORK_CREDIT = 'Flamingo County'
/** Narrower than this and the 1200-wide link card would blow it up (the same floor as the archive tool). */
export const ARTWORK_MIN_WIDTH = 1000
/** The stored original is cut to this before Payload makes its sizes (the largest is 1920). */
const ARTWORK_MAX_SIDE = 2560
const BASED_ON_MAX = 160
const ALT_MAX = 300
const FILENAME_MAX = 120
const ARTWORK_TYPES = ['image/jpeg', 'image/png'] as const

/**
 * A refusal with the HTTP status the upload route answers with. Over MCP only
 * the message matters; the route needs to tell a bad file (415, 422) from a
 * bad link (404, 410).
 */
export class ArtworkError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message)
    this.name = 'ArtworkError'
  }
}

/** A crop's centre, 0–100; undefined when not given. */
export const focalPoint = (v: unknown, what: string): number | undefined => {
  if (v === undefined || v === null) return undefined
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new ArtworkError(`${what} must be 0–100.`)
  return n
}

/** Everything about a picture except its bytes, as the tools take it. */
export type ArtworkMetaArgs = {
  filename: string
  mimeType: string
  origin: string
  altEs: string
  altEn: string
  /** What it was drawn from, as the credit says it, in each language; "original" for work from nothing. */
  basedOnEs: string
  basedOnEn: string
  focalX?: number
  focalY?: number
}

/** The same, checked and normalized: what an upload link keeps until its file arrives. */
export type ArtworkMeta = {
  filename: string
  mimeType: (typeof ARTWORK_TYPES)[number]
  origin: ArtworkOrigin
  altEs: string
  altEn: string
  basedOnEs: string
  basedOnEn: string
  focalX?: number
  focalY?: number
}

const isOriginal = (v: string) => v.toLowerCase() === 'original'

/**
 * The rules that do not need the file: it must be ours (`origin`), described
 * in both languages, and say what it was drawn from in both, so an
 * illustration drawn from an archive photo keeps that archive's credit.
 */
export function checkArtworkMeta(args: ArtworkMetaArgs): ArtworkMeta {
  if (!(ARTWORK_ORIGINS as readonly string[]).includes(String(args.origin))) {
    throw new ArtworkError(
      `origin must be one of ${ARTWORK_ORIGINS.join(', ')}: this tool is for artwork Flamingo County made. A photo from an archive goes through hqAddSiteMediaFromUrl.`,
    )
  }
  const mimeType = String(args.mimeType)
  if (!(ARTWORK_TYPES as readonly string[]).includes(mimeType)) throw new ArtworkError('mimeType must be image/jpeg or image/png.')
  const filename = String(args.filename ?? '').trim()
  if (!filename || filename.length > FILENAME_MAX) throw new ArtworkError(`filename is required (at most ${FILENAME_MAX} characters).`)
  const altEn = String(args.altEn ?? '').trim()
  const altEs = String(args.altEs ?? '').trim()
  if (!altEn || !altEs) throw new ArtworkError('Alt text is required in both languages (altEs, altEn).')
  if (altEn.length > ALT_MAX || altEs.length > ALT_MAX) throw new ArtworkError(`Alt text too long (at most ${ALT_MAX} characters each).`)
  const basedOnEs = String(args.basedOnEs ?? '').replace(/\s+/g, ' ').trim()
  const basedOnEn = String(args.basedOnEn ?? '').replace(/\s+/g, ' ').trim()
  if (!basedOnEs || !basedOnEn) {
    throw new ArtworkError(
      'basedOnEs and basedOnEn are required: what the artwork was drawn from, as the credit says it (e.g. "basada en fotos del Historic American Buildings Survey (dominio público)"), or "original" for work from nothing.',
    )
  }
  if (basedOnEs.length > BASED_ON_MAX || basedOnEn.length > BASED_ON_MAX) {
    throw new ArtworkError(`basedOn too long (at most ${BASED_ON_MAX} characters each).`)
  }
  const focalX = focalPoint(args.focalX, 'focalX')
  const focalY = focalPoint(args.focalY, 'focalY')
  return {
    filename,
    mimeType: mimeType as ArtworkMeta['mimeType'],
    origin: args.origin as ArtworkOrigin,
    altEs,
    altEn,
    basedOnEs,
    basedOnEn,
    ...(focalX !== undefined ? { focalX } : {}),
    ...(focalY !== undefined ? { focalY } : {}),
  }
}

/** JPEG or PNG, from the first bytes; anything else is null. */
export function sniffImage(b: Buffer): ArtworkMeta['mimeType'] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  return null
}

/**
 * Re-encode to a JPEG within the budget: no metadata carried over, longest side
 * at most 2560, and the quality stepped down until it fits. Refuses rather than
 * crushing it: past the lowest step the image is too detailed to stay crisp.
 */
export async function fitArtwork(data: Buffer, budget: number = ARTWORK_BUDGET): Promise<Buffer> {
  const steps: [number, number][] = [
    [ARTWORK_MAX_SIDE, 86],
    [ARTWORK_MAX_SIDE, 78],
    [2200, 74],
    [1920, 72],
    [1920, 64],
  ]
  for (const [side, quality] of steps) {
    const out = await sharp(data)
      .rotate()
      .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
    if (out.length <= budget) return out
  }
  throw new ArtworkError(
    `Over the site's ${Math.round(budget / 1024)} KB image budget even at 1920 px and quality 64. Simplify or crop the image and send it again.`,
    422,
  )
}

/**
 * Check the file and store it in the public `media` library, credited to
 * Flamingo County with what it was drawn from, in both languages. Returns the
 * new record's id for a listing's `gallery`, a story's cover or an event's
 * `image`, set in a draft.
 *
 * With `req` (an MCP call) it writes with that key's rights. Without one (the
 * upload link) the link itself is the authority: it was issued over MCP to an
 * authenticated key, for this one file, and is spent by this call.
 *
 * Like an imported photo, it has a public URL from now on but is on a page only
 * once something that uses it is published, by the owner's tap.
 */
export async function storeSiteArtwork(
  payload: Payload,
  meta: ArtworkMeta,
  data: Buffer,
  opts: { req?: PayloadRequest } = {},
): Promise<{ id: number; filename: string | null | undefined; width: number | null | undefined; height: number | null | undefined; filesize: number | null | undefined }> {
  if (data.length > ARTWORK_UPLOAD_LIMIT) throw new ArtworkError(`Larger than ${ARTWORK_UPLOAD_LIMIT / 1024 / 1024} MB.`, 413)
  const real = sniffImage(data)
  if (!real) throw new ArtworkError('Artwork must be a JPEG or PNG image.', 415)
  if (real !== meta.mimeType) throw new ArtworkError(`Declared ${meta.mimeType} but the file is ${real}.`, 415)
  const info = await sharp(data)
    .metadata()
    .catch(() => null)
  if (!info || !info.width || !info.height) throw new ArtworkError('Not a readable JPEG or PNG.', 422)
  const wide = info.orientation && info.orientation >= 5 ? info.height : info.width
  if (wide < ARTWORK_MIN_WIDTH) throw new ArtworkError(`Too small: ${wide} px wide, at least ${ARTWORK_MIN_WIDTH} needed.`, 422)
  const jpeg = await fitArtwork(data)

  const access = opts.req ? { req: opts.req, overrideAccess: false } : { overrideAccess: true }
  const stem = meta.filename.replace(/\.[^.]*$/, '').replace(/[^\w-]+/g, '-').slice(0, 60) || 'artwork'
  const doc = await payload.create({
    collection: 'media',
    data: {
      alt: meta.altEn,
      credit: ARTWORK_CREDIT,
      origin: meta.origin,
      basedOn: isOriginal(meta.basedOnEn) ? null : meta.basedOnEn,
      modified: false,
      // Payload takes a focal point only with both values set, and reads 0 as unset.
      ...(meta.focalX !== undefined || meta.focalY !== undefined
        ? { focalX: Math.max(1, meta.focalX ?? 50), focalY: Math.max(1, meta.focalY ?? 50) }
        : {}),
    },
    file: { data: jpeg, mimetype: 'image/jpeg', name: `${stem}-${Date.now()}.jpg`, size: jpeg.length },
    locale: 'en',
    ...access,
  })
  // Payload stores the original as WebP (Media's formatOptions), so the budget is checked on what it kept.
  if ((doc.filesize ?? 0) > ARTWORK_BUDGET) {
    // Only the record this call just made: delete is off over MCP, so it is removed with server rights.
    await payload.delete({ collection: 'media', id: doc.id, overrideAccess: true }).catch(() => undefined)
    throw new ArtworkError(
      `Stored at ${Math.round((doc.filesize ?? 0) / 1024)} KB, over the site's ${Math.round(ARTWORK_BUDGET / 1024)} KB image budget. Simplify or crop the image and send it again.`,
      422,
    )
  }
  await payload.update({
    collection: 'media',
    id: doc.id,
    data: { alt: meta.altEs, basedOn: isOriginal(meta.basedOnEs) ? null : meta.basedOnEs },
    locale: 'es',
    ...access,
  })
  return { id: doc.id, filename: doc.filename, width: doc.width, height: doc.height, filesize: doc.filesize }
}
