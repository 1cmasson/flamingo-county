// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { cancelEmail, decideEmail, emailStatus, parseEmailCallback, renderEmail, requestEmail } from '@/lib/emailApprovals'
import { handleUpdate } from '@/lib/telegramBot'
import type { User } from '@/payload-types'

describe('email approval helpers', () => {
  it('parses only its own buttons', () => {
    expect(parseEmailCallback('em:a:7')).toEqual({ action: 'send', id: 7 })
    expect(parseEmailCallback('em:d:7')).toEqual({ action: 'decline', id: 7 })
    expect(parseEmailCallback('em:c:7')).toEqual({ action: 'cancel', id: 7 })
    expect(parseEmailCallback('sp:a:7')).toBeNull()
    expect(parseEmailCallback('em:x:7')).toBeNull()
  })

  it('renders paragraphs, links, the footer and the quote', () => {
    const { html, text } = renderEmail({
      body: 'Hey Mr. Fernandez,\n\nIs https://www.instagram.com/x/ yours?\nThanks <3',
      quote: 'On Oct 24, Mike wrote:\nWhat is a handle?',
    })
    expect(html).toContain('<p style="margin:0 0 14px">Hey Mr. Fernandez,</p>')
    expect(html).toContain('<a href="https://www.instagram.com/x/">https://www.instagram.com/x/</a>')
    expect(html).toContain('yours?<br>Thanks &lt;3')
    expect(html).toContain('FLAMINGO COUNTY')
    expect(html).toContain('<blockquote')
    expect(text).toContain('> What is a handle?')
  })
})

const OWNER = 1001
const STRANGER = 2002

function fakeServices(opts: { telegramDown?: boolean; resendDown?: boolean } = {}) {
  const sent: { url: string; method: string; body: Record<string, unknown> }[] = []
  let messageId = 700
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = url.split('/').pop()!
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      sent.push({ url, method, body })
      if (url.includes('api.resend.com')) {
        return opts.resendDown ? new Response('nope', { status: 500 }) : Response.json({ id: 're_123' })
      }
      if (opts.telegramDown && method === 'sendMessage') return Response.json({ ok: false, description: 'down' })
      return Response.json({ ok: true, result: { message_id: ++messageId } })
    }),
  )
  return {
    messages: () => sent.filter((s) => s.method === 'sendMessage').map((s) => String(s.body.text)),
    emails: () => sent.filter((s) => s.url.includes('api.resend.com')).map((s) => s.body),
    sent,
  }
}

describe('emails go out only after the owner taps Send', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  const EMAIL = {
    to: ['mfernandez@example.com'],
    subject: 'Re: Mike Fernandez: his story',
    body: 'Hey Mr. Fernandez,\n\nA handle is your Instagram username. Is @mikefernandez52 yours?\n\nThank you,\nCarlos',
    quote: 'On Oct 24, 2026, Mike Fernandez wrote:\nCarlos, what is a Handle?',
    inReplyTo: '<abc@mbfhp.com>',
    why: 'Answering his handle question',
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = await payload.create({
      collection: 'users',
      data: { email: `email-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
  })

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = String(OWNER)
    process.env.RESEND_API_KEY = 'test-resend'
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    delete process.env.RESEND_API_KEY
    await payload.delete({ collection: 'hq-email-approvals', where: { id: { exists: true } }, overrideAccess: true })
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'hq-events', where: { type: { like: 'email.' } }, overrideAccess: true })
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  const tap = (id: number, action: 'a' | 'd' | 'c' = 'a', from = OWNER) =>
    handleUpdate(payload, {
      callback_query: { id: 'cb', from: { id: from }, data: `em:${action}:${id}`, message: { chat: { id: from }, message_id: 1 } },
    })
  const status = async (id: number) => (await payload.findByID({ collection: 'hq-email-approvals', id, overrideAccess: true })).status

  it('shows the owner the whole email with Send / Don’t send, and sends nothing yet', async () => {
    const svc = fakeServices()
    const { requestId } = await requestEmail(payload, EMAIL)
    const msg = svc.messages()[0]
    expect(msg).toContain('To: <b>mfernandez@example.com</b>')
    expect(msg).toContain('Subject: <b>Re: Mike Fernandez: his story</b>')
    expect(msg).toContain('A handle is your Instagram username. Is @mikefernandez52 yours?')
    expect(msg).toContain('Carlos, what is a Handle?')
    expect(msg).toContain('Answering his handle question')
    const kb = svc.sent.find((s) => s.method === 'sendMessage')!.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }
    expect(kb.inline_keyboard[0].map((b) => b.callback_data)).toEqual([`em:a:${requestId}`, `em:d:${requestId}`])
    expect(svc.emails()).toHaveLength(0)
    expect(await status(requestId)).toBe('pending')
  })

  it('a stranger’s tap does nothing', async () => {
    const svc = fakeServices()
    const { requestId } = await requestEmail(payload, EMAIL)
    await tap(requestId, 'a', STRANGER)
    expect(await status(requestId)).toBe('pending')
    expect(svc.emails()).toHaveLength(0)
  })

  it('Send sends exactly the stored email once, threaded, with a copy to hola@', async () => {
    const svc = fakeServices()
    const { requestId } = await requestEmail(payload, EMAIL)
    await tap(requestId)
    expect(await status(requestId)).toBe('sent')
    const [email] = svc.emails()
    expect(email.to).toEqual(['mfernandez@example.com'])
    expect(email.bcc).toEqual(['hola@flamingocounty.com'])
    expect(email.from).toContain('hola@flamingocounty.com')
    expect(email.subject).toBe(EMAIL.subject)
    expect(email.headers).toEqual({ 'In-Reply-To': '<abc@mbfhp.com>', References: '<abc@mbfhp.com>' })
    expect(String(email.text)).toContain('Is @mikefernandez52 yours?')
    expect(svc.messages().at(-1) ?? '').not.toContain('Not sent')

    await tap(requestId)
    expect(svc.emails()).toHaveLength(1)
    expect(await decideEmail(payload, requestId, 'send')).toMatch(/already sent/)
    expect(await emailStatus(payload, requestId)).toMatchObject({ status: 'sent', to: 'mfernandez@example.com' })
  })

  it("Don't send declines it, and nothing goes out after", async () => {
    const svc = fakeServices()
    const { requestId } = await requestEmail(payload, EMAIL)
    await tap(requestId, 'd')
    expect(await status(requestId)).toBe('declined')
    expect(await decideEmail(payload, requestId, 'send')).toMatch(/already declined/)
    expect(svc.emails()).toHaveLength(0)
  })

  it('an unanswered request expires and can no longer be sent', async () => {
    const svc = fakeServices()
    const { requestId } = await requestEmail(payload, EMAIL)
    const later = new Date(Date.now() + 25 * 3_600_000)
    expect(await emailStatus(payload, requestId, later)).toMatchObject({ status: 'expired' })
    expect(await decideEmail(payload, requestId, 'send', later)).toMatch(/expired/)
    expect(svc.emails()).toHaveLength(0)
  })

  it('a Resend failure is recorded, told to the owner, and never retried', async () => {
    const svc = fakeServices({ resendDown: true })
    const { requestId } = await requestEmail(payload, EMAIL)
    expect(await decideEmail(payload, requestId, 'send')).toMatch(/Not sent: Resend 500/)
    expect(await status(requestId)).toBe('failed')
    expect(await decideEmail(payload, requestId, 'send')).toMatch(/already failed/)
    expect(svc.emails()).toHaveLength(1)
  })

  it('refuses what the owner could not read in full, and bad addresses', async () => {
    fakeServices()
    await expect(requestEmail(payload, { ...EMAIL, body: 'x'.repeat(3500), quote: 'y'.repeat(1000) })).rejects.toThrow(/Too long/)
    await expect(requestEmail(payload, { ...EMAIL, to: ['Mike <m@example.com>'] })).rejects.toThrow(/not a plain email/)
    await expect(requestEmail(payload, { ...EMAIL, attachmentIds: [999999] })).rejects.toThrow(/No HQ media/)
    expect((await payload.find({ collection: 'hq-email-approvals', overrideAccess: true })).totalDocs).toBe(0)
  })

  it('files nothing when the owner can’t be reached', async () => {
    const svc = fakeServices({ telegramDown: true })
    await expect(requestEmail(payload, EMAIL)).rejects.toThrow(/Could not reach the owner/)
    expect(svc.emails()).toHaveLength(0)
  })

  describe('with a send time, the tap schedules instead of sending', () => {
    const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
    const keyboardOf = (s: { body: Record<string, unknown> }) =>
      (s.body.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] } | undefined)?.inline_keyboard

    it('shows the send time and a Schedule button, and the tap hands it to Resend to hold', async () => {
      const svc = fakeServices()
      const sendAt = inHours(18)
      const { requestId, expiresAt } = await requestEmail(payload, { ...EMAIL, sendAt })
      const msg = svc.messages()[0]
      expect(msg).toContain('Schedule this email?')
      expect(msg).toContain('🕘 Goes out: <b>')
      expect(keyboardOf(svc.sent.find((s) => s.method === 'sendMessage')!)![0][0].text).toMatch(/^🕘 Schedule for /)
      expect(new Date(expiresAt!).getTime()).toBeLessThan(new Date(sendAt).getTime())

      await tap(requestId)
      expect(await status(requestId)).toBe('scheduled')
      const [email] = svc.emails()
      expect(email.scheduled_at).toBe(sendAt)
      expect(email.to).toEqual(['mfernandez@example.com'])
      expect(svc.messages().at(-1)).toMatch(/Scheduled for/)
      const cancel = keyboardOf(svc.sent.filter((s) => s.method === 'sendMessage').at(-1)!)
      expect(cancel?.[0][0].callback_data).toBe(`em:c:${requestId}`)

      expect(await emailStatus(payload, requestId)).toMatchObject({ status: 'scheduled', sendAt })
      expect(await emailStatus(payload, requestId, new Date(Date.now() + 19 * 3_600_000))).toMatchObject({ status: 'sent', sentAt: sendAt })
      expect(await decideEmail(payload, requestId, 'send')).toMatch(/already scheduled/)
      expect(svc.emails()).toHaveLength(1)
    })

    it('Cancel stops it before the send time, once', async () => {
      const svc = fakeServices()
      const { requestId } = await requestEmail(payload, { ...EMAIL, sendAt: inHours(3) })
      await tap(requestId)
      await tap(requestId, 'c')
      expect(await status(requestId)).toBe('cancelled')
      expect(svc.sent.filter((s) => s.url.endsWith('/emails/re_123/cancel'))).toHaveLength(1)
      expect(svc.messages().at(-1)).toMatch(/Cancelled/)
      await tap(requestId, 'c')
      expect(svc.messages().at(-1)).toMatch(/nothing to cancel/)
      expect(svc.sent.filter((s) => s.url.endsWith('/cancel'))).toHaveLength(1)
    })

    it('a Cancel after the send time says it already went out', async () => {
      fakeServices()
      const { requestId } = await requestEmail(payload, { ...EMAIL, sendAt: inHours(2) })
      await tap(requestId)
      expect(await cancelEmail(payload, requestId, new Date(Date.now() + 3 * 3_600_000))).toMatch(/already went out/)
      expect(await status(requestId)).toBe('scheduled')
    })

    it('refuses a send time without a time zone, too soon or too far out', async () => {
      fakeServices()
      await expect(requestEmail(payload, { ...EMAIL, sendAt: '2026-10-30T09:30:00' })).rejects.toThrow(/time zone/)
      await expect(requestEmail(payload, { ...EMAIL, sendAt: inHours(0.01) })).rejects.toThrow(/less than 5 minutes/)
      await expect(requestEmail(payload, { ...EMAIL, sendAt: inHours(24 * 31) })).rejects.toThrow(/more than 30 days/)
      expect((await payload.find({ collection: 'hq-email-approvals', overrideAccess: true })).totalDocs).toBe(0)
    })
  })

  it('MCP can’t approve, edit or create a request', async () => {
    const svc = fakeServices()
    const { requestId } = await requestEmail(payload, EMAIL)
    await payload
      .update({ collection: 'hq-email-approvals', id: requestId, data: { status: 'sent', to: 'x@example.com' }, req: mcpReq, overrideAccess: false })
      .catch(() => undefined)
    const r = await payload.findByID({ collection: 'hq-email-approvals', id: requestId, overrideAccess: true })
    expect(r.status).toBe('pending')
    expect(r.to).toBe('mfernandez@example.com')
    await expect(
      payload.create({
        collection: 'hq-email-approvals',
        data: { status: 'pending', to: 'x@example.com', subject: 's', body: 'b' },
        req: mcpReq,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect(svc.emails()).toHaveLength(0)
  })
})
