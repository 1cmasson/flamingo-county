// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { buildBrief, sendBrief } from '@/lib/brief'
import { agendaFromIcs, agendaSection, readAgenda, type CalendarItem } from '@/lib/calendar'
import { buildWrap, isWrapHour, sendWrap } from '@/lib/wrap'

/**
 * W2: the owner's calendar in the brief, and the evening wrap. The calendar is
 * always the fixture below, served by a stubbed fetch; nothing here reads a
 * real calendar or sends a real message.
 */
const ICS = readFileSync(path.resolve(__dirname, '../fixtures/calendar.ics'), 'utf8')
const SECRET_URL = 'https://calendar.test/calendar/ical/secret-token-xyz/basic.ics'
const OWNER = '1001'

/** Thursday 1 October 2026, 7:30 AM in Miami (EDT). */
const BRIEF_NOW = new Date('2026-10-01T11:30:00Z')
/** The same Thursday, 8:30 PM in Miami. */
const WRAP_NOW = new Date('2026-10-02T00:30:00Z')

const summary = (items: CalendarItem[]) =>
  items.map((i) => `${i.allDay ? 'all-day' : i.start.toISOString()} ${i.title}${i.continues ? ' (cont)' : ''}`)

type Call = { url: string; init?: RequestInit }

/** A fake network: the calendar answers with `calendar()`, Telegram with ok. */
function fakeNetwork(calendar: () => Response | Promise<Response> = () => new Response(ICS)) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.startsWith('https://calendar.test/')) return calendar()
      if (url.includes('api.telegram.org')) return Response.json({ ok: true, result: { message_id: 1 } })
      return new Response('not found', { status: 404 })
    }),
  )
  return {
    calls,
    calendar: () => calls.filter((c) => c.url.startsWith('https://calendar.test/')),
    /** Every URL fetched, minus Payload's own start-up telemetry, which fires on its own schedule. */
    ours: () => calls.map((c) => c.url).filter((u) => !u.includes('telemetry.payloadcms.com')),
    telegram: () => calls.filter((c) => c.url.includes('api.telegram.org')),
  }
}

describe('reading the ICS', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-08', '2026-10-15', '2026-11-05']
  const agenda = agendaFromIcs(ICS, days)

  it('lists a day with an all-day event, a recurring one, and late-evening ones, in order', () => {
    expect(summary(agenda['2026-10-01'])).toEqual([
      'all-day Flamingo Fest setup',
      // 9 AM EDT, from a weekly rule that started in January (EST).
      '2026-10-01T13:00:00.000Z Standup <team>',
      // 11:30 PM Miami is 03:30 UTC the next day; both stay on the 1st.
      '2026-10-02T03:30:00.000Z Late show',
      '2026-10-02T03:30:00.000Z Late call (UTC)',
    ])
  })

  it('keeps an 11:30 PM event off the next day', () => {
    expect(summary(agenda['2026-10-02'])).toEqual(['all-day Flamingo Fest'])
  })

  it('spreads a multi-day all-day event over each of its days, up to its end date', () => {
    expect(summary(agenda['2026-10-03'])).toEqual(['all-day Flamingo Fest'])
    expect(agendaFromIcs(ICS, ['2026-10-04'])['2026-10-04']).toEqual([])
  })

  it('honours EXDATE, moved occurrences and cancelled ones', () => {
    expect(agenda['2026-10-05']).toEqual([])
    expect(summary(agenda['2026-10-08'])).toEqual(['2026-10-08T15:00:00.000Z Standup moved'])
    expect(agenda['2026-10-15']).toEqual([])
  })

  it('keeps a recurring time on the Miami clock after daylight saving ends', () => {
    // 9 AM EST is 14:00 UTC.
    expect(summary(agenda['2026-11-05'])).toEqual(['2026-11-05T14:00:00.000Z Standup <team>'])
  })

  it('reads the same TZID right without the VTIMEZONE block', () => {
    const bare = ICS.replace(/BEGIN:VTIMEZONE[\s\S]*?END:VTIMEZONE\r?\n/, '')
    expect(bare).not.toContain('VTIMEZONE')
    expect(summary(agendaFromIcs(bare, ['2026-10-01'])['2026-10-01'])).toEqual(summary(agenda['2026-10-01']))
  })

  it('shows a timed event lasting days on its later days as continuing', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:conf@fixture',
      'DTSTART;TZID=America/New_York:20261001T090000',
      'DTEND;TZID=America/New_York:20261003T170000',
      'SUMMARY:Conference',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const a = agendaFromIcs(ics, ['2026-10-02'])
    expect(summary(a['2026-10-02'])).toEqual(['2026-10-01T13:00:00.000Z Conference (cont)'])
  })

  it('renders escaped Telegram lines', () => {
    const lines = agendaSection('Today', { status: 'ok', days: agenda }, '2026-10-01')
    expect(lines).toEqual([
      '<b>Today</b>',
      '• All day — Flamingo Fest setup',
      '• 9:00 AM — Standup &lt;team&gt;',
      '• 11:30 PM — Late show',
      '• 11:30 PM — Late call (UTC)',
    ])
    expect(agendaSection('Today', { status: 'ok', days: { '2026-10-04': [] } }, '2026-10-04')).toEqual([
      '<b>Today</b>',
      'Nothing on the calendar.',
    ])
    expect(agendaSection('Today', { status: 'off' }, '2026-10-01')).toEqual([])
  })
})

describe('fetching the calendar', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.GOOGLE_CALENDAR_ICS_URL
  })

  it('makes no network call with the variable unset', async () => {
    delete process.env.GOOGLE_CALENDAR_ICS_URL
    const net = fakeNetwork()
    expect(await readAgenda(['2026-10-01'])).toEqual({ status: 'off' })
    expect(net.ours()).toEqual([])
  })

  it('fetches with a timeout and turns webcal:// into https://', async () => {
    process.env.GOOGLE_CALENDAR_ICS_URL = SECRET_URL.replace('https://', 'webcal://')
    const net = fakeNetwork()
    const agenda = await readAgenda(['2026-10-01'])
    expect(agenda.status).toBe('ok')
    expect(net.calendar()).toHaveLength(1)
    expect(net.calendar()[0].url).toBe(SECRET_URL)
    expect(net.calendar()[0].init?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    ['an HTTP error', () => new Response('gone', { status: 404 }), 'HTTP 404'],
    ['a dropped connection', () => Promise.reject(new TypeError('fetch failed')), 'unreachable'],
    ['a timeout', () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')), 'timed out'],
    ['a file that is not a calendar', () => new Response('<html>sign in</html>'), 'unreadable'],
  ])('reports %s with a short reason, never the URL', async (_name, reply, reason) => {
    process.env.GOOGLE_CALENDAR_ICS_URL = SECRET_URL
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fakeNetwork(reply)
    expect(await readAgenda(['2026-10-01'])).toEqual({ status: 'error', reason })
    const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls])
    expect(logged).not.toContain('secret-token-xyz')
    expect(logged).not.toContain('calendar.test')
  })
})

describe('evening wrap clock', () => {
  // Runs hourly at :00; only the 8 PM run on a Miami clock sends, across daylight saving.
  it('sends at 00:00 UTC in daylight time', () => {
    expect(isWrapHour(new Date('2026-07-02T00:00:00Z'))).toBe(true)
    expect(isWrapHour(new Date('2026-07-01T23:00:00Z'))).toBe(false)
    expect(isWrapHour(new Date('2026-07-02T01:00:00Z'))).toBe(false)
  })
  it('sends at 01:00 UTC in standard time', () => {
    expect(isWrapHour(new Date('2026-12-02T00:00:00Z'))).toBe(false)
    expect(isWrapHour(new Date('2026-12-02T01:00:00Z'))).toBe(true)
  })
  it('sends once on each day daylight saving changes', () => {
    // 1 November 2026: clocks go back at 2 AM. 8 PM EST that evening is 01:00 UTC on the 2nd.
    const nov = Array.from({ length: 24 }, (_, h) => new Date(Date.UTC(2026, 10, 1, 12 + h)))
    expect(nov.filter((d) => isWrapHour(d)).map((d) => d.toISOString())).toEqual(['2026-11-02T01:00:00.000Z'])
    // 8 March 2026: clocks go forward. 8 PM EDT is 00:00 UTC on the 9th.
    const mar = Array.from({ length: 24 }, (_, h) => new Date(Date.UTC(2026, 2, 8, 12 + h)))
    expect(mar.filter((d) => isWrapHour(d)).map((d) => d.toISOString())).toEqual(['2026-03-09T00:00:00.000Z'])
  })
})

describe('calendar in the brief and the wrap, against the database', () => {
  let payload: Payload
  const tasks: number[] = []

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
  })

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'test-token'
    process.env.TELEGRAM_OWNER_CHAT_ID = OWNER
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    delete process.env.GOOGLE_CALENDAR_ICS_URL
  })

  afterAll(async () => {
    if (!payload) return
    for (const id of tasks) await payload.delete({ collection: 'hq-tasks', id, overrideAccess: true }).catch(() => undefined)
    await payload.delete({
      collection: 'hq-events',
      where: { or: [{ summary: { like: 'Wrap sent' } }, { summary: { like: 'Brief sent' } }] },
      overrideAccess: true,
    })
  })

  it('leaves the Today section out, with no network call, when the variable is unset', async () => {
    const net = fakeNetwork()
    const brief = await buildBrief(payload, BRIEF_NOW)
    expect(brief).not.toContain('<b>Today</b>')
    expect(brief).not.toContain('Calendar')
    expect(brief).toContain('Waiting on you')
    expect(net.ours()).toEqual([])
  })

  it('lists today’s calendar right under the heading', async () => {
    process.env.GOOGLE_CALENDAR_ICS_URL = SECRET_URL
    fakeNetwork()
    const brief = await buildBrief(payload, BRIEF_NOW)
    const lines = brief.split('\n')
    expect(lines[0]).toContain('Thursday, October 1')
    expect(lines.slice(1, 8)).toEqual([
      '',
      '<b>Today</b>',
      '• All day — Flamingo Fest setup',
      '• 9:00 AM — Standup &lt;team&gt;',
      '• 11:30 PM — Late show',
      '• 11:30 PM — Late call (UTC)',
      '',
    ])
    expect(lines[8]).toMatch(/^<b>Since /)
  })

  it('still sends the brief, with a one-line note, when the calendar is down', async () => {
    process.env.GOOGLE_CALENDAR_ICS_URL = SECRET_URL
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const net = fakeNetwork(() => Promise.reject(new TypeError('fetch failed')))
    expect(await sendBrief(payload, BRIEF_NOW)).toBe(true)
    expect(net.telegram()).toHaveLength(1)
    const text = (JSON.parse(String(net.telegram()[0].init?.body)) as { text: string }).text
    expect(text).toContain('<b>Today</b>\n<i>Calendar unavailable (unreachable).</i>')
    expect(text).toContain('Waiting on you')
    expect(text).not.toContain('secret-token-xyz')
  })

  it('wraps up with tasks due by tomorrow and tomorrow’s calendar', async () => {
    process.env.GOOGLE_CALENDAR_ICS_URL = SECRET_URL
    const net = fakeNetwork()
    const mk = async (title: string, dueAt: string) => {
      const t = await payload.create({ collection: 'hq-tasks', data: { title, dueAt }, overrideAccess: true })
      tasks.push(t.id)
    }
    await mk('W2-TEST due tomorrow', '2026-10-02T14:00:00.000Z') // Fri 10 AM Miami
    await mk('W2-TEST due later', '2026-10-04T14:00:00.000Z')

    const wrap = await buildWrap(payload, WRAP_NOW)
    expect(wrap).toContain('wrap-up — Thursday, October 1')
    expect(wrap).toMatch(/<b>Due by tomorrow<\/b>[\s\S]*W2-TEST due tomorrow — Fri, Oct 2, 10:00 AM/)
    expect(wrap).not.toContain('W2-TEST due later')
    expect(wrap).toContain('<b>Tomorrow</b>\n• All day — Flamingo Fest')
    expect(wrap).not.toContain('Late show')
    expect(wrap).toContain('<b>Waiting on you</b>')
    // Tomorrow is read once, for the wrap.
    expect(net.calendar()).toHaveLength(1)
  })

  it('logs wrap.sent without moving the brief’s window or showing up in it', async () => {
    fakeNetwork()
    const now = new Date()
    const sinceLine = (b: string) => b.split('\n').find((l) => l.startsWith('<b>Since '))
    const before = await buildBrief(payload, now)

    expect(await sendWrap(payload, now)).toBe(true)
    const logged = await payload.find({
      collection: 'hq-events',
      where: { type: { equals: 'wrap.sent' } },
      overrideAccess: true,
    })
    expect(logged.docs.length).toBeGreaterThan(0)

    const after = await buildBrief(payload, now)
    expect(sinceLine(after)).toBe(sinceLine(before))
    expect(after).not.toContain('Wrap sent')
    expect(await buildWrap(payload, now)).not.toContain('Wrap sent')
  })

  it('does nothing without Telegram configured', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const net = fakeNetwork()
    expect(await sendWrap(payload)).toBe(false)
    expect(net.ours()).toEqual([])
  })
})
