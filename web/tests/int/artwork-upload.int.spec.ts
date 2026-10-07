// @vitest-environment node
// Uploads, sharp and Request bodies want Node, not jsdom.

import { createHash } from 'crypto'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { PUT } from '@/app/api/hq/artwork-upload/[token]/route'
import {
  CHUNK_MAX_CHARS,
  UPLOAD_PATH,
  UPLOAD_TTL_MS,
  addArtworkChunk,
  finishArtworkUpload,
  hashToken,
  readCapped,
  receiveArtworkUpload,
  resetArtworkUploadLimit,
  startArtworkUpload,
  uploadRateLimited,
} from '@/lib/artworkUpload'
import { hqMcpTools } from '@/lib/mcpTools'
import { photoCredit, photoCreditText } from '@/lib/photoLicense'
import { ARTWORK_BUDGET, ARTWORK_UPLOAD_LIMIT, type ArtworkMetaArgs } from '@/lib/siteArtwork'
import { SITE_URL } from '@/lib/site'
import type { HqArtworkUpload, Media } from '@/payload-types'

/**
 * The upload link for our own artwork: hqStartSiteArtworkUpload hands back a
 * one-time URL, the file goes there with a plain PUT, and it is stored exactly
 * as the one-shot tool stores it. The chunked fallback does the same over MCP,
 * a checked piece at a time. Neither needs a 100,000-character tool argument.
 */

const HABS_ES = 'basada en una foto del Historic American Buildings Survey (dominio público)'
const HABS_EN = 'based on a Historic American Buildings Survey photo (public domain)'

/** A flat-colour drawing in the brand's comic style, as a JPEG: small, like a real cover. */
const drawing = (width = 1600, height = 900, format: 'jpeg' | 'png' = 'jpeg') => {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 255, g: 46, b: 136 } } }).composite([
    {
      input: Buffer.from(
        `<svg width="${width}" height="${height}"><rect x="100" y="100" width="${width / 2}" height="${height / 2}" fill="#16e0f2" stroke="#0c0f14" stroke-width="12"/><circle cx="${width * 0.75}" cy="${height * 0.6}" r="${height / 5}" fill="#ffd400" stroke="#0c0f14" stroke-width="10"/></svg>`,
      ),
    },
  ])
  return format === 'png' ? img.png().toBuffer() : img.jpeg({ quality: 90 }).toBuffer()
}

/** A drawing with a patch of noise: big enough to need several chunks, small enough to store within budget. */
const detailed = async () => {
  const patch = await sharp(Buffer.from(Array.from({ length: 360 * 240 * 3 }, () => Math.floor(Math.random() * 256))), {
    raw: { width: 360, height: 240, channels: 3 },
  })
    .png()
    .toBuffer()
  return sharp(await drawing()).composite([{ input: patch, left: 900, top: 80 }]).jpeg({ quality: 85 }).toBuffer()
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

const meta = (over: Partial<ArtworkMetaArgs> = {}): ArtworkMetaArgs => ({
  filename: 'hialeah-park-clubhouse.jpg',
  mimeType: 'image/jpeg',
  origin: 'own-illustration',
  altEs: 'Ilustración del clubhouse de Hialeah Park',
  altEn: 'Illustration of the Hialeah Park clubhouse',
  basedOnEs: HABS_ES,
  basedOnEn: HABS_EN,
  focalX: 50,
  focalY: 55,
  ...over,
})

const tokenOf = (uploadUrl: string) => uploadUrl.slice(`${SITE_URL}${UPLOAD_PATH}`.length)

/** A PUT as curl sends it, straight to the route handler. */
const put = (token: string, body: Buffer | string, type = 'image/jpeg', ip = '203.0.113.7') =>
  PUT(
    new Request(`http://localhost${UPLOAD_PATH}${token}`, {
      method: 'PUT',
      body: typeof body === 'string' ? body : new Uint8Array(body),
      headers: { 'content-type': type, 'cf-connecting-ip': ip },
    }),
    { params: Promise.resolve({ token }) },
  )

describe('artwork upload link, without the database', () => {
  it('offers start, chunk and finish tools, and none takes a credit or the whole file', () => {
    const names = hqMcpTools.map((t) => t.name)
    for (const n of ['hqStartSiteArtworkUpload', 'hqSiteArtworkUploadChunk', 'hqFinishSiteArtworkUpload', 'hqAddSiteArtworkFromUpload']) {
      expect(names).toContain(n)
    }
    const start = hqMcpTools.find((t) => t.name === 'hqStartSiteArtworkUpload')!
    const keys = Object.keys(start.parameters as Record<string, unknown>).sort()
    expect(keys).toEqual(['altEn', 'altEs', 'basedOnEn', 'basedOnEs', 'filename', 'focalX', 'focalY', 'mimeType', 'origin'])
    const chunk = hqMcpTools.find((t) => t.name === 'hqSiteArtworkUploadChunk')!
    expect(Object.keys(chunk.parameters as Record<string, unknown>).sort()).toEqual(['dataBase64', 'index', 'sha256', 'total', 'uploadId'])
    // The one-shot tool now says plainly that it is for small files only.
    expect(hqMcpTools.find((t) => t.name === 'hqAddSiteArtworkFromUpload')!.description).toMatch(/SMALL file.*hqStartSiteArtworkUpload/s)
  })

  it('reads a body only up to the limit', async () => {
    const small = new Request('http://localhost/x', { method: 'PUT', body: new Uint8Array(500) })
    expect((await readCapped(small, 1000))!.length).toBe(500)
    const big = new Request('http://localhost/x', { method: 'PUT', body: new Uint8Array(2000) })
    expect(await readCapped(big, 1000)).toBeNull()
    const declared = new Request('http://localhost/x', { method: 'PUT', body: new Uint8Array(10), headers: { 'content-length': '5000' } })
    expect(await readCapped(declared, 1000)).toBeNull()
  })

  it('rate-limits an address, then everyone', () => {
    resetArtworkUploadLimit()
    const t = Date.now()
    for (let i = 0; i < 20; i++) expect(uploadRateLimited('198.51.100.1', t)).toBe(false)
    expect(uploadRateLimited('198.51.100.1', t)).toBe(true)
    expect(uploadRateLimited('198.51.100.2', t)).toBe(false)
    // Ten minutes on, the window has passed.
    expect(uploadRateLimited('198.51.100.1', t + 10 * 60_000 + 1)).toBe(false)
    resetArtworkUploadLimit()
  })
})

describe('artwork upload link, against the database', () => {
  let payload: Payload
  const media: number[] = []
  const uploads: number[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })
  beforeEach(() => resetArtworkUploadLimit())
  afterAll(async () => {
    if (!payload) return
    for (const id of uploads) await payload.delete({ collection: 'hq-artwork-uploads', id, overrideAccess: true }).catch(() => {})
    for (const id of media) await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => {})
  })

  const start = async (over: Partial<ArtworkMetaArgs> = {}, now?: Date) => {
    const s = await startArtworkUpload(payload, meta(over), now)
    uploads.push(s.uploadId as number)
    return s
  }
  const row = (id: number) => payload.findByID({ collection: 'hq-artwork-uploads', id, overrideAccess: true }) as Promise<HqArtworkUpload>

  it('hands back a one-time link and keeps only a hash of it', async () => {
    const s = await start()
    expect(s.uploadUrl).toMatch(new RegExp(`^${SITE_URL}${UPLOAD_PATH}[A-Za-z0-9_-]{43}$`))
    expect(s.send).toContain(`-H 'Content-Type: image/jpeg'`)
    expect(s.send).toContain(s.uploadUrl)
    expect(new Date(s.expiresAt).getTime() - Date.now()).toBeGreaterThan(UPLOAD_TTL_MS - 60_000)
    const r = await row(s.uploadId as number)
    expect(r.tokenHash).toBe(hashToken(tokenOf(s.uploadUrl)))
    expect(JSON.stringify(r)).not.toContain(tokenOf(s.uploadUrl))
    expect(r.status).toBe('pending')
  })

  it('refuses the same details the one-shot tool refuses, before issuing a link', async () => {
    await expect(startArtworkUpload(payload, meta({ origin: 'stock-photo' }))).rejects.toThrow(/origin must be one of/)
    await expect(startArtworkUpload(payload, meta({ basedOnEn: ' ' }))).rejects.toThrow(/basedOnEs and basedOnEn are required/)
    await expect(startArtworkUpload(payload, meta({ altEs: '' }))).rejects.toThrow(/Alt text/)
    await expect(startArtworkUpload(payload, meta({ mimeType: 'image/gif' }))).rejects.toThrow(/mimeType/)
    const t = hqMcpTools.find((x) => x.name === 'hqStartSiteArtworkUpload')!
    const out = (await t.handler({ ...meta(), origin: 'stock' }, { payload } as never, undefined)) as { content: { text: string }[] }
    expect(out.content[0].text).toMatch(/^Error: origin must be one of/)
  })

  it('stores a PUT file as our credited artwork, within budget, and spends the link', async () => {
    const s = await start()
    const token = tokenOf(s.uploadUrl)
    const res = await put(token, await drawing())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: number; filesize: number; filename: string }
    media.push(body.id)
    expect(body.filesize).toBeLessThanOrEqual(ARTWORK_BUDGET)
    expect(body.filename).toMatch(/^hialeah-park-clubhouse-\d+\.webp$/)

    const en = (await payload.findByID({ collection: 'media', id: body.id, locale: 'en', overrideAccess: true })) as Media
    const es = (await payload.findByID({ collection: 'media', id: body.id, locale: 'es', overrideAccess: true })) as Media
    expect(en.credit).toBe('Flamingo County')
    expect(en.origin).toBe('own-illustration')
    expect(en.basedOn).toBe(HABS_EN)
    expect(es.basedOn).toBe(HABS_ES)
    expect(es.alt).toBe('Ilustración del clubhouse de Hialeah Park')
    expect(en.focalY).toBe(55)
    expect(photoCreditText(photoCredit(es, 'es')!)).toBe(`Ilustración: Flamingo County · ${HABS_ES}`)

    // Finish reads the same result back over MCP.
    expect(await finishArtworkUpload(payload, { uploadId: s.uploadId as number })).toMatchObject({ status: 'stored', id: body.id })
    // The link is spent.
    const again = await put(token, await drawing())
    expect(again.status).toBe(410)
  })

  it('refuses an expired link, an unknown one and a malformed one', async () => {
    const old = await start({}, new Date(Date.now() - UPLOAD_TTL_MS - 1000))
    expect((await put(tokenOf(old.uploadUrl), await drawing())).status).toBe(410)
    expect((await put('A'.repeat(43), await drawing())).status).toBe(404)
    expect((await put('../../users', await drawing())).status).toBe(404)
    expect(await finishArtworkUpload(payload, { uploadId: old.uploadId as number })).toMatchObject({ status: 'expired' })
  })

  it('refuses a wrong type without spending the link, so the right file can follow', async () => {
    const s = await start()
    const token = tokenOf(s.uploadUrl)
    expect((await put(token, 'GIF89a not a picture', 'image/gif')).status).toBe(415)
    expect((await put(token, await drawing(1600, 900, 'png'), 'image/png')).status).toBe(415) // started as JPEG
    const ok = await put(token, await drawing())
    expect(ok.status).toBe(201)
    media.push(((await ok.json()) as { id: number }).id)
  })

  it('refuses an oversized file before reading it, and an empty one', async () => {
    const s = await start()
    const r = await row(s.uploadId as number)
    expect((await receiveArtworkUpload(payload, r, Buffer.alloc(ARTWORK_UPLOAD_LIMIT + 1))).status).toBe(413)
    expect((await receiveArtworkUpload(payload, r, Buffer.alloc(0))).status).toBe(400)
    expect((await row(s.uploadId as number)).status).toBe('pending')
  })

  it('spends the link on a picture that fails a check, and says why', async () => {
    const s = await start()
    const res = await put(tokenOf(s.uploadUrl), await drawing(800, 600))
    expect(res.status).toBe(422)
    expect(((await res.json()) as { error: string }).error).toMatch(/Too small: 800 px/)
    expect(await finishArtworkUpload(payload, { uploadId: s.uploadId as number })).toMatchObject({ status: 'failed', error: expect.stringMatching(/Too small/) })
    expect((await put(tokenOf(s.uploadUrl), await drawing())).status).toBe(410)
  })

  it('answers 429 once an address has tried too often', async () => {
    for (let i = 0; i < 20; i++) await put('B'.repeat(43), 'x', 'image/jpeg', '192.0.2.99')
    expect((await put('B'.repeat(43), 'x', 'image/jpeg', '192.0.2.99')).status).toBe(429)
  })

  it('takes a file in checked pieces, refuses a bad piece alone, and stores the whole', async () => {
    const file = await detailed()
    const b64 = file.toString('base64')
    const size = CHUNK_MAX_CHARS - (CHUNK_MAX_CHARS % 4)
    const pieces = Array.from({ length: Math.ceil(b64.length / size) }, (_, i) => b64.slice(i * size, (i + 1) * size))
    expect(pieces.length).toBeGreaterThan(1)
    const s = await start({ filename: 'noise.jpg' })
    const uploadId = s.uploadId as number
    const shaOf = (p: string) => sha(Buffer.from(p, 'base64'))

    // A piece copied wrong is refused, and only that piece needs resending.
    const broken = pieces[0].slice(0, -8) + 'AAAAAAAA'
    await expect(addArtworkChunk(payload, { uploadId, index: 0, total: pieces.length, dataBase64: broken, sha256: shaOf(pieces[0]) })).rejects.toThrow(
      /Piece 0 does not match its sha256.*Resend this piece/,
    )
    for (const [index, p] of pieces.entries()) {
      const r = await addArtworkChunk(payload, { uploadId, index, total: pieces.length, dataBase64: p, sha256: shaOf(p) })
      expect(r.total).toBe(pieces.length)
    }
    await expect(addArtworkChunk(payload, { uploadId, index: 0, total: pieces.length + 1, dataBase64: pieces[0], sha256: shaOf(pieces[0]) })).rejects.toThrow(
      /started with total/,
    )
    // The whole file is checked too.
    await expect(finishArtworkUpload(payload, { uploadId, sha256: '0'.repeat(64) })).rejects.toThrow(/does not match sha256/)
    const done = await finishArtworkUpload(payload, { uploadId, sha256: sha(file) })
    expect(done).toMatchObject({ status: 'stored' })
    media.push(done.id as number)
    expect((await row(uploadId)).chunks ?? null).toBeNull()
    // Nothing more goes into a stored upload.
    await expect(addArtworkChunk(payload, { uploadId, index: 0, total: pieces.length, dataBase64: pieces[0], sha256: shaOf(pieces[0]) })).rejects.toThrow(/stored/)
    // Asking again just reads the result.
    expect(await finishArtworkUpload(payload, { uploadId })).toMatchObject({ status: 'stored', id: done.id })
  })

  it('reports what is missing before every piece is in', async () => {
    const s = await start()
    const uploadId = s.uploadId as number
    expect(await finishArtworkUpload(payload, { uploadId })).toMatchObject({ status: 'pending' })
    const p = (await drawing()).toString('base64').slice(0, 400)
    await addArtworkChunk(payload, { uploadId, index: 1, total: 3, dataBase64: p, sha256: sha(Buffer.from(p, 'base64')) })
    expect(await finishArtworkUpload(payload, { uploadId })).toMatchObject({ status: 'pending', received: 1, total: 3, missing: [0, 2] })
  })

  it('removes links a day past their expiry when a new one is issued', async () => {
    const ancient = await start({}, new Date(Date.now() - 3 * 24 * 60 * 60_000))
    const byHash = (url: string) =>
      payload.find({ collection: 'hq-artwork-uploads', where: { tokenHash: { equals: hashToken(tokenOf(url)) } }, overrideAccess: true })
    expect((await byHash(ancient.uploadUrl)).totalDocs).toBe(1)
    const fresh = await start()
    // By the token's hash, not the id: SQLite may hand the freed id to the new row.
    expect((await byHash(ancient.uploadUrl)).totalDocs).toBe(0)
    expect((await byHash(fresh.uploadUrl)).totalDocs).toBe(1)
  })
})
