// @vitest-environment node
import { existsSync } from 'fs'
import path from 'path'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { hqMediaDir } from '@/collections/HqMedia'
import { HQ_INTERNAL } from '@/lib/hq'
import { purgeDraftVideos } from '@/lib/hqMediaPurge'
import { hqMcpTools } from '@/lib/mcpTools'

/** hqPurgeDraftVideos: old reel videos leave the volume; anything a draft may still post stays. */

const mp4 = () =>
  Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypisom', 'latin1'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isomiso2', 'latin1'),
    Buffer.alloc(4096, 1),
  ])
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const DAY = 86_400_000

describe('purgeDraftVideos', () => {
  let payload: Payload
  const media: number[] = []
  const drafts: number[] = []
  // Everything below is "created today"; judging it from 10 days on makes it old enough.
  const later = new Date(Date.now() + 10 * DAY)

  const addVideo = async (name: string) => {
    const buf = mp4()
    const m = await payload.create({
      collection: 'hq-media',
      data: { note: 'TEST purge' },
      file: { data: buf, mimetype: 'video/mp4', name: `${name}-${Date.now()}.mp4`, size: buf.length },
      overrideAccess: true,
    })
    media.push(m.id)
    return m
  }
  const addDraft = async (status: string, scheduledFor: Date, mediaId: number) => {
    const d = await payload.create({
      collection: 'hq-social-drafts',
      data: { caption: 'TEST purge', platforms: ['instagram'], status, scheduledFor: scheduledFor.toISOString(), media: [mediaId] } as never,
      overrideAccess: true,
      context: { [HQ_INTERNAL]: true },
    })
    drafts.push(d.id)
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })
  afterAll(async () => {
    for (const id of drafts) await payload.delete({ collection: 'hq-social-drafts', id, overrideAccess: true }).catch(() => undefined)
    for (const id of media) await payload.delete({ collection: 'hq-media', id, overrideAccess: true }).catch(() => undefined)
  })

  it('reports first, then deletes an old posted video and its file', async () => {
    const v = await addVideo('posted')
    await addDraft('published', new Date(Date.now() - DAY), v.id)
    const file = path.join(hqMediaDir(), v.filename!)
    expect(existsSync(file)).toBe(true)

    const dry = await purgeDraftVideos(payload, [v.id], { now: later })
    expect(dry.dryRun).toBe(true)
    expect(dry.deleted.map((x) => x.id)).toEqual([v.id])
    expect(existsSync(file)).toBe(true)

    const real = await purgeDraftVideos(payload, [v.id], { now: later, dryRun: false })
    expect(real.deleted.map((x) => x.id)).toEqual([v.id])
    expect(real.freedBytes).toBe(v.filesize)
    expect(existsSync(file)).toBe(false)
    await expect(payload.findByID({ collection: 'hq-media', id: v.id, overrideAccess: true })).rejects.toThrow()
  })

  it('keeps a video a draft may still post, a new video and a photo', async () => {
    const pending = await addVideo('pending')
    await addDraft('pending', new Date(Date.now() - 30 * DAY), pending.id)
    const upcoming = await addVideo('upcoming')
    await addDraft('scheduled', new Date(later.getTime() + DAY), upcoming.id)
    const fresh = await addVideo('fresh')
    const buf = PNG
    const photo = await payload.create({
      collection: 'hq-media',
      data: { note: 'TEST purge' },
      file: { data: buf, mimetype: 'image/png', name: `photo-${Date.now()}.png`, size: buf.length },
      overrideAccess: true,
    })
    media.push(photo.id)

    const old = await purgeDraftVideos(payload, [pending.id, upcoming.id, photo.id, 999_999], { now: later, dryRun: false })
    expect(old.deleted).toEqual([])
    const why = Object.fromEntries(old.refused.map((r) => [r.id, r.reason]))
    expect(why[pending.id]).toMatch(/pending draft/)
    expect(why[upcoming.id]).toMatch(/scheduled draft/)
    expect(why[photo.id]).toBe('not a video')
    expect(why[999_999]).toBe('not found')

    const now = await purgeDraftVideos(payload, [fresh.id], { dryRun: false })
    expect(now.refused[0].reason).toMatch(/newer than 7 days/)
    expect(existsSync(path.join(hqMediaDir(), fresh.filename!))).toBe(true)
  })

  it('is a tool that defaults to a dry run', async () => {
    const t = hqMcpTools.find((x) => x.name === 'hqPurgeDraftVideos')!
    expect(Object.keys(t.parameters as Record<string, unknown>).sort()).toEqual(['dryRun', 'ids'])
    const v = await addVideo('tool')
    const res = (await t.handler({ ids: [v.id] }, { payload } as never, undefined)) as { content: { text: string }[] }
    const out = JSON.parse(res.content[0].text)
    expect(out.dryRun).toBe(true)
    expect(out.refused[0].reason).toMatch(/newer than 7 days/)
  })
})
