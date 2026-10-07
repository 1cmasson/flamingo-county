// @vitest-environment node
// Uploads and sharp want Node, not jsdom.

import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { PhotoCredit } from '@/components/PhotoCredit'
import { creditLine } from '@/lib/autoDraft'
import {
  ARTWORK_BUDGET,
  ARTWORK_CREDIT,
  addSiteArtworkFromUpload,
  fitArtwork,
  hqMcpTools,
  type SiteArtworkArgs,
} from '@/lib/mcpTools'
import { photoCredit, photoCreditText } from '@/lib/photoLicense'
import type { Media, User } from '@/payload-types'

/**
 * hqAddSiteArtworkFromUpload: a cover we drew goes into the public media
 * library, credited to Flamingo County with what it was drawn from, within the
 * 400 KB image budget. The archive tool cannot take it; this one cannot take
 * anything else.
 */

/** A flat-colour drawing, like the brand's comic style: compresses well. */
const drawing = (width = 1600, height = 900) =>
  sharp({ create: { width, height, channels: 3, background: { r: 255, g: 46, b: 136 } } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}"><rect x="100" y="100" width="${width / 2}" height="${height / 2}" fill="#16e0f2" stroke="#0c0f14" stroke-width="12"/></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer()

/** Random noise: the worst case for JPEG, far over any budget. */
const noise = (width: number, height: number) =>
  sharp(Buffer.from(Array.from({ length: width * height * 3 }, () => Math.floor(Math.random() * 256))), {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer()

const b64 = (b: Buffer) => b.toString('base64')

const HABS_ES = 'basada en fotos del Historic American Buildings Survey (dominio público)'
const HABS_EN = 'based on Historic American Buildings Survey photos (public domain)'

describe('our artwork, without the database', () => {
  it('is an MCP tool whose credit is not a parameter', () => {
    const t = hqMcpTools.find((x) => x.name === 'hqAddSiteArtworkFromUpload')!
    expect(t).toBeDefined()
    const keys = Object.keys(t.parameters as Record<string, unknown>).sort()
    expect(keys).toEqual(['altEn', 'altEs', 'basedOnEn', 'basedOnEs', 'dataBase64', 'filename', 'focalX', 'focalY', 'mimeType', 'origin'])
    expect(keys).not.toContain('credit')
  })

  it('fits a drawing within the budget as a JPEG', async () => {
    const out = await fitArtwork(await drawing(2752, 1536))
    expect(out.length).toBeLessThanOrEqual(ARTWORK_BUDGET)
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(2560)
    expect(meta.exif).toBeUndefined()
  })

  it('refuses rather than crushing what cannot fit', async () => {
    await expect(fitArtwork(await noise(1200, 800), 20 * 1024)).rejects.toThrow(/image budget/)
  })

  it('credits an illustration as ours, with what it was drawn from', () => {
    const m = { credit: ARTWORK_CREDIT, origin: 'own-illustration', basedOn: HABS_ES } as unknown as Media
    const es = photoCredit(m, 'es')!
    expect(es.lead).toBe('Ilustración')
    expect(photoCreditText(es)).toBe(`Ilustración: Flamingo County · ${HABS_ES}`)
    expect(photoCreditText(photoCredit({ ...m, basedOn: HABS_EN } as Media, 'en')!)).toBe(`Illustration: Flamingo County · ${HABS_EN}`)
    expect(renderToStaticMarkup(PhotoCredit({ credit: es }))).toContain(HABS_ES)
    expect(creditLine(m)).toBe(`📷 Ilustración: Flamingo County, ${HABS_ES}`)
  })

  it('leaves a licensed photo credited as before', () => {
    const m = { credit: 'Phillip Pessar', license: 'cc-by-2.0' } as unknown as Media
    const c = photoCredit(m, 'es')!
    expect(c.lead).toBe('Foto')
    expect(c.basedOn).toBeNull()
    expect(photoCreditText(c)).toBe('Foto: Phillip Pessar · CC BY 2.0')
  })
})

describe('our artwork, against the database', () => {
  let payload: Payload
  let user: User
  const made: number[] = []
  // A request per call: Payload keeps the upload on the request.
  const newReq = async (): Promise<PayloadRequest> => {
    const r = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    r.payloadAPI = 'MCP'
    return r
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = (await payload.create({
      collection: 'users',
      data: { email: `artwork-${Date.now()}@test.local`, password: 'test-pass-123', role: 'admin' } as never,
      overrideAccess: true,
    })) as User
  })
  afterAll(async () => {
    if (!payload) return
    for (const id of made) await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => {})
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true }).catch(() => {})
  })

  const args = async (over: Partial<SiteArtworkArgs> = {}): Promise<SiteArtworkArgs> => ({
    filename: 'hialeah-park-cover.png',
    mimeType: 'image/png',
    dataBase64: b64(await drawing(2752, 1536)),
    origin: 'own-illustration',
    altEs: 'Flamencos en la laguna de Hialeah Park, con el clubhouse detrás',
    altEn: "Flamingos in Hialeah Park's infield lake, the clubhouse behind",
    basedOnEs: HABS_ES,
    basedOnEn: HABS_EN,
    focalX: 50,
    focalY: 65,
    ...over,
  })

  it('stores it in the public library, credited to us, in both languages, within budget', async () => {
    const r = await addSiteArtworkFromUpload(await newReq(), await args())
    made.push(r.id as number)
    expect(r.filesize).toBeGreaterThan(0)
    expect(r.filesize).toBeLessThanOrEqual(ARTWORK_BUDGET)
    // Payload keeps every original as WebP; the budget is checked on that file.
    expect(r.filename).toMatch(/^hialeah-park-cover-\d+\.webp$/)
    const en = (await payload.findByID({ collection: 'media', id: r.id, locale: 'en', overrideAccess: true })) as Media
    const es = (await payload.findByID({ collection: 'media', id: r.id, locale: 'es', overrideAccess: true })) as Media
    expect(en.credit).toBe('Flamingo County')
    expect(en.origin).toBe('own-illustration')
    expect(en.license ?? null).toBeNull()
    expect(en.basedOn).toBe(HABS_EN)
    expect(es.basedOn).toBe(HABS_ES)
    expect(es.alt).toMatch(/^Flamencos/)
    expect(en.mimeType).toBe('image/webp')
    expect(en.filesize).toBeLessThanOrEqual(ARTWORK_BUDGET)
    expect(en.focalY).toBe(65)
    expect(photoCreditText(photoCredit(es, 'es')!)).toBe(`Ilustración: Flamingo County · ${HABS_ES}`)
  })

  it('stores nothing to credit for work drawn from nothing', async () => {
    const r = await addSiteArtworkFromUpload(await newReq(), await args({ basedOnEs: 'original', basedOnEn: 'Original' }))
    made.push(r.id as number)
    const es = (await payload.findByID({ collection: 'media', id: r.id, locale: 'es', overrideAccess: true })) as Media
    expect(es.basedOn ?? null).toBeNull()
    expect(photoCreditText(photoCredit(es, 'es')!)).toBe('Ilustración: Flamingo County')
  })

  it('refuses anything that is not ours, unsourced, too small or mislabelled', async () => {
    const req = await newReq()
    await expect(addSiteArtworkFromUpload(req, await args({ origin: 'archive-photo' }))).rejects.toThrow(/origin must be one of/)
    await expect(addSiteArtworkFromUpload(req, await args({ basedOnEs: '  ' }))).rejects.toThrow(/basedOnEs and basedOnEn are required/)
    await expect(addSiteArtworkFromUpload(req, await args({ altEn: '' }))).rejects.toThrow(/Alt text/)
    await expect(addSiteArtworkFromUpload(req, await args({ dataBase64: b64(await drawing(800, 600)) }))).rejects.toThrow(/Too small/)
    await expect(addSiteArtworkFromUpload(req, await args({ mimeType: 'image/jpeg' }))).rejects.toThrow(/Declared image\/jpeg but the file is image\/png/)
    await expect(addSiteArtworkFromUpload(req, await args({ focalX: 120 }))).rejects.toThrow(/focalX/)
  })

  it('runs through the tool wrapper and reports a refusal as text', async () => {
    const t = hqMcpTools.find((x) => x.name === 'hqAddSiteArtworkFromUpload')!
    const out = (await t.handler({ ...(await args()), origin: 'stock' }, await newReq(), undefined)) as { content: { text: string }[] }
    expect(out.content[0].text).toMatch(/^Error: origin must be one of/)
  })
})
