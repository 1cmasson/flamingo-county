import { createHash, randomBytes } from 'crypto'
import type { Payload } from 'payload'

import type { HqArtworkUpload } from '../payload-types'
import { SITE_URL } from './site'
import {
  ARTWORK_UPLOAD_LIMIT,
  ArtworkError,
  checkArtworkMeta,
  sniffImage,
  storeSiteArtwork,
  type ArtworkMeta,
  type ArtworkMetaArgs,
} from './siteArtwork'

/**
 * Getting our own artwork onto the server without pasting it into a tool call.
 *
 * The one-shot tool takes the file as base64 inside the call. A model cannot
 * reliably write that: a 72 KB drawing is about 96,000 characters, and one
 * wrong one corrupts the picture. So the usual way is a link:
 *
 *   1. `hqStartSiteArtworkUpload` (MCP, authenticated by the API key) takes the
 *      credit, alt text and focal point, checks them, and returns a one-time
 *      `uploadUrl`.
 *   2. The caller sends the file from its own shell:
 *      `curl -X PUT --data-binary @file -H 'Content-Type: image/jpeg' <uploadUrl>`.
 *      The route checks the link, the size and the real bytes, and stores the
 *      picture exactly as the one-shot tool does (lib/siteArtwork.ts).
 *   3. `hqFinishSiteArtworkUpload` reads the result over MCP.
 *
 * A client with no shell sends the file in pieces instead: up to 20,000
 * base64 characters each, each with its own sha256, so one bad piece is
 * refused and resent alone. `hqFinishSiteArtworkUpload` then puts them
 * together and stores the picture.
 *
 * The link: a random 32-byte token, kept only as a sha256 hash, good for 15
 * minutes and spent by the first upload that gets as far as storing. It is
 * never logged. A wrong type or an oversized file is refused without spending
 * it, so the right file can follow.
 */

export const UPLOAD_TTL_MS = 15 * 60_000
export const UPLOAD_PATH = '/api/hq/artwork-upload/'
/** One piece of the chunked fallback, in base64 characters. */
export const CHUNK_MAX_CHARS = 20_000
/**
 * The chunked fallback's ceiling. It exists for clients that cannot run curl;
 * nothing bigger than this would ever be typed out a piece at a time.
 */
export const CHUNKED_LIMIT = 2 * 1024 * 1024
export const MAX_CHUNKS = Math.ceil(Math.ceil((CHUNKED_LIMIT * 4) / 3) / CHUNK_MAX_CHARS) + 1
/** Rows are kept this long after they expire, so a late status read still answers, then removed. */
const KEEP_MS = 24 * 60 * 60_000
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const SHA_RE = /^[a-f0-9]{64}$/

const COLLECTION = 'hq-artwork-uploads' as const

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

type Chunk = { b64: string; sha256: string }
type Chunks = Record<string, Chunk>

/**
 * Uploads being stored right now, by id. The status column is the record of
 * truth; this closes the gap between two requests reading "pending" at once
 * in the one server process.
 */
const storing = new Set<number>()

/** Remove rows a day past their expiry. Called on every new link, so the table stays small without a job. */
export async function pruneArtworkUploads(payload: Payload, now: Date = new Date()) {
  await payload.delete({
    collection: COLLECTION,
    where: { expiresAt: { less_than: new Date(now.getTime() - KEEP_MS).toISOString() } },
    overrideAccess: true,
  })
}

/** Step 1: check the picture's details and hand back a one-time upload link. */
export async function startArtworkUpload(payload: Payload, args: ArtworkMetaArgs, now: Date = new Date()) {
  const meta = checkArtworkMeta(args)
  await pruneArtworkUploads(payload, now)
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + UPLOAD_TTL_MS).toISOString()
  const row = await payload.create({
    collection: COLLECTION,
    data: { tokenHash: hashToken(token), status: 'pending', expiresAt, meta },
    overrideAccess: true,
  })
  const uploadUrl = `${SITE_URL}${UPLOAD_PATH}${token}`
  return {
    uploadId: row.id,
    uploadUrl,
    expiresAt,
    maxBytes: ARTWORK_UPLOAD_LIMIT,
    send: `curl -sS -X PUT --data-binary @<file> -H 'Content-Type: ${meta.mimeType}' '${uploadUrl}'`,
    then: 'Read the result with hqFinishSiteArtworkUpload(uploadId). No shell? Send the file in pieces with hqSiteArtworkUploadChunk instead.',
    chunked: { maxCharsPerChunk: CHUNK_MAX_CHARS, maxBytes: CHUNKED_LIMIT },
  }
}

const expired = (row: HqArtworkUpload, now: Date) => new Date(row.expiresAt).getTime() <= now.getTime()

/** A link that can still take a file, or the reason it cannot, as the HTTP status the route answers. */
export async function findOpenUpload(
  payload: Payload,
  token: string,
  now: Date = new Date(),
): Promise<{ row: HqArtworkUpload } | { status: number; error: string }> {
  // Cheap refusals first: a malformed token never reaches the database.
  if (!TOKEN_RE.test(token)) return { status: 404, error: 'Not found.' }
  const found = await payload.find({
    collection: COLLECTION,
    where: { tokenHash: { equals: hashToken(token) } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const row = found.docs[0]
  if (!row) return { status: 404, error: 'Not found.' }
  if (row.status !== 'pending' || storing.has(row.id)) {
    return { status: 410, error: 'This upload link has been used. Start a new one with hqStartSiteArtworkUpload.' }
  }
  if (expired(row, now)) return { status: 410, error: 'This upload link has expired. Start a new one with hqStartSiteArtworkUpload.' }
  return { row }
}

/**
 * Store the file for a link: claim it (pending → storing, once), store the
 * picture, and record the outcome. Spent whatever happens next: a picture that
 * fails a check needs a new link.
 */
async function storeFor(payload: Payload, row: HqArtworkUpload, data: Buffer) {
  if (storing.has(row.id)) throw new ArtworkError('This upload is already being stored.', 410)
  storing.add(row.id)
  try {
    const claimed = await payload.update({
      collection: COLLECTION,
      where: { and: [{ id: { equals: row.id } }, { status: { equals: 'pending' } }] },
      data: { status: 'storing' },
      overrideAccess: true,
    })
    if (claimed.docs.length !== 1) throw new ArtworkError('This upload link has been used. Start a new one with hqStartSiteArtworkUpload.', 410)
    try {
      const result = await storeSiteArtwork(payload, row.meta as ArtworkMeta, data)
      await payload.update({
        collection: COLLECTION,
        id: row.id,
        data: { status: 'stored', media: result.id, result, chunks: null },
        overrideAccess: true,
      })
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await payload.update({ collection: COLLECTION, id: row.id, data: { status: 'failed', error, chunks: null }, overrideAccess: true })
      throw err
    }
  } finally {
    storing.delete(row.id)
  }
}

/**
 * Step 2, by link: the bytes a PUT carried. A wrong type or a file over the
 * limit is refused before the link is spent.
 */
export async function receiveArtworkUpload(
  payload: Payload,
  row: HqArtworkUpload,
  data: Buffer,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (data.length === 0) return { status: 400, body: { error: 'Empty body: send the file with --data-binary @file.' } }
  if (data.length > ARTWORK_UPLOAD_LIMIT) return { status: 413, body: { error: `Larger than ${ARTWORK_UPLOAD_LIMIT / 1024 / 1024} MB.` } }
  const meta = row.meta as ArtworkMeta
  const real = sniffImage(data)
  if (!real) return { status: 415, body: { error: 'Not a JPEG or PNG file.' } }
  if (real !== meta.mimeType) return { status: 415, body: { error: `This link was started for ${meta.mimeType} but the file is ${real}.` } }
  try {
    return { status: 201, body: { uploadId: row.id, ...(await storeFor(payload, row, data)) } }
  } catch (err) {
    if (err instanceof ArtworkError) return { status: err.status, body: { error: err.message } }
    throw err
  }
}

async function openById(payload: Payload, uploadId: number, now: Date): Promise<HqArtworkUpload> {
  const row = (await payload
    .findByID({ collection: COLLECTION, id: uploadId, depth: 0, overrideAccess: true })
    .catch(() => null)) as HqArtworkUpload | null
  if (!row) throw new Error(`No upload ${uploadId}. Start one with hqStartSiteArtworkUpload.`)
  if (row.status !== 'pending') throw new Error(`Upload ${uploadId} is ${row.status}; it takes no more pieces.`)
  if (expired(row, now)) throw new Error(`Upload ${uploadId} has expired. Start a new one with hqStartSiteArtworkUpload.`)
  return row
}

const missingOf = (chunks: Chunks, total: number) =>
  Array.from({ length: total }, (_, i) => i).filter((i) => !chunks[String(i)])

/**
 * The chunked fallback, one piece: checked against its own sha256 before it is
 * kept, so a piece copied wrong is refused and resent alone.
 */
export async function addArtworkChunk(
  payload: Payload,
  args: { uploadId: number; index: number; total: number; dataBase64: string; sha256: string },
  now: Date = new Date(),
) {
  const row = await openById(payload, Number(args.uploadId), now)
  const total = Number(args.total)
  const index = Number(args.index)
  if (!Number.isInteger(total) || total < 1 || total > MAX_CHUNKS) {
    throw new Error(`total must be 1–${MAX_CHUNKS} (pieces of up to ${CHUNK_MAX_CHARS} characters, ${CHUNKED_LIMIT / 1024 / 1024} MB in all). A bigger file goes by the upload link.`)
  }
  if (row.chunkTotal && row.chunkTotal !== total) throw new Error(`This upload was started with total ${row.chunkTotal}, not ${total}.`)
  if (!Number.isInteger(index) || index < 0 || index >= total) throw new Error(`index must be 0–${total - 1}.`)
  const b64 = String(args.dataBase64 ?? '').replace(/\s+/g, '')
  if (!b64 || b64.length > CHUNK_MAX_CHARS) throw new Error(`A piece is 1–${CHUNK_MAX_CHARS} base64 characters.`)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Error(`Piece ${index} is not valid base64. Resend it.`)
  const expected = String(args.sha256 ?? '').toLowerCase()
  if (!SHA_RE.test(expected)) throw new Error('sha256 must be the 64-character hex digest of this piece’s decoded bytes.')
  const bytes = Buffer.from(b64, 'base64')
  const got = sha256(bytes)
  if (got !== expected) throw new Error(`Piece ${index} does not match its sha256 (it decodes to ${got}). Resend this piece.`)

  const chunks: Chunks = { ...((row.chunks as Chunks | null) ?? {}), [String(index)]: { b64, sha256: got } }
  const size = Object.values(chunks).reduce((n, c) => n + Buffer.byteLength(c.b64, 'base64'), 0)
  if (size > CHUNKED_LIMIT) throw new Error(`Over ${CHUNKED_LIMIT / 1024 / 1024} MB in pieces. A bigger file goes by the upload link.`)
  await payload.update({ collection: COLLECTION, id: row.id, data: { chunks, chunkTotal: total }, overrideAccess: true })
  const missing = missingOf(chunks, total)
  return {
    uploadId: row.id,
    received: total - missing.length,
    total,
    missing: missing.slice(0, 50),
    next: missing.length ? 'Send the missing pieces.' : 'All pieces in: call hqFinishSiteArtworkUpload.',
  }
}

/**
 * Step 3, both ways: where an upload stands. When every piece of a chunked
 * upload is in, this assembles them (checked against the whole file's sha256
 * when given) and stores the picture.
 */
export async function finishArtworkUpload(
  payload: Payload,
  args: { uploadId: number; sha256?: string | null },
  now: Date = new Date(),
): Promise<Record<string, unknown>> {
  const uploadId = Number(args.uploadId)
  const row = (await payload
    .findByID({ collection: COLLECTION, id: uploadId, depth: 0, overrideAccess: true })
    .catch(() => null)) as HqArtworkUpload | null
  if (!row) throw new Error(`No upload ${uploadId}. Start one with hqStartSiteArtworkUpload.`)
  if (row.status === 'stored') return { status: 'stored', uploadId, ...((row.result as Record<string, unknown>) ?? {}) }
  if (row.status === 'failed') return { status: 'failed', uploadId, error: row.error, next: 'Fix the file and start a new upload.' }
  if (row.status === 'storing' || storing.has(row.id)) return { status: 'storing', uploadId, next: 'Ask again in a moment.' }
  if (expired(row, now)) return { status: 'expired', uploadId, next: 'Start a new upload with hqStartSiteArtworkUpload.' }

  const chunks = (row.chunks as Chunks | null) ?? {}
  const total = row.chunkTotal ?? 0
  if (!total) return { status: 'pending', uploadId, next: 'Waiting for the file: PUT it to the uploadUrl, or send it in pieces with hqSiteArtworkUploadChunk.' }
  const missing = missingOf(chunks, total)
  if (missing.length) return { status: 'pending', uploadId, received: total - missing.length, total, missing: missing.slice(0, 50) }

  const data = Buffer.concat(Array.from({ length: total }, (_, i) => Buffer.from(chunks[String(i)].b64, 'base64')))
  const whole = args.sha256 ? String(args.sha256).toLowerCase() : null
  if (whole && !SHA_RE.test(whole)) throw new Error('sha256 must be the 64-character hex digest of the whole file.')
  if (whole && sha256(data) !== whole) {
    throw new Error(`The assembled file does not match sha256 (it is ${sha256(data)}). Check the pieces' order and total, resend any that are wrong, and finish again.`)
  }
  const meta = row.meta as ArtworkMeta
  const real = sniffImage(data)
  if (real !== meta.mimeType) throw new Error(real ? `This upload was started for ${meta.mimeType} but the file is ${real}.` : 'The assembled file is not a JPEG or PNG.')
  const result = await storeFor(payload, row, data)
  return { status: 'stored', uploadId, ...result }
}

/* ------------------------------------------------------------------------ */
/* The route's guards (app/api/hq/artwork-upload/[token]/route.ts)          */
/* ------------------------------------------------------------------------ */

/**
 * A brake on guessing and on a runaway client, per server process like the
 * Telegram send limit: twenty tries per address and a hundred overall in ten
 * minutes is far more than uploading a few drawings takes.
 */
const WINDOW_MS = 10 * 60_000
const PER_ADDRESS = 20
const OVERALL = 100
let hits: { at: number; ip: string }[] = []

/** For tests. */
export function resetArtworkUploadLimit() {
  hits = []
}

export function uploadRateLimited(ip: string, now: number): boolean {
  hits = hits.filter((h) => now - h.at < WINDOW_MS)
  if (hits.length >= OVERALL || hits.filter((h) => h.ip === ip).length >= PER_ADDRESS) return true
  hits.push({ at: now, ip })
  return false
}

/** The body, or null once it passes `limit`: an oversized upload is cut off, not buffered. */
export async function readCapped(req: Request, limit: number): Promise<Buffer | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) return null
  if (!req.body) return Buffer.alloc(0)
  const reader = req.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    parts.push(value)
  }
  return Buffer.concat(parts)
}
