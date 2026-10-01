// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { getStories, getStory } from '@/lib/data'
import { decidePublish, diffLines, formatValue, hasPendingDraft, parsePublishCallback, requestPublish } from '@/lib/publishRequests'
import { handleUpdate } from '@/lib/telegramBot'
import type { Story, User } from '@/payload-types'

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                              */
/* ------------------------------------------------------------------------ */

describe('what the owner reads', () => {
  const fields = [
    { name: 'id' },
    { name: 'slug' },
    { name: 'title', localized: true },
    { name: 'publicationStatus' },
    { name: '_status' },
  ]

  it('shows live → draft per language, untranslated fields once, and warns', () => {
    const { lines, warnings } = diffLines(
      'listings',
      fields,
      { es: { slug: 'viejo', title: 'Hola', publicationStatus: 'unsourced', _status: 'published' }, en: { slug: 'viejo', title: 'Hello', publicationStatus: 'unsourced' } },
      { es: { slug: 'nuevo', title: 'Hola mundo', publicationStatus: 'ready', _status: 'draft' }, en: { slug: 'nuevo', title: 'Hello', publicationStatus: 'ready' } },
    )
    expect(lines).toEqual([
      '• slug: viejo → nuevo',
      '• title (es): Hola → Hola mundo',
      '• publicationStatus: unsourced → ready',
    ])
    expect(warnings.join(' ')).toMatch(/links .* will break/)
    expect(warnings.join(' ')).toMatch(/every field traces to a real source/)
  })

  it('lists a new page’s filled-in fields without arrows', () => {
    const { lines } = diffLines('stories', fields, {}, { es: { slug: 'n', title: 'Nueva', publicationStatus: null }, en: { slug: 'n', title: '' } })
    expect(lines).toEqual(['• slug: n', '• title (es): Nueva'])
  })

  it('flattens story blocks and parses only its own buttons', () => {
    expect(formatValue([{ blockType: 'paragraph', text: 'Uno', id: 'x' }])).toBe('[paragraph] Uno')
    expect(parsePublishCallback('pb:a:4')).toEqual({ action: 'publish', id: 4 })
    expect(parsePublishCallback('pb:r:4')).toEqual({ action: 'reject', id: 4 })
    expect(parsePublishCallback('sd:a:4')).toBeNull()
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database                                                      */
/* ------------------------------------------------------------------------ */

const OWNER = 1001
const STRANGER = 2002

function fakeTelegram(opts: { down?: boolean } = {}) {
  const sent: { method: string; body: Record<string, unknown> }[] = []
  let messageId = 500
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const method = String(input).split('/').pop()!
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      sent.push({ method, body })
      if (opts.down && method === 'sendMessage') return Response.json({ ok: false, description: 'down' })
      return Response.json({ ok: true, result: { message_id: ++messageId } })
    }),
  )
  return { messages: () => sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.text)), sent }
}

describe('drafts are free, publishing needs the owner', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  let story: Story
  const stories: number[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = await payload.create({
      collection: 'users',
      data: { email: `publish-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
    story = await payload.create({
      collection: 'stories',
      data: { slug: `pb-live-${Date.now()}`, title: 'Hello', _status: 'published' },
      locale: 'en',
      overrideAccess: true,
    })
    await payload.update({ collection: 'stories', id: story.id, data: { title: 'Hola', _status: 'published' }, locale: 'es', overrideAccess: true })
    stories.push(story.id)
  })

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = String(OWNER)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'hq-publish-requests', where: { id: { exists: true } }, overrideAccess: true })
    for (const id of stories) await payload.delete({ collection: 'stories', id, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'hq-events', where: { type: { like: 'site.' } }, overrideAccess: true })
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  /** What a visitor sees: the site's own query helpers. */
  const visible = async (lang: 'es' | 'en' = 'es') => (await getStory(lang, story.slug))?.title
  /** Claude saving a draft over MCP. */
  const claudeDraft = (data: Record<string, unknown>, locale: 'es' | 'en' = 'es') =>
    payload.update({ collection: 'stories', id: story.id, data, locale, draft: true, req: mcpReq, overrideAccess: false })
  const tap = (id: number, action: 'a' | 'r' = 'a', from = OWNER) =>
    handleUpdate(payload, {
      callback_query: { id: 'cb', from: { id: from }, data: `pb:${action}:${id}`, message: { chat: { id: from }, message_id: 1 } },
    })
  const status = async (id: number) =>
    (await payload.findByID({ collection: 'hq-publish-requests', id, overrideAccess: true })).status

  it('refuses any MCP write that is not a draft', async () => {
    await expect(
      payload.update({ collection: 'stories', id: story.id, data: { title: 'Live!' }, locale: 'es', req: mcpReq, overrideAccess: false }),
    ).rejects.toThrow(/only be saved as a draft/)
    await expect(
      payload.create({ collection: 'events', data: { title: 'x' } as never, req: mcpReq, overrideAccess: false }),
    ).rejects.toThrow(/only be saved as a draft/)
    expect(await visible()).toBe('Hola')
  })

  it('keeps a draft off the site, even one that claims to be published', async () => {
    await claudeDraft({ title: 'Hola mundo', _status: 'published' })
    expect(await visible()).toBe('Hola')
    expect(await hasPendingDraft(payload, 'stories', story.id)).toBe(true)

    // Anonymous REST/GraphQL readers get the live version, and asking for
    // drafts gets them nothing (the access constraint applies to versions too).
    const anon = await payload.find({ collection: 'stories', where: { id: { equals: story.id } }, locale: 'es', overrideAccess: false })
    expect(anon.docs[0]?.title).toBe('Hola')
    const anonDraft = await payload.find({ collection: 'stories', where: { id: { equals: story.id } }, locale: 'es', draft: true, overrideAccess: false })
    expect(anonDraft.docs.map((d) => d.title)).not.toContain('Hola mundo')
  })

  it('keeps a never-published page invisible everywhere', async () => {
    const created = await payload.create({
      collection: 'stories',
      data: { slug: `pb-new-${Date.now()}`, title: 'Borrador' },
      locale: 'es',
      draft: true,
      req: mcpReq,
      overrideAccess: false,
    })
    stories.push(created.id)
    expect((await getStories('es')).some((s) => s.id === created.id)).toBe(false)
    const anon = await payload.find({ collection: 'stories', where: { id: { equals: created.id } }, overrideAccess: false })
    expect(anon.docs).toHaveLength(0)
  })

  it('refuses what it may never publish, and requests with nothing to publish', async () => {
    fakeTelegram()
    await expect(requestPublish(payload, { collection: 'users', id: user.id })).rejects.toThrow(/can't be published/)
    const clean = await payload.create({ collection: 'stories', data: { slug: `pb-clean-${Date.now()}`, title: 'Same', _status: 'published' }, overrideAccess: true })
    stories.push(clean.id)
    await expect(requestPublish(payload, { collection: 'stories', id: clean.id })).rejects.toThrow(/Nothing to publish/)
  })

  it('shows the owner live → draft, ignores strangers, and publishes on the owner’s tap', async () => {
    const tg = fakeTelegram()
    await claudeDraft({ title: 'Hello world' }, 'en')
    const { requestId } = await requestPublish(payload, { collection: 'stories', id: story.id, reason: 'Fix the title' })
    const msg = tg.messages().at(-1)!
    expect(msg).toContain('• title (es): Hola → Hola mundo')
    expect(msg).toContain('• title (en): Hello → Hello world')
    expect(msg).not.toContain('_status')
    expect(await visible()).toBe('Hola')

    await tap(requestId, 'a', STRANGER)
    expect(await status(requestId)).toBe('pending')
    expect(await visible()).toBe('Hola')

    await tap(requestId)
    expect(await status(requestId)).toBe('published')
    expect(await visible('es')).toBe('Hola mundo')
    expect(await visible('en')).toBe('Hello world')
    expect(await hasPendingDraft(payload, 'stories', story.id)).toBe(false)
    expect(tg.messages().at(-1)).toContain('🌐 Published')

    // A second tap does nothing.
    expect(await decidePublish(payload, requestId, 'publish')).toMatch(/already published/)
  })

  it('never publishes a draft edited after its preview — it re-sends the current one', async () => {
    const tg = fakeTelegram()
    await claudeDraft({ title: 'Versión 1' })
    const first = await requestPublish(payload, { collection: 'stories', id: story.id })
    await claudeDraft({ title: 'Versión 2' })
    await tap(first.requestId)
    expect(await status(first.requestId)).toBe('stale')
    expect(await visible()).toBe('Hola mundo')
    expect(tg.messages().some((m) => m.includes('Hola mundo → Versión 2'))).toBe(true)
  })

  it('lets a newer request replace an older one, and Reject leaves the draft a draft', async () => {
    fakeTelegram()
    const a = await requestPublish(payload, { collection: 'stories', id: story.id })
    const b = await requestPublish(payload, { collection: 'stories', id: story.id })
    expect(await status(a.requestId)).toBe('superseded')
    expect(await decidePublish(payload, a.requestId, 'publish')).toMatch(/superseded/)
    await tap(b.requestId, 'r')
    expect(await status(b.requestId)).toBe('rejected')
    expect(await visible()).toBe('Hola mundo')
    expect(await hasPendingDraft(payload, 'stories', story.id)).toBe(true)
  })

  it('publishes a brand-new page in both languages', async () => {
    fakeTelegram()
    const slug = `pb-fresh-${Date.now()}`
    const created = await payload.create({ collection: 'stories', data: { slug, title: 'Nueva' }, locale: 'es', draft: true, req: mcpReq, overrideAccess: false })
    stories.push(created.id)
    await payload.update({ collection: 'stories', id: created.id, data: { title: 'New' }, locale: 'en', draft: true, req: mcpReq, overrideAccess: false })
    const { requestId, title } = await requestPublish(payload, { collection: 'stories', id: created.id })
    expect(title).toMatch(/^New stories/)
    await tap(requestId)
    expect((await getStory('es', slug))?.title).toBe('Nueva')
    expect((await getStory('en', slug))?.title).toBe('New')
  })

  it('files nothing the owner cannot see, and leaves older requests alone', async () => {
    fakeTelegram()
    const older = await requestPublish(payload, { collection: 'stories', id: story.id })
    fakeTelegram({ down: true })
    await expect(requestPublish(payload, { collection: 'stories', id: story.id })).rejects.toThrow(/nothing was filed/)
    expect(await status(older.requestId)).toBe('pending')

    delete process.env.TELEGRAM_BOT_TOKEN
    await expect(requestPublish(payload, { collection: 'stories', id: story.id })).rejects.toThrow(/not configured/)
  })

  it('refuses an MCP write to the request itself, and expires old requests', async () => {
    fakeTelegram()
    const { requestId } = await requestPublish(payload, { collection: 'stories', id: story.id })
    await payload.update({ collection: 'hq-publish-requests', id: requestId, data: { status: 'published' }, req: mcpReq, overrideAccess: false })
    expect(await status(requestId)).toBe('pending')
    expect(await decidePublish(payload, requestId, 'publish', new Date(Date.now() + 80 * 3_600_000))).toMatch(/expired/)
    expect(await visible()).toBe('Hola mundo')
  })
})
