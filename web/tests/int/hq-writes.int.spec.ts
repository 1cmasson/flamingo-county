// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { handleUpdate } from '@/lib/telegramBot'
import {
  MAX_ATTEMPTS,
  applyWrite,
  codeHash,
  diffLines,
  formatValue,
  issueCode,
  newCode,
  normalizeCode,
  parseWriteCallback,
  requestWrite,
} from '@/lib/writeRequests'
import type { Story, User } from '@/payload-types'

/* ------------------------------------------------------------------------ */
/* Pure helpers                                                              */
/* ------------------------------------------------------------------------ */

describe('permission codes', () => {
  it('are 8 unambiguous characters, typed any old way', () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/)
    expect(normalizeCode(' abcd efgh ')).toBe('ABCDEFGH')
    expect(normalizeCode('ABCD-EFGH')).toBe('ABCDEFGH')
  })

  it('are bound to one request and to the server secret', () => {
    const h = codeHash('secret', 7, 'ABCD-EFGH')
    expect(codeHash('secret', 7, 'abcdefgh')).toBe(h)
    expect(codeHash('secret', 8, 'ABCD-EFGH')).not.toBe(h)
    expect(codeHash('other', 7, 'ABCD-EFGH')).not.toBe(h)
    expect(h).not.toContain('ABCD')
  })

  it('parse only their own buttons', () => {
    expect(parseWriteCallback('wr:a:12')).toEqual({ action: 'approve', id: 12 })
    expect(parseWriteCallback('wr:r:3')).toEqual({ action: 'reject', id: 3 })
    expect(parseWriteCallback('sd:a:12')).toBeNull()
    expect(parseWriteCallback('wr:a:1x')).toBeNull()
  })
})

describe('what the owner reads', () => {
  it('flattens story blocks to text', () => {
    const blocks = [
      { blockType: 'paragraph', text: 'Primer párrafo', id: 'x' },
      { blockType: 'pullQuote', text: 'Una cita', attribution: 'Ana' },
    ]
    expect(formatValue(blocks)).toBe('[paragraph] Primer párrafo ¶ [pullQuote] Una cita / Ana')
    expect(formatValue(null)).toBe('∅')
  })

  it('shows only what changes, and warns on URLs and sourcing', () => {
    const { lines, warnings, changes } = diffLines(
      'listings',
      'update',
      { es: { tag: 'Café', slug: 'nuevo', publicationStatus: 'ready' } },
      { es: { tag: 'Café', slug: 'viejo', publicationStatus: 'unsourced' } },
    )
    expect(changes).toBe(2)
    expect(lines).toEqual(['• slug (es): viejo → nuevo', '• publicationStatus (es): unsourced → ready'])
    expect(warnings.join(' ')).toMatch(/links .* will break/)
    expect(warnings.join(' ')).toMatch(/every field traces to a real source/)
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database                                                      */
/* ------------------------------------------------------------------------ */

const OWNER = 1001
const STRANGER = 2002

function fakeTelegram(opts: { failSends?: boolean } = {}) {
  const sent: { method: string; body: Record<string, unknown> }[] = []
  let messageId = 100
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = url.split('/').pop()!
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      sent.push({ method, body })
      if (opts.failSends && method === 'sendMessage') return Response.json({ ok: false, description: 'down' })
      return Response.json({ ok: true, result: { message_id: ++messageId } })
    }),
  )
  return {
    sent,
    messages: () => sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.text)),
    lastCode: () => {
      const m = sent
        .filter((s) => s.method === 'sendMessage')
        .map((s) => /Code: <code>([A-Z0-9-]+)<\/code>/.exec(String(s.body.text))?.[1])
        .filter(Boolean)
      return m.at(-1) as string
    },
  }
}

describe('site changes need the owner’s code', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  let story: Story
  const cleanup: { collection: 'stories' | 'hq-write-requests'; id: number }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = await payload.create({
      collection: 'users',
      data: { email: `writes-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
    story = await payload.create({
      collection: 'stories',
      data: { slug: `wr-test-${Date.now()}`, title: 'Hello' },
      locale: 'en',
      overrideAccess: true,
    })
    await payload.update({ collection: 'stories', id: story.id, data: { title: 'Hola' }, locale: 'es', overrideAccess: true })
    cleanup.push({ collection: 'stories', id: story.id })
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
    const reqs = await payload.find({ collection: 'hq-write-requests', limit: 200, overrideAccess: true })
    for (const r of reqs.docs) cleanup.push({ collection: 'hq-write-requests', id: r.id })
    for (const { collection, id } of cleanup) {
      await payload.delete({ collection, id, overrideAccess: true }).catch(() => undefined)
    }
    await payload.delete({ collection: 'hq-events', where: { type: { like: 'site.' } }, overrideAccess: true })
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  const titles = async () => ({
    en: (await payload.findByID({ collection: 'stories', id: story.id, locale: 'en', overrideAccess: true })).title,
    es: (await payload.findByID({ collection: 'stories', id: story.id, locale: 'es', overrideAccess: true })).title,
  })

  const approve = (id: number, from = OWNER) =>
    handleUpdate(payload, {
      callback_query: { id: 'cb', from: { id: from }, data: `wr:a:${id}`, message: { chat: { id: from }, message_id: 1 } },
    })

  const request = (es: string, en: string) =>
    requestWrite(payload, {
      collection: 'stories',
      operation: 'update',
      id: story.id,
      locales: { es: { title: es }, en: { title: en } },
      reason: 'Test',
    })

  it('refuses what it may never touch, and changes that change nothing', async () => {
    fakeTelegram()
    await expect(requestWrite(payload, { collection: 'users', operation: 'update', id: 1, locales: { es: { email: 'x' } } })).rejects.toThrow(/can't be changed/)
    await expect(requestWrite(payload, { collection: 'subscribers', operation: 'create', locales: { es: { email: 'x' } } })).rejects.toThrow(/can't be changed/)
    await expect(requestWrite(payload, { collection: 'stories', operation: 'update', id: story.id, locales: { es: { nope: 1 } } })).rejects.toThrow(/Unknown or protected/)
    await expect(requestWrite(payload, { collection: 'stories', operation: 'update', id: story.id, locales: { es: { id: 99 } } })).rejects.toThrow(/Unknown or protected/)
    await expect(requestWrite(payload, { collection: 'stories', operation: 'update', id: story.id, locales: { es: { title: 'Hola' } } })).rejects.toThrow(/change nothing/)
    await expect(requestWrite(payload, { collection: 'stories', operation: 'update', locales: { es: { title: 'x' } } })).rejects.toThrow(/needs the document id/)
  })

  it('files nothing when the owner cannot be asked', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    await expect(request('A', 'B')).rejects.toThrow(/Telegram is not configured/)
  })

  it('closes a request the owner never received, leaving older ones alone', async () => {
    fakeTelegram()
    const older = await request('Antes', 'Before')
    fakeTelegram({ failSends: true })
    await expect(request('Después', 'After')).rejects.toThrow(/nothing was filed/)
    const r = await payload.findByID({ collection: 'hq-write-requests', id: older.requestId, overrideAccess: true })
    expect(r.status).toBe('pending')
  })

  it('shows the owner the exact change and writes nothing yet', async () => {
    const tg = fakeTelegram()
    const { requestId } = await request('Hola mundo', 'Hello world')
    const msg = tg.messages()[0]
    expect(msg).toContain('• title (es): Hola → Hola mundo')
    expect(msg).toContain('• title (en): Hello → Hello world')
    const buttons = tg.sent[0].body.reply_markup as { inline_keyboard: { callback_data: string }[][] }
    expect(buttons.inline_keyboard[0].map((b) => b.callback_data)).toEqual([`wr:a:${requestId}`, `wr:r:${requestId}`])
    expect(await titles()).toEqual({ en: 'Hello', es: 'Hola' })

    expect(await applyWrite(mcpReq, requestId, 'ABCD-EFGH')).toMatch(/hasn't been approved/)
    expect(await titles()).toEqual({ en: 'Hello', es: 'Hola' })
  })

  it('ignores an approval tap from anyone but the owner', async () => {
    fakeTelegram()
    const { requestId } = await request('Otra', 'Other')
    await approve(requestId, STRANGER)
    const r = await payload.findByID({ collection: 'hq-write-requests', id: requestId, overrideAccess: true })
    expect(r.status).toBe('pending')
  })

  it('sends the code to the owner only, keeps nothing readable, and applies exactly what was approved', async () => {
    const tg = fakeTelegram()
    const { requestId } = await request('Hola mundo', 'Hello world')
    await approve(requestId)
    const code = tg.lastCode()
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)

    // The code exists nowhere but the Telegram message.
    const r = await payload.findByID({ collection: 'hq-write-requests', id: requestId, overrideAccess: true })
    const events = await payload.find({ collection: 'hq-events', limit: 500, overrideAccess: true })
    for (const blob of [JSON.stringify(r), JSON.stringify(events.docs)]) {
      expect(blob).not.toContain(code)
      expect(blob).not.toContain(normalizeCode(code))
    }

    expect(await applyWrite(mcpReq, requestId, 'WRNG-CODE')).toBe(`Wrong code. ${MAX_ATTEMPTS - 1} tries left.`)
    expect(await titles()).toEqual({ en: 'Hello', es: 'Hola' })

    const applied = await applyWrite(mcpReq, requestId, normalizeCode(code).toLowerCase())
    expect(applied).toMatch(/^Applied site change/)
    expect(await titles()).toEqual({ en: 'Hello world', es: 'Hola mundo' })
    expect(tg.messages().at(-1)).toContain('🟢 Applied')

    // Single use.
    expect(await applyWrite(mcpReq, requestId, code)).toMatch(/is applied/)
  })

  it('refuses a change to a page edited since the request', async () => {
    const tg = fakeTelegram()
    const { requestId } = await request('Versión A', 'Version A')
    await approve(requestId)
    await payload.update({ collection: 'stories', id: story.id, data: { title: 'Edited by hand' }, locale: 'en', overrideAccess: true })
    expect(await applyWrite(mcpReq, requestId, tg.lastCode())).toMatch(/changed after/)
    expect((await titles()).en).toBe('Edited by hand')
    const r = await payload.findByID({ collection: 'hq-write-requests', id: requestId, overrideAccess: true })
    expect(r.status).toBe('stale')
  })

  it('lets a newer request for the same page replace the older one', async () => {
    const tg = fakeTelegram()
    const first = await request('Primera', 'First')
    await approve(first.requestId)
    const firstCode = tg.lastCode()
    await request('Segunda', 'Second')
    expect(await applyWrite(mcpReq, first.requestId, firstCode)).toMatch(/superseded/)
  })

  it('locks after five wrong codes and tells the owner', async () => {
    const tg = fakeTelegram()
    const { requestId } = await request('Bloqueo', 'Lock')
    await approve(requestId)
    const code = tg.lastCode()
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await applyWrite(mcpReq, requestId, 'ZZZZ-ZZZZ')
    expect(await applyWrite(mcpReq, requestId, 'ZZZZ-ZZZZ')).toMatch(/now locked/)
    await vi.waitFor(() => expect(tg.messages().some((m) => m.includes('🔒'))).toBe(true))
    expect(await applyWrite(mcpReq, requestId, code)).toMatch(/is locked/)
  })

  it('/code issues a fresh code and the old one stops working', async () => {
    const tg = fakeTelegram()
    const { requestId } = await request('Código', 'Code')
    await approve(requestId)
    const oldCode = tg.lastCode()
    await handleUpdate(payload, { message: { chat: { id: OWNER }, from: { id: OWNER }, text: `/code ${requestId}` } })
    const newer = tg.lastCode()
    expect(newer).not.toBe(oldCode)
    expect(await applyWrite(mcpReq, requestId, oldCode)).toMatch(/Wrong code/)
    expect(await applyWrite(mcpReq, requestId, newer)).toMatch(/^Applied/)
  })

  it('undoes the approval when the code could not be delivered', async () => {
    fakeTelegram()
    const { requestId } = await request('Sin entrega', 'Undelivered')
    fakeTelegram({ failSends: true })
    await expect(approve(requestId)).rejects.toThrow()
    const r = await payload.findByID({ collection: 'hq-write-requests', id: requestId, overrideAccess: true })
    expect(r.status).toBe('pending')
    expect(r.codeHash).toBeFalsy()
  })

  it('expires requests and codes', async () => {
    const tg = fakeTelegram()
    const { requestId } = await request('Caduca', 'Expires')
    const later = new Date(Date.now() + 80 * 3_600_000)
    expect((await issueCode(payload, requestId, later)).text).toMatch(/expired/)

    const second = await request('Caduca 2', 'Expires 2')
    await approve(second.requestId)
    expect(await applyWrite(mcpReq, second.requestId, tg.lastCode(), new Date(Date.now() + 5 * 3_600_000))).toMatch(/code .* has expired/)
  })

  it('creates a new document the same way, in both languages', async () => {
    const tg = fakeTelegram()
    const slug = `wr-create-${Date.now()}`
    const { requestId } = await requestWrite(payload, {
      collection: 'stories',
      operation: 'create',
      locales: { es: { slug, title: 'Nueva historia' }, en: { title: 'New story' } },
    })
    await approve(requestId)
    expect(await applyWrite(mcpReq, requestId, tg.lastCode())).toMatch(/^Applied/)
    const created = await payload.find({ collection: 'stories', where: { slug: { equals: slug } }, locale: 'es', overrideAccess: true })
    expect(created.docs[0]?.title).toBe('Nueva historia')
    const en = await payload.findByID({ collection: 'stories', id: created.docs[0].id, locale: 'en', overrideAccess: true })
    expect(en.title).toBe('New story')
    cleanup.push({ collection: 'stories', id: created.docs[0].id })
  })

  it('refuses status writes that arrive over MCP even on the request itself', async () => {
    fakeTelegram()
    const { requestId } = await request('Guardia', 'Guard')
    await payload.update({
      collection: 'hq-write-requests',
      id: requestId,
      data: { status: 'approved', codeHash: codeHash(payload.secret, requestId, 'AAAA-AAAA') },
      req: mcpReq,
      overrideAccess: false,
    })
    const r = await payload.findByID({ collection: 'hq-write-requests', id: requestId, overrideAccess: true })
    expect(r.status).toBe('pending')
    expect(await applyWrite(mcpReq, requestId, 'AAAA-AAAA')).toMatch(/hasn't been approved/)
  })
})
