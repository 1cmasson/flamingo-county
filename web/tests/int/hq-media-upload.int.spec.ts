// @vitest-environment node
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { addMediaFromUpload, decodeUpload, hqMcpTools, sniffMediaType } from '@/lib/mcpTools'
import type { User } from '@/payload-types'

/**
 * hqAddDraftMediaFromUpload: a finished video goes from the owner's computer straight into hq-media, over the
 * authenticated MCP connection, with no public link. The pure checks need no database; the rest use a real one.
 */

// A minimal MP4: an `ftyp` box with the isom brand. Real enough for the type checks and for Payload's file sniffing.
const mp4 = (brand = 'isom') =>
  Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftyp', 'latin1'),
    Buffer.from(brand, 'latin1'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isomiso2', 'latin1'),
    Buffer.alloc(64),
  ])
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const b64 = (b: Buffer) => b.toString('base64')

describe('upload checks (no database)', () => {
  it('tells MP4, QuickTime, PNG and JPEG apart by their bytes', () => {
    expect(sniffMediaType(mp4())).toBe('video/mp4')
    expect(sniffMediaType(mp4('qt  '))).toBe('video/quicktime')
    expect(sniffMediaType(PNG)).toBe('image/png')
    expect(sniffMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]))).toBe('image/jpeg')
    expect(sniffMediaType(Buffer.from('<html>hello world</html>'))).toBeNull()
  })

  it('accepts the declared type only when it is the real one', () => {
    expect(decodeUpload({ dataBase64: b64(mp4()), mimeType: 'video/mp4' }).type).toBe('video/mp4')
    expect(() => decodeUpload({ dataBase64: b64(PNG), mimeType: 'video/mp4' })).toThrow(/Declared video\/mp4 but the file is image\/png/)
  })

  it('refuses a .mov, a non-media file and bad base64', () => {
    expect(() => decodeUpload({ dataBase64: b64(mp4('qt  ')), mimeType: 'video/mp4' })).toThrow(/QuickTime/)
    expect(() => decodeUpload({ dataBase64: b64(Buffer.from('<html>not media at all</html>')), mimeType: 'video/mp4' })).toThrow(/Not a JPEG, PNG or MP4/)
    expect(() => decodeUpload({ dataBase64: 'this is !!! not base64', mimeType: 'video/mp4' })).toThrow(/not valid base64/)
  })

  it('stops a file over the limit before decoding it', () => {
    const big = Buffer.concat([mp4(), Buffer.alloc(2000)])
    expect(() => decodeUpload({ dataBase64: b64(big), mimeType: 'video/mp4' }, 1000)).toThrow(/Larger than/)
    // and a string that could never fit is refused without being decoded
    expect(() => decodeUpload({ dataBase64: 'A'.repeat(5000), mimeType: 'video/mp4' }, 1000)).toThrow(/Larger than/)
  })

  it('is registered as a tool whose only inputs are the file', () => {
    const t = hqMcpTools.find((x) => x.name === 'hqAddDraftMediaFromUpload')!
    expect(Object.keys(t.parameters as Record<string, unknown>).sort()).toEqual(['dataBase64', 'filename', 'mimeType', 'note'])
  })
})

describe('upload into hq-media (database)', () => {
  let payload: Payload
  let user: User
  // A request per call: Payload keeps the upload on the request, so one request is not reused across uploads.
  const newReq = async (): Promise<PayloadRequest> => {
    const r = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    r.payloadAPI = 'MCP'
    return r
  }
  const made: number[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = (await payload.create({
      collection: 'users',
      data: { email: `upload-${Date.now()}@test.local`, password: 'test-pass-123', role: 'admin' } as never,
      overrideAccess: true,
    })) as User
  })
  afterAll(async () => {
    for (const id of made) await payload.delete({ collection: 'hq-media', id, overrideAccess: true }).catch(() => {})
  })

  it('stores a video as MP4 and answers a second upload of the same file with the same one', async () => {
    const args = { filename: 'six-inches-en.mp4', mimeType: 'video/mp4', dataBase64: b64(mp4()), note: 'TEST video' }
    const first = await addMediaFromUpload(await newReq(), args)
    made.push(first.id as number)
    expect(first.existing).toBe(false)
    expect(first.mimeType).toBe('video/mp4')
    expect(first.filename).toMatch(/^six-inches-en-\d+\.mp4$/)
    const again = await addMediaFromUpload(await newReq(), args)
    expect(again.existing).toBe(true)
    expect(again.id).toBe(first.id)
  })

  it('stores a PNG as JPEG, which Instagram requires', async () => {
    const m = await addMediaFromUpload(await newReq(), { filename: 'poster.png', mimeType: 'image/png', dataBase64: b64(PNG) })
    made.push(m.id as number)
    expect(m.mimeType).toBe('image/jpeg')
    expect(m.filename).toMatch(/\.jpg$/)
  })

  it('runs through the tool wrapper and reports a bad file as text, not a crash', async () => {
    const t = hqMcpTools.find((x) => x.name === 'hqAddDraftMediaFromUpload')!
    const bad = (await t.handler({ filename: 'x.mp4', mimeType: 'video/mp4', dataBase64: b64(PNG) }, await newReq(), undefined)) as { content: { text: string }[] }
    expect(bad.content[0].text).toMatch(/^Error: Declared video\/mp4/)
  })
})
