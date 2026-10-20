// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import { decideSpend, hashCommand, parseSpendCallback, redeemSpend, requestSpend, spendStatus } from '@/lib/spendApprovals'
import { handleUpdate } from '@/lib/telegramBot'
import type { User } from '@/payload-types'

describe('spend approval helpers', () => {
  it('parses only its own buttons', () => {
    expect(parseSpendCallback('sp:a:7')).toEqual({ action: 'approve', id: 7 })
    expect(parseSpendCallback('sp:d:7')).toEqual({ action: 'decline', id: 7 })
    expect(parseSpendCallback('pb:a:7')).toBeNull()
    expect(parseSpendCallback('sp:x:7')).toBeNull()
  })

  it('hashes the trimmed command the way the hook does (Python sha256 of cmd.strip())', () => {
    // python3 -c "import hashlib;print(hashlib.sha256('ls'.encode()).hexdigest())"
    expect(hashCommand('  ls \n')).toBe('c7b68ac37f364473e922936708e7f43c293dd07b295171566c07ff5fe024fab9')
  })
})

const OWNER = 1001
const STRANGER = 2002

function fakeTelegram(opts: { down?: boolean } = {}) {
  const sent: { method: string; body: Record<string, unknown> }[] = []
  let messageId = 700
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

describe('paid steps run only after the owner taps Yes', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  const CMD = 'python3 scripts/gen_image.py --approve emilio-estefan 4'

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    user = await payload.create({
      collection: 'users',
      data: { email: `spend-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
  })

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = String(OWNER)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    await payload.delete({ collection: 'hq-spend-approvals', where: { id: { exists: true } }, overrideAccess: true })
  })

  afterAll(async () => {
    if (!payload) return
    await payload.delete({ collection: 'hq-events', where: { type: { like: 'spend.' } }, overrideAccess: true })
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  const tap = (id: number, action: 'a' | 'd' = 'a', from = OWNER) =>
    handleUpdate(payload, {
      callback_query: { id: 'cb', from: { id: from }, data: `sp:${action}:${id}`, message: { chat: { id: from }, message_id: 1 } },
    })
  const status = async (id: number) => (await payload.findByID({ collection: 'hq-spend-approvals', id, overrideAccess: true })).status

  it('shows the owner the exact command, the reason and the cost, with Yes / No', async () => {
    const tg = fakeTelegram()
    const { requestId } = await requestSpend(payload, { command: CMD, reason: '4 more drawings for Estefan', cost: 'about $0.14' })
    const msg = tg.messages()[0]
    expect(msg).toContain('4 more drawings for Estefan')
    expect(msg).toContain('about $0.14')
    expect(msg).toContain(`<code>${CMD}</code>`)
    const kb = tg.sent.find((s) => s.method === 'sendMessage')!.body.reply_markup as { inline_keyboard: { callback_data: string }[][] }
    expect(kb.inline_keyboard[0].map((b) => b.callback_data)).toEqual([`sp:a:${requestId}`, `sp:d:${requestId}`])
    expect(await status(requestId)).toBe('pending')
  })

  it('nothing redeems before the tap, and a stranger’s tap does nothing', async () => {
    fakeTelegram()
    const { requestId } = await requestSpend(payload, { command: CMD, reason: 'r' })
    expect(await redeemSpend(payload, CMD)).toEqual({ ok: false })
    await tap(requestId, 'a', STRANGER)
    expect(await status(requestId)).toBe('pending')
    expect(await redeemSpend(payload, CMD)).toEqual({ ok: false })
  })

  it('Yes lets that exact command run once; another command never', async () => {
    fakeTelegram()
    const { requestId } = await requestSpend(payload, { command: CMD, reason: 'r' })
    await tap(requestId)
    expect(await status(requestId)).toBe('approved')
    expect(await redeemSpend(payload, CMD.replace(' 4', ' 40'))).toEqual({ ok: false })
    expect(await redeemSpend(payload, `  ${CMD}\n`)).toEqual({ ok: true, requestId })
    expect(await redeemSpend(payload, CMD)).toEqual({ ok: false })
    expect(await status(requestId)).toBe('used')
  })

  it('No declines it, and a second tap changes nothing', async () => {
    fakeTelegram()
    const { requestId } = await requestSpend(payload, { command: CMD, reason: 'r' })
    await tap(requestId, 'd')
    expect(await status(requestId)).toBe('declined')
    expect(await decideSpend(payload, requestId, 'approve')).toMatch(/already declined/)
    expect(await redeemSpend(payload, CMD)).toEqual({ ok: false })
  })

  it('an approval expires', async () => {
    fakeTelegram()
    const { requestId } = await requestSpend(payload, { command: CMD, reason: 'r' })
    await tap(requestId)
    const later = new Date(Date.now() + 7 * 3_600_000)
    expect(await spendStatus(payload, requestId, later)).toMatchObject({ status: 'expired' })
    expect(await redeemSpend(payload, CMD, later)).toEqual({ ok: false })
    expect(await status(requestId)).toBe('expired')
  })

  it('a tap on an expired request does not approve it', async () => {
    fakeTelegram()
    const { requestId } = await requestSpend(payload, { command: CMD, reason: 'r' })
    expect(await decideSpend(payload, requestId, 'approve', new Date(Date.now() + 7 * 3_600_000))).toMatch(/expired/)
    expect(await status(requestId)).toBe('expired')
  })

  it('files nothing when the owner can’t be reached', async () => {
    fakeTelegram({ down: true })
    await expect(requestSpend(payload, { command: CMD, reason: 'r' })).rejects.toThrow(/Could not reach the owner/)
    expect(await redeemSpend(payload, CMD)).toEqual({ ok: false })
  })

  it('MCP can’t approve its own request', async () => {
    fakeTelegram()
    const { requestId } = await requestSpend(payload, { command: CMD, reason: 'r' })
    await payload
      .update({ collection: 'hq-spend-approvals', id: requestId, data: { status: 'approved' }, req: mcpReq, overrideAccess: false })
      .catch(() => undefined)
    expect(await status(requestId)).toBe('pending')
    await expect(
      payload.create({
        collection: 'hq-spend-approvals',
        data: { status: 'approved', reason: 'x', command: CMD, commandHash: hashCommand(CMD) },
        req: mcpReq,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    expect(await redeemSpend(payload, CMD)).toEqual({ ok: false })
  })
})
