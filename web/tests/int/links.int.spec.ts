// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-sqlite'
import config from '@/payload.config'

import { getLinkPage } from '@/lib/data'
import {
  buildLinkPage,
  checkLinkUrl,
  externalUrls,
  isShownOn,
  localizeUrl,
  sourceFromParam,
  trackedHref,
  type LinkPageDoc,
} from '@/lib/links'
import { decidePublish, diffLines, formatValue, requestPublish } from '@/lib/publishRequests'
import { parseTrackedLink } from '@/lib/tracking'
import { up as seedLinkPage } from '@/migrations/20261009_191159_seed_link_page'
import type { User } from '@/payload-types'

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                              */
/* ------------------------------------------------------------------------ */

describe('link page urls', () => {
  it('takes site paths without a language, or https addresses', () => {
    expect(checkLinkUrl('/events')).toBeNull()
    expect(checkLinkUrl('/list-your-spot?type=listing')).toBeNull()
    expect(checkLinkUrl('/')).toBeNull()
    expect(checkLinkUrl('https://www.tiktok.com/@flamingo.county')).toBeNull()
    expect(checkLinkUrl('/es/events')).toMatch(/Leave out/)
    expect(checkLinkUrl('/en')).toMatch(/Leave out/)
    expect(checkLinkUrl('//evil.com')).toMatch(/Start with/)
    expect(checkLinkUrl('/\\evil.com')).toMatch(/Start with/)
    expect(checkLinkUrl('http://example.com')).toMatch(/Start with/)
    expect(checkLinkUrl('javascript:alert(1)')).toMatch(/Start with/)
    expect(checkLinkUrl('')).toMatch(/Give a path/)
  })

  it('adds the visitor’s language to a site path only', () => {
    expect(localizeUrl('/events', 'es')).toBe('/es/events')
    expect(localizeUrl('/', 'en')).toBe('/en')
    expect(localizeUrl('/?city=lakes', 'en')).toBe('/en?city=lakes')
    expect(localizeUrl('/list-your-spot?type=event', 'en')).toBe('/en/list-your-spot?type=event')
    expect(localizeUrl('https://www.instagram.com/flamingo.county/', 'es')).toBe('https://www.instagram.com/flamingo.county/')
  })

  it('names the source from the bio’s ?from=, or bio', () => {
    expect(sourceFromParam('ig')).toBe('ig')
    expect(sourceFromParam('TT')).toBe('tt')
    expect(sourceFromParam(['fb', 'ig'])).toBe('fb')
    expect(sourceFromParam(undefined)).toBe('bio')
    expect(sourceFromParam('')).toBe('bio')
    expect(sourceFromParam('<script>')).toBe('bio')
    expect(sourceFromParam('a'.repeat(30))).toBe('bio')
  })

  it('builds the /go/ link every button goes through', () => {
    expect(trackedHref('/events', 'es', 'ig')).toBe('/go/ig?to=%2Fes%2Fevents')
    expect(trackedHref('/list-your-spot?type=listing', 'en', 'bio')).toBe('/go/bio?to=%2Fen%2Flist-your-spot%3Ftype%3Dlisting')
    expect(trackedHref('https://www.tiktok.com/@flamingo.county', 'es', 'tt')).toBe(
      '/go/tt?to=https%3A%2F%2Fwww.tiktok.com%2F%40flamingo.county',
    )
  })
})

describe('/go/ from the link page', () => {
  const tiktok = 'https://www.tiktok.com/@flamingo.county'

  it('counts a bio click under its platform and lands with UTM tags', () => {
    expect(parseTrackedLink(['ig'], '/es/events')).toEqual({
      source: 'instagram',
      draftId: undefined,
      location: '/es/events?utm_source=instagram&utm_medium=social&utm_campaign=bio',
    })
    // No platform named: still social traffic, not "offline".
    expect(parseTrackedLink(['bio'], '/es/stories')?.location).toBe(
      '/es/stories?utm_source=bio&utm_medium=social&utm_campaign=bio',
    )
  })

  it('leaves the site only for an address on the published page', () => {
    const allowed = new Set([tiktok])
    expect(parseTrackedLink(['tt'], tiktok, allowed)).toEqual({ source: 'tiktok', draftId: undefined, location: tiktok })
    expect(parseTrackedLink(['tt'], 'https://evil.example/phish', allowed)?.location).toMatch(/^\/links\?utm_source=tiktok/)
    expect(parseTrackedLink(['tt'], tiktok)?.location).toMatch(/^\/links\?/)
  })
})

describe('what the link page shows', () => {
  const doc: LinkPageDoc = {
    taglineEs: 'Hola',
    taglineEn: 'Hello',
    sections: [
      {
        id: 's1',
        emoji: '📅',
        titleEs: 'Esta semana',
        titleEn: 'This week',
        buttons: [
          { id: 'b1', emoji: '🎉', labelEs: 'Eventos', labelEn: 'Events', url: '/events', featured: true },
          {
            id: 'b2',
            emoji: '🎃',
            labelEs: 'Halloween',
            labelEn: 'Halloween',
            url: '/halloween',
            startsOn: '2026-10-20T00:00:00.000Z',
            endsOn: '2026-10-31T00:00:00.000Z',
          },
        ],
      },
      {
        id: 's2',
        emoji: '📖',
        titleEs: 'Historias',
        titleEn: 'Stories',
        buttons: [
          { id: 'b3', emoji: '🆕', labelEs: 'La nueva', labelEn: 'The newest', kind: 'newestStory' },
          { id: 'b4', emoji: '📚', labelEs: 'Todas', labelEn: '', url: '/stories' },
          { id: 'b5', emoji: '⚠️', labelEs: 'Rota', labelEn: 'Broken', url: '/es/stories' },
        ],
      },
      {
        id: 's3',
        emoji: '📲',
        titleEs: 'Síguenos',
        titleEn: 'Follow us',
        buttons: [{ id: 'b6', labelEs: 'TikTok', labelEn: 'TikTok', url: 'https://www.tiktok.com/@flamingo.county' }],
      },
    ],
  }
  const build = (today: string, newestStory: { slug: string; title: string } | null = null, lang: 'es' | 'en' = 'es') =>
    buildLinkPage(doc, { lang, today, from: 'ig', newestStory })

  it('shows a dated button on its days only, both ends included', () => {
    const on = (today: string) => isShownOn({ startsOn: '2026-10-20T00:00:00.000Z', endsOn: '2026-10-31T00:00:00.000Z' }, today)
    expect(on('2026-10-19')).toBe(false)
    expect(on('2026-10-20')).toBe(true)
    expect(on('2026-10-31')).toBe(true)
    expect(on('2026-11-01')).toBe(false)
    expect(isShownOn({ endsOn: '2026-10-31' }, '2026-01-01')).toBe(true)
    expect(isShownOn({}, '2026-01-01')).toBe(true)

    const labels = (today: string) => build(today).sections.flatMap((s) => s.buttons.map((b) => b.label))
    expect(labels('2026-10-19')).not.toContain('Halloween')
    expect(labels('2026-10-25')).toContain('Halloween')
    expect(labels('2026-11-01')).not.toContain('Halloween')
  })

  it('puts featured buttons first and drops a section left empty', () => {
    const page = build('2026-10-01')
    expect(page.featured.map((b) => b.label)).toEqual(['Eventos'])
    expect(page.featured[0].href).toBe('/go/ig?to=%2Fes%2Fevents')
    // Esta semana's only other button is out of its window.
    expect(page.sections.map((s) => s.title)).toEqual(['Historias', 'Síguenos'])
  })

  it('links the newest story when there is one, and skips bad urls', () => {
    expect(build('2026-10-01').sections[0].buttons.map((b) => b.label)).toEqual(['Todas'])
    const withStory = build('2026-10-01', { slug: 'six-inches', title: 'Seis pulgadas' }).sections[0].buttons[0]
    expect(withStory).toMatchObject({ label: 'La nueva', sub: 'Seis pulgadas', href: '/go/ig?to=%2Fes%2Fstories%2Fsix-inches' })
    const tiktok = build('2026-10-01').sections[1].buttons[0]
    expect(tiktok).toMatchObject({ external: true, href: '/go/ig?to=https%3A%2F%2Fwww.tiktok.com%2F%40flamingo.county' })
    expect(externalUrls(doc)).toEqual(new Set(['https://www.tiktok.com/@flamingo.county']))
  })

  it('shows each language its own words, the other when one is empty', () => {
    const en = build('2026-10-01', null, 'en')
    expect(en.tagline).toBe('Hello')
    expect(en.featured[0]).toMatchObject({ label: 'Events', href: '/go/ig?to=%2Fen%2Fevents' })
    expect(en.sections.map((s) => s.title)).toEqual(['Stories', 'Follow us'])
    expect(en.sections[0].buttons.map((b) => b.label)).toEqual(['Todas'])
    expect(build('2026-10-01').tagline).toBe('Hola')
  })

  it('shows the owner each changed button, not a clipped blob', () => {
    expect(formatValue([{ id: 's', emoji: '📲', titleEs: 'Síguenos', buttons: [{ id: 'b', labelEs: 'TikTok' }] }])).toBe(
      '📲 Síguenos [TikTok]',
    )
    const fields = [
      {
        name: 'sections',
        type: 'array',
        flattenedFields: [
          { name: 'id' },
          { name: 'titleEs' },
          { name: 'buttons', type: 'array', flattenedFields: [{ name: 'id' }, { name: 'labelEs' }, { name: 'url' }] },
        ],
      },
    ]
    const live = { es: { sections: [{ id: 'a', titleEs: 'Lugares', buttons: [{ id: 'x', labelEs: 'Hialeah', url: '/hialeah' }] }] } }
    const draft = {
      es: {
        sections: [
          { id: 'b', titleEs: 'Lugares', buttons: [{ id: 'y', labelEs: 'Hialeah', url: '/hialeah?x=1' }, { id: 'z', labelEs: 'Lakes', url: '/lakes' }] },
          { id: 'c', titleEs: 'Nueva', buttons: [] },
        ],
      },
    }
    expect(diffLines('link-page', fields, live, draft).lines).toEqual([
      '• sections[1] “Lugares” › buttons[1] “Hialeah”.url: /hialeah → /hialeah?x=1',
      '• sections[1] “Lugares” › buttons[2] “Lakes”: added: Lakes /lakes',
      '• sections[2] “Nueva”: added: Nueva',
    ])
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database                                                      */
/* ------------------------------------------------------------------------ */

describe('the link page global', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  let before: unknown

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    before = await payload.findGlobal({ slug: 'link-page', depth: 0, overrideAccess: true })
    user = await payload.create({
      collection: 'users',
      data: { email: `links-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'hq-publish-requests', where: { collection: { equals: 'link-page' } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-events', where: { type: { like: 'site.' } }, overrideAccess: true })
    await payload.updateGlobal({ slug: 'link-page', data: before as never, overrideAccess: true }).catch(() => undefined)
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  const draftPage = () => payload.findGlobal({ slug: 'link-page', depth: 0, draft: true, overrideAccess: true })

  it('is seeded once, published, with each label in both languages', async () => {
    // Empty it first, so the seed runs on a database pushed without migrations.
    await payload.updateGlobal({ slug: 'link-page', data: { sections: [], _status: 'published' } as never, overrideAccess: true })
    const db = (payload.db as unknown as { drizzle: { run: (q: unknown) => Promise<unknown> } }).drizzle
    // As in production on the day it ships: the page has no versions yet.
    await db.run(sql`DELETE FROM \`_link_page_v\`;`)
    const args = { db: db as never, payload, req: {} as never }
    await seedLinkPage(args)
    await seedLinkPage(args) // a re-run leaves it alone

    const page = await getLinkPage()
    expect(page.sections?.map((s) => s.titleEs)).toEqual(['Esta semana', 'Historias', 'Lugares', 'Únete', 'Síguenos'])
    expect(page.sections?.map((s) => s.titleEn)).toEqual(['This week', 'Stories', 'Places', 'Get listed', 'Follow us'])
    expect(page.sections?.[0].buttons?.[0]).toMatchObject({
      labelEs: 'Eventos de la semana',
      labelEn: 'This week’s events',
      url: '/events',
      featured: true,
    })
    expect(page.taglineEs).toBe('Los lugares que tus vecinos respaldan')
    for (const s of page.sections ?? []) {
      for (const b of s.buttons ?? []) {
        if (b.kind === 'link') expect(checkLinkUrl(b.url), b.url ?? '').toBeNull()
        expect(`${b.labelEs} ${b.labelEn}`).not.toMatch(/Havana|Habana/)
      }
    }
    // The first draft builds on the seeded page, not on an empty one.
    expect((await draftPage()).sections).toHaveLength(5)
  })

  it('takes only drafts over MCP, which stay off the page until the owner publishes', async () => {
    await expect(
      payload.updateGlobal({ slug: 'link-page', data: { taglineEs: 'Live!' }, req: mcpReq, overrideAccess: false }),
    ).rejects.toThrow(/only be saved as a draft/)

    await payload.updateGlobal({
      slug: 'link-page',
      data: { taglineEs: 'Borrador', _status: 'published' } as never,
      draft: true,
      req: mcpReq,
      overrideAccess: false,
    })
    expect((await getLinkPage()).taglineEs).toBe('Los lugares que tus vecinos respaldan')
    // Anonymous readers get the live page, drafts or not.
    const anon = await payload.findGlobal({ slug: 'link-page', draft: true, overrideAccess: false })
    expect(anon.taglineEs).toBe('Los lugares que tus vecinos respaldan')

    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = '1001'
    const sent: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: unknown, init?: RequestInit) => {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
        if (body.text) sent.push(String(body.text))
        return Response.json({ ok: true, result: { message_id: 700 + sent.length } })
      }),
    )
    const { requestId, title } = await requestPublish(payload, { collection: 'link-page', reason: 'New tagline' })
    expect(title).toBe('Changes to the link-page')
    expect(sent.at(-1)).toContain('• taglineEs: Los lugares que tus vecinos respaldan → Borrador')
    expect(sent.at(-1)).not.toContain('sections')

    expect(await decidePublish(payload, requestId, 'publish')).toMatch(/Published/)
    const live = await getLinkPage()
    expect(live.taglineEs).toBe('Borrador')
    expect(live.taglineEn).toBe('The spots your neighbors vouch for')
    expect(live.sections).toHaveLength(5)
  })

  describe('through /api/mcp with a real key', () => {
    let keyId: number
    const apiKey = randomBytes(24).toString('hex')
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
      const line = raw.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : raw)
    }
    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await rpc('tools/call', { name, arguments: args })
      return String(res.result?.content?.[0]?.text ?? JSON.stringify(res))
    }

    beforeAll(async () => {
      const key = await payload.create({
        collection: 'payload-mcp-api-keys',
        data: { user: user.id, label: 'links test', enableAPIKey: true, apiKey, linkPage: { find: true, update: true } } as never,
        overrideAccess: true,
      })
      keyId = key.id
    })
    afterAll(async () => {
      if (keyId) await payload.delete({ collection: 'payload-mcp-api-keys', id: keyId, overrideAccess: true })
    })

    it('offers find and update on the link page', async () => {
      const names: string[] = (await rpc('tools/list', {})).result.tools.map((t: { name: string }) => t.name)
      expect(names).toEqual(expect.arrayContaining(['findLinkPage', 'updateLinkPage']))
    })

    it('adds a button in both languages in one call, as the tool description says', async () => {
      const found = JSON.parse((await call('findLinkPage', { draft: true })).replace(/^[^{]*/, '').replace(/[^}]*$/, ''))
      // The tools take rows without ids, so the whole array is sent back as read, minus ids.
      const strip = (v: unknown): unknown =>
        Array.isArray(v)
          ? v.map(strip)
          : v && typeof v === 'object'
            ? Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== 'id' && x !== null).map(([k, x]) => [k, strip(x)]))
            : v
      const sections = strip(found.sections) as { buttons: Record<string, unknown>[] }[]
      sections[1].buttons.push({ emoji: '🎃', labelEs: 'Halloween', labelEn: 'Halloween night', kind: 'link', url: '/halloween' })
      expect(await call('updateLinkPage', { sections, draft: true })).toMatch(/updated successfully/)

      const draft = await draftPage()
      expect(draft.sections?.[1].buttons?.at(-1)).toMatchObject({ labelEs: 'Halloween', labelEn: 'Halloween night', url: '/halloween' })
      expect(draft.sections?.[0].buttons?.[0]).toMatchObject({ labelEs: 'Eventos de la semana', labelEn: 'This week’s events' })
      expect(draft.sections).toHaveLength(5)
      // Still a draft: the live page is unchanged.
      expect((await getLinkPage()).sections?.[1].buttons?.map((b) => b.labelEs)).not.toContain('Halloween')
    })

    it('refuses a write that is not a draft, and a link with the language in it', async () => {
      expect(await call('updateLinkPage', { taglineEs: 'Live!' })).toMatch(/only be saved as a draft/)
      const bad = await call('updateLinkPage', {
        draft: true,
        sections: [{ titleEs: 'X', titleEn: 'X', buttons: [{ labelEs: 'a', labelEn: 'a', kind: 'link', url: '/es/events' }] }],
      })
      expect(bad).toMatch(/Leave out|invalid/i)
    })
  })
})
