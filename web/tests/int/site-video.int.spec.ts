// @vitest-environment node
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { storyJsonLd, videoJsonLd } from '@/lib/jsonld'
import { addMediaFromUpload, addSiteVideo, hqMcpTools } from '@/lib/mcpTools'
import type { Story, User, Video } from '@/payload-types'

/**
 * hqAddSiteVideo: a finished reel already in hq-media is copied into the public `videos`
 * collection with its cover card as the poster, so the story page can play it.
 */

const mp4 = () =>
  Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypisom', 'latin1'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isomiso2', 'latin1'),
    Buffer.alloc(64),
  ])
const card = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#0c0f14' } }).png().toBuffer()
const b64 = (b: Buffer) => b.toString('base64')

describe('structured data (no database)', () => {
  const video = {
    id: 1,
    title: 'Al Capone en Hialeah',
    language: 'es',
    url: '/api/videos/file/capone-es.mp4',
    poster: { id: 9, url: '/api/media/file/capone-es-cover.webp' },
    durationSeconds: 84,
    createdAt: '2026-10-07T15:00:00.000Z',
  } as unknown as Video

  it('describes the reel with the fields Google requires, and an ISO duration', () => {
    const ld = videoJsonLd('es', video, 'En 1929…')!
    expect(ld['@type']).toBe('VideoObject')
    expect(ld.name).toBe('Al Capone en Hialeah')
    expect(ld.thumbnailUrl).toEqual(['https://flamingocounty.com/api/media/file/capone-es-cover.webp'])
    expect(ld.uploadDate).toBe('2026-10-07T15:00:00.000Z')
    expect(ld.contentUrl).toBe('https://flamingocounty.com/api/videos/file/capone-es.mp4')
    expect(ld.duration).toBe('PT1M24S')
  })

  it('emits nothing for a video with no poster, rather than an invalid node', () => {
    expect(videoJsonLd('es', { ...video, poster: 9 } as unknown as Video)).toBeNull()
  })

  it('nests the video in the Article without a second @context', () => {
    const story = { slug: 'al-capone-in-hialeah', title: 'Al Capone en Hialeah', dek: 'x', createdAt: '2026-10-06T00:00:00.000Z' } as Story
    const ld = storyJsonLd('es', story, { video: videoJsonLd('es', video) })
    expect(ld['@type']).toBe('Article')
    expect(ld.url).toBe('https://flamingocounty.com/es/stories/al-capone-in-hialeah')
    expect((ld.video as Record<string, unknown>)['@context']).toBeUndefined()
    expect(ld.image).toBeUndefined()
  })
})

describe('hqAddSiteVideo (database)', () => {
  let payload: Payload
  let user: User
  const newReq = async (): Promise<PayloadRequest> => {
    const r = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    r.payloadAPI = 'MCP'
    return r
  }
  const made: { collection: 'hq-media' | 'videos' | 'media'; id: number }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = (await payload.create({
      collection: 'users',
      data: { email: `video-${Date.now()}@test.local`, password: 'test-pass-123', role: 'admin' } as never,
      overrideAccess: true,
    })) as User
  })
  afterAll(async () => {
    for (const m of made.reverse()) await payload.delete({ collection: m.collection, id: m.id, overrideAccess: true }).catch(() => {})
  })

  const upload = async (filename: string, mimeType: string, data: Buffer) => {
    const m = await addMediaFromUpload(await newReq(), { filename, mimeType, dataBase64: b64(data), note: `TEST ${Date.now()}-${Math.random()}` })
    made.push({ collection: 'hq-media', id: m.id as number })
    return m.id as number
  }

  it('copies the reel into public videos, with the card as a credited poster in media', async () => {
    const vid = await upload('capone-es.mp4', 'video/mp4', mp4())
    const poster = await upload('capone-es-cover.png', 'image/png', await card(1080, 1920))
    const out = await addSiteVideo(await newReq(), {
      hqMediaId: vid,
      posterHqMediaId: poster,
      language: 'es',
      title: 'Al Capone en Hialeah',
      posterAlt: '¿Sabías que? Al Capone en Hialeah',
      durationSeconds: 84,
    })
    made.push({ collection: 'videos', id: out.id as number }, { collection: 'media', id: out.posterMediaId as number })
    expect(out.filename).toMatch(/^capone-es-\d+\.mp4$/)

    const doc = (await payload.findByID({ collection: 'videos', id: out.id, depth: 1 })) as Video
    expect(doc.language).toBe('es')
    expect(doc.mimeType).toBe('video/mp4')
    expect(doc.durationSeconds).toBe(84)
    const p = doc.poster as { credit?: string; alt?: string }
    expect(p.credit).toBe('Flamingo County')
    // readable without a login: videos are public, unlike hq-media
    const anon = await payload.find({ collection: 'videos', where: { id: { equals: out.id } }, overrideAccess: false })
    expect(anon.docs).toHaveLength(1)
  })

  it('refuses a landscape image as the poster and a still as the video', async () => {
    const vid = await upload('six-en.mp4', 'video/mp4', Buffer.concat([mp4(), Buffer.from('x')]))
    const wide = await upload('wide.png', 'image/png', await card(1920, 1080))
    await expect(
      addSiteVideo(await newReq(), { hqMediaId: vid, posterHqMediaId: wide, language: 'en', title: 'Six Inches', posterAlt: 'x' }),
    ).rejects.toThrow(/1080×1920 cover card/)
    await expect(
      addSiteVideo(await newReq(), { hqMediaId: wide, posterHqMediaId: wide, language: 'en', title: 'Six Inches', posterAlt: 'x' }),
    ).rejects.toThrow(/not an MP4/)
  })

  it('is registered as a tool and reports errors as text', async () => {
    const t = hqMcpTools.find((x) => x.name === 'hqAddSiteVideo')!
    const bad = (await t.handler({ hqMediaId: 999999, posterHqMediaId: 999999, language: 'en', title: 'x', posterAlt: 'x' }, await newReq(), undefined)) as {
      content: { text: string }[]
    }
    expect(bad.content[0].text).toMatch(/^Error: hqMediaId: no HQ media/)
  })
})
