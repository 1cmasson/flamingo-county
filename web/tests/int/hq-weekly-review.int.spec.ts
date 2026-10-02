// @vitest-environment node
// Node, not jsdom: the MCP endpoint test builds a real Request and reads a streamed Response.
import { randomBytes } from 'crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { addDays, todayISO } from '@/lib/dates'
import { HQ_INTERNAL } from '@/lib/hq'
import { hqMcpTools, weeklyReviewContext } from '@/lib/mcpTools'
import type { User } from '@/payload-types'

/**
 * The weekly social review: `hqWeeklyReviewContext` (what the routine reads) and the
 * `hq-playbook` global (what it writes). See web/hq/weekly-review.md.
 */

/** A Miami calendar date n days from today, the way the context counts days. */
const miamiDay = (n: number) => addDays(todayISO(), n)
const EMPTY_PLAYBOOK = { body: null, updatedFrom: { from: null, to: null }, sampleSize: null }

// Contact details that must never reach the context, whatever else is in the database.
const PII_EMAIL = `pii-canary-${Date.now()}@example.com`
const PII_PHONE = '305-555-0199'
const EMAILISH = /[\w.+-]+@[\w-]+\.[\w.]+/
const PHONEISH = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/

describe('weekly social review', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  const cleanup: [string, number][] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = await payload.create({
      collection: 'users',
      data: { email: `weekly-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    // What the MCP endpoint hands every tool: the key's user, flagged as MCP.
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
    await payload.updateGlobal({ slug: 'hq-playbook', data: EMPTY_PLAYBOOK, overrideAccess: true })
  })

  // Telegram stays unset throughout, so intake pings and previews skip the network.
  beforeAll(() => {
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no network in this suite', { status: 500 })))
  })
  afterAll(() => vi.unstubAllGlobals())

  afterAll(async () => {
    if (!payload) return
    for (const [collection, id] of cleanup.reverse()) {
      await payload.delete({ collection: collection as never, id, overrideAccess: true }).catch(() => undefined)
    }
    await payload.delete({ collection: 'hq-events', where: { type: { equals: 'listing_request.created' } }, overrideAccess: true }).catch(() => undefined)
    await payload.updateGlobal({ slug: 'hq-playbook', data: EMPTY_PLAYBOOK, overrideAccess: true })
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  it('has the same shape with nothing to report', async () => {
    // Far enough ahead that no post, stat or event in the test database falls in the window.
    const ctx = await weeklyReviewContext(payload, new Date('2099-06-01T12:00:00Z'))
    expect(ctx.socialReport).toEqual({ windowDays: 28, posts: [], accounts: {}, bioClicks: {} })
    expect(ctx.playbook).toBeNull()
    expect(ctx.upcomingEvents).toEqual({ from: '2099-06-01', to: '2099-06-15', events: [] })
    expect(Array.isArray(ctx.recentStories)).toBe(true)
    expect(Array.isArray(ctx.pendingDrafts)).toBe(true)
    expect(typeof ctx.generatedMiami).toBe('string')
  })

  describe('with content', () => {
    let liveEvent: number
    let draftOnlyEvent: number
    let pastEvent: number
    let farEvent: number
    let story: number
    let socialDraft: number
    const tag = `wr-${Date.now()}`

    beforeAll(async () => {
      const kind = await payload.create({
        collection: 'event-kinds',
        data: { slug: `${tag}-kind`, label: 'Música', bg: '#000', ink: '#fff' },
        overrideAccess: true,
      })
      cleanup.push(['event-kinds', kind.id])

      const event = async (slug: string, offsetDays: number, status: 'published' | 'draft') => {
        const data = {
          slug: `${tag}-${slug}`,
          title: `Noche ${slug}`,
          date: `${miamiDay(offsetDays)}T12:00:00.000Z`,
          timeLabel: '9PM–1AM',
          startTime: '21:00',
          endTime: '01:00',
          kind: kind.id,
          venueType: 'place' as const,
          place: 'Calle Ocho',
          eventStatus: 'scheduled' as const,
          // The listing request's phone, put where a careless read could pick it up.
          note: `Info: ${PII_PHONE}`,
        }
        const opts = { collection: 'events', locale: 'es', overrideAccess: true } as const
        // A never-published draft is the case to keep out: staff can read it, the site can't.
        const doc =
          status === 'draft'
            ? await payload.create({ ...opts, data: { ...data, _status: 'draft' }, draft: true })
            : await payload.create({ ...opts, data: { ...data, _status: 'published' } })
        if (status === 'published') {
          await payload.update({ ...opts, id: doc.id, data: { title: `Night ${slug}`, _status: 'published' }, locale: 'en' })
        }
        cleanup.push(['events', doc.id])
        return doc.id
      }
      liveEvent = await event('live', 3, 'published')
      draftOnlyEvent = await event('draft', 4, 'draft')
      pastEvent = await event('past', -5, 'published')
      farEvent = await event('far', 30, 'published')

      const s = await payload.create({
        collection: 'stories',
        data: { slug: `${tag}-story`, title: `Historia ${tag}`, _status: 'published' },
        locale: 'es',
        overrideAccess: true,
      })
      story = s.id
      cleanup.push(['stories', s.id])

      const d = await payload.create({
        collection: 'hq-social-drafts',
        data: {
          caption: `WR-TEST pending ${tag}`,
          platforms: ['facebook'],
          scheduledFor: `${miamiDay(2)}T15:30:00.000Z`,
          pillar: 'event',
          language: 'es',
        },
        overrideAccess: true,
        context: { [HQ_INTERNAL]: true },
      })
      socialDraft = d.id
      cleanup.push(['hq-social-drafts', d.id])

      // Visitor data that must never come through.
      const lr = await payload.create({
        collection: 'listing-requests',
        data: { business: `Café ${tag}`, owner: 'Canary Owner', phone: PII_PHONE, email: PII_EMAIL, story: 'secret story' },
        overrideAccess: true,
      })
      cleanup.push(['listing-requests', lr.id])
      const sub = await payload.create({
        collection: 'subscribers',
        data: { email: `sub-${PII_EMAIL}` },
        overrideAccess: true,
      })
      cleanup.push(['subscribers', sub.id])

      await payload.updateGlobal({
        slug: 'hq-playbook',
        data: { body: '## Lo que funciona\n- Not enough data yet (2 posts).', updatedFrom: { from: '2026-09-01', to: '2026-09-28' }, sampleSize: 2 },
        overrideAccess: true,
      })
    })

    it('lists published upcoming events only, in both languages', async () => {
      const ctx = await weeklyReviewContext(payload)
      const ids = ctx.upcomingEvents.events.map((e) => e.id)
      expect(ids).toContain(liveEvent)
      expect(ids).not.toContain(draftOnlyEvent)
      expect(ids).not.toContain(pastEvent)
      expect(ids).not.toContain(farEvent)

      const e = ctx.upcomingEvents.events.find((x) => x.id === liveEvent)!
      expect(e).toEqual({
        id: liveEvent,
        slug: `${tag}-live`,
        title: { es: 'Noche live', en: 'Night live' },
        date: miamiDay(3),
        // 9PM to 1AM finishes the next day.
        endDay: miamiDay(4),
        // Written in Spanish only: no fallback, so a missing translation shows as missing.
        timeLabel: { es: '9PM–1AM', en: null },
        hasImage: false,
        path: { es: `/es/events/${tag}-live`, en: `/en/events/${tag}-live` },
      })
    })

    it('includes the newest stories, pending drafts and the playbook', async () => {
      const ctx = await weeklyReviewContext(payload)
      expect(ctx.recentStories.find((s) => s.id === story)).toMatchObject({
        slug: `${tag}-story`,
        title: { es: `Historia ${tag}` },
        hasImage: false,
        path: { es: `/es/stories/${tag}-story` },
      })
      expect(ctx.pendingDrafts.find((d) => d.id === socialDraft)).toMatchObject({
        pillar: 'event',
        language: 'es',
        platforms: ['facebook'],
        caption: `WR-TEST pending ${tag}`,
      })
      expect(ctx.playbook).toMatchObject({
        body: expect.stringContaining('Not enough data yet'),
        updatedFrom: { from: '2026-09-01', to: '2026-09-28' },
        sampleSize: 2,
      })
      expect(ctx.socialReport.windowDays).toBe(28)
    })

    it('carries no contact details from listing requests, subscribers or event notes', async () => {
      const tool = hqMcpTools.find((t) => t.name === 'hqWeeklyReviewContext')!
      const out = (await tool.handler({}, mcpReq, undefined)) as { content: { text: string }[] }
      const json = out.content[0].text
      expect(JSON.parse(json).upcomingEvents.events.length).toBeGreaterThan(0)
      expect(json).not.toContain(PII_EMAIL)
      expect(json).not.toContain(PII_PHONE)
      expect(json).not.toContain('Canary Owner')
      expect(json).not.toContain('secret story')
      expect(json).not.toMatch(EMAILISH)
      expect(json).not.toMatch(PHONEISH)
    })
  })

  describe('the playbook global', () => {
    it('is staff-only', async () => {
      await expect(payload.findGlobal({ slug: 'hq-playbook', overrideAccess: false })).rejects.toThrow()
      await expect(
        payload.updateGlobal({ slug: 'hq-playbook', data: { body: 'anon' }, overrideAccess: false }),
      ).rejects.toThrow()
    })

    it('takes an update over MCP from a staff key', async () => {
      const saved = await payload.updateGlobal({
        slug: 'hq-playbook',
        data: { body: 'Eventos en español funcionan (n=4).', updatedFrom: { from: '2026-09-03', to: '2026-09-30' }, sampleSize: 4 },
        req: mcpReq,
        overrideAccess: false,
      })
      expect(saved).toMatchObject({ body: 'Eventos en español funcionan (n=4).', sampleSize: 4 })
      const fresh = await payload.findGlobal({ slug: 'hq-playbook', req: mcpReq, overrideAccess: false })
      expect(fresh.updatedFrom?.from?.slice(0, 10)).toBe('2026-09-03')
    })
  })

  describe('through /api/mcp with a real key', () => {
    let keyId: number
    const apiKey = randomBytes(24).toString('hex')

    /** One JSON-RPC call to the MCP endpoint, the way Claude Code makes it. */
    const rpc = async (method: string, params: Record<string, unknown>) => {
      const endpoint = payload.config.endpoints.find((e) => e.path === '/mcp' && e.method === 'post')!
      const req = await createLocalReq({}, payload)
      Object.assign(req, {
        url: 'http://localhost:3104/api/mcp',
        method: 'POST',
        headers: new Headers({
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        }),
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      const res = (await endpoint.handler(req as PayloadRequest)) as Response
      const raw = await res.text()
      // Streamable HTTP answers as SSE: the JSON-RPC reply is the `data:` line.
      const line = raw.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : raw)
    }

    beforeAll(async () => {
      const key = await payload.create({
        collection: 'payload-mcp-api-keys',
        data: {
          user: user.id,
          label: 'weekly-review test',
          enableAPIKey: true,
          apiKey,
          hqSocialDrafts: { find: true, create: true },
          hqPlaybook: { find: true, update: true },
          'payload-mcp-tool': {
            hqBrief: false,
            hqSocialReport: false,
            hqAddDraftMediaFromUrl: false,
            hqRequestPublish: false,
            hqPublishStatus: false,
            hqSendTelegram: true,
            hqWeeklyReviewContext: true,
          },
        } as never,
        overrideAccess: true,
      })
      keyId = key.id
    })

    afterAll(async () => {
      if (keyId) await payload.delete({ collection: 'payload-mcp-api-keys', id: keyId, overrideAccess: true })
    })

    it('offers exactly the ticked tools, and none that publish or approve', async () => {
      const list = await rpc('tools/list', {})
      const names: string[] = list.result.tools.map((t: { name: string }) => t.name)
      expect(names).toEqual(
        expect.arrayContaining(['hqWeeklyReviewContext', 'hqSendTelegram', 'findHqPlaybook', 'updateHqPlaybook', 'findHqSocialDrafts', 'createHqSocialDrafts']),
      )
      for (const absent of ['hqRequestPublish', 'hqBrief', 'updateHqSocialDrafts', 'updateEvents', 'createEvents', 'findListingRequests']) {
        expect(names).not.toContain(absent)
      }
    })

    it('runs the context tool and writes the playbook', async () => {
      const ctx = await rpc('tools/call', { name: 'hqWeeklyReviewContext', arguments: {} })
      const body = JSON.parse(ctx.result.content[0].text)
      expect(Object.keys(body).sort()).toEqual(['generatedMiami', 'pendingDrafts', 'playbook', 'recentStories', 'socialReport', 'upcomingEvents'])

      const upd = await rpc('tools/call', {
        name: 'updateHqPlaybook',
        arguments: { body: 'Escrito por MCP (n=1, sin conclusiones).', sampleSize: 1 },
      })
      expect(upd.result.content[0].text).toMatch(/updated successfully/)
      const fresh = await payload.findGlobal({ slug: 'hq-playbook', overrideAccess: true })
      expect(fresh.body).toBe('Escrito por MCP (n=1, sin conclusiones).')
    })
  })
})
