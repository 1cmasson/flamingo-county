import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import { hqMcpTools, resetTelegramSendLimit, sendToOwnerTelegram } from '@/lib/mcpTools'

/**
 * `hqSendTelegram`: Claude hands results to the owner on Telegram. No database is involved, so
 * these run against a faked Telegram and nothing else.
 */
const OWNER = '1001'

function fakeTelegram(reply: () => Response = () => Response.json({ ok: true, result: { message_id: 7 } })) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
      return reply()
    }),
  )
  return calls
}

const tool = () => hqMcpTools.find((t) => t.name === 'hqSendTelegram')!
const run = async (args: Record<string, unknown>) =>
  ((await tool().handler(args, {} as PayloadRequest, undefined)) as { content: { text: string }[] }).content[0].text

describe('hqSendTelegram', () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = OWNER
    resetTelegramSendLimit()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
  })

  it('sends to the owner only, headed as Claude, with the text escaped', async () => {
    const calls = fakeTelegram()
    const out = await run({ text: 'Result: a < b & <script>alert(1)</script>', title: 'Six <Inches>' })
    expect(out).toBe("Sent to the owner's Telegram (message 7).")
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/bottest-token/sendMessage')
    expect(calls[0].body).toMatchObject({ chat_id: OWNER, parse_mode: 'HTML' })
    expect(calls[0].body.reply_markup).toBeUndefined() // no buttons: nothing here can approve anything
    const text = String(calls[0].body.text)
    expect(text.startsWith('🤖 <b>Claude</b> · Six &lt;Inches&gt;')).toBe(true)
    expect(text).toContain('a &lt; b &amp; &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(text).not.toContain('<script>')
  })

  it('has no way to name a chat', () => {
    expect(Object.keys(tool().parameters as Record<string, unknown>).sort()).toEqual(['text', 'title'])
  })

  it('says so, and sends nothing, when Telegram is not set up', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const calls = fakeTelegram()
    expect(await run({ text: 'hi' })).toMatch(/isn't set up/)
    expect(calls).toHaveLength(0)
  })

  it('refuses a message that will not fit once formatted, instead of cutting it off', async () => {
    const calls = fakeTelegram()
    // 3,000 ampersands escape to 15,000 characters
    expect(await run({ text: '&'.repeat(3000) })).toMatch(/Too long for one Telegram message once formatted/)
    expect(calls).toHaveLength(0)
  })

  it('stops a runaway: ten in ten minutes, then a pause', async () => {
    const calls = fakeTelegram()
    const t0 = 1_000_000_000_000
    for (let i = 0; i < 10; i++) await sendToOwnerTelegram({ text: `m${i}` }, t0 + i * 1000)
    await expect(sendToOwnerTelegram({ text: 'eleventh' }, t0 + 20_000)).rejects.toThrow(/Too many messages/)
    expect(calls).toHaveLength(10)
    await sendToOwnerTelegram({ text: 'later' }, t0 + 11 * 60_000) // the window has passed
    expect(calls).toHaveLength(11)
  })

  it('reports a Telegram failure, and does not count it against the limit', async () => {
    fakeTelegram(() => Response.json({ ok: false, description: 'chat not found' }))
    for (let i = 0; i < 12; i++) expect(await run({ text: 'x' })).toMatch(/chat not found/)
    // twelve failures did not use up the ten allowed sends
    fakeTelegram()
    expect(await run({ text: 'works now' })).toMatch(/Sent to the owner/)
  })
})
