// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import config from '@/payload.config'

import {
  PRIVATE_REPLY_WINDOW_MS,
  capRoom,
  commenterKey,
  isOwnComment,
  matchDraftMedia,
  matchesKeyword,
  normalize,
  parseNoDmCallback,
  noDmCallback,
  pickDelayMs,
  planComments,
  resetCommentDmState,
  runCommentDm,
  skipCommentDm,
  withinReplyWindow,
  type IgCommenter,
} from '@/lib/commentDm'
import { campaignWordingChanged, dmTextProblem } from '@/lib/commentDmCopy'
import type { HqCommentCampaign, HqCommentReply, User } from '@/payload-types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const ES = '¡Hola! Gracias por comentar 🦩 ¿Quieres reservar una mesa para Chacal en Fin de Año?'
const EN = "Hi! Thanks for commenting 🦩 Would you like to reserve a table for Chacal on New Year's Eve?"

/* ------------------------------------------------------------------------ */
/* Pure rules                                                                */
/* ------------------------------------------------------------------------ */

describe('the keyword', () => {
  it('matches whatever the case, accents, punctuation or emoji around it', () => {
    for (const t of ['chacal', 'CHACAL', 'CHACAL!', 'Chacal 🔥', 'chacál', 'CHÁCAL!!!', '#chacal', 'quiero mesa, chacal.', '🔥🔥CHACAL🔥🔥', '“Chacal”', 'Chacal\npor favor']) {
      expect(matchesKeyword(t, 'CHACAL'), t).toBe(true)
    }
    expect(matchesKeyword('chacal', 'Chácal')).toBe(true)
  })

  it('wants the word on its own', () => {
    for (const t of ['chacales', 'elchacal', 'chacal2', 'chaca l', 'nice reel', '', null, undefined]) {
      expect(matchesKeyword(t as string, 'CHACAL'), String(t)).toBe(false)
    }
    expect(matchesKeyword('chacal', '')).toBe(false)
    expect(normalize('ÁÉÍÓÚÑ')).toBe('aeioun')
  })
})

describe('the delay', () => {
  it('stays between the bounds, whatever the random number', () => {
    expect(pickDelayMs(5, 12, () => 0)).toBe(5 * MIN)
    expect(pickDelayMs(5, 12, () => 0.999999)).toBe(12 * MIN)
    expect(pickDelayMs(5, 12, () => 0.5)).toBe(8.5 * MIN)
    for (let i = 0; i < 200; i++) {
      const d = pickDelayMs(5, 12)
      expect(d).toBeGreaterThanOrEqual(5 * MIN)
      expect(d).toBeLessThanOrEqual(12 * MIN)
    }
    // Swapped or odd bounds are not a crash.
    expect(pickDelayMs(12, 5, () => 0)).toBe(5 * MIN)
    expect(pickDelayMs(-3, 0, () => 0.7)).toBe(0)
    expect(pickDelayMs(5, 12, () => 7)).toBe(12 * MIN)
  })
})

describe("Instagram's 7 days", () => {
  const t0 = new Date('2026-10-25T16:00:00Z')
  it('allows a private reply inside 7 days, with a margin before the edge', () => {
    expect(withinReplyWindow(t0, new Date(t0.getTime() + 10 * MIN))).toBe(true)
    expect(withinReplyWindow(t0, new Date(t0.getTime() + 6 * DAY))).toBe(true)
    expect(withinReplyWindow(t0, new Date(t0.getTime() + PRIVATE_REPLY_WINDOW_MS - 5 * MIN))).toBe(false)
    expect(withinReplyWindow(t0, new Date(t0.getTime() + 8 * DAY))).toBe(false)
    expect(withinReplyWindow('2026-10-25T16:00:00+0000', new Date(t0.getTime() + HOUR))).toBe(true)
  })
})

describe('who gets a DM', () => {
  const account = { igUserId: 'ig-fc' }
  const c = (id: string, text: string, user: string, uid?: string, ts = `2026-10-25T16:0${id.length % 10}:00+0000`): IgCommenter => ({
    id,
    text,
    timestamp: ts,
    username: user,
    from: uid ? { id: uid, username: user } : undefined,
  })

  it('never answers our own account or another one the token manages', () => {
    expect(isOwnComment(c('1', 'CHACAL', 'flamingo.county'), account)).toBe(true)
    expect(isOwnComment(c('1', 'CHACAL', 'Flamingo.County'), account)).toBe(true)
    expect(isOwnComment(c('1', 'CHACAL', 'someone', 'ig-fc'), account)).toBe(true)
    expect(isOwnComment(c('1', 'CHACAL', 'clubdelaamistad'), account, ['clubdelaamistad'])).toBe(true)
    expect(isOwnComment(c('1', 'CHACAL', 'flamingocounty'), account)).toBe(false) // the dotless handle is not ours
    expect(isOwnComment(c('1', 'CHACAL', 'ana', 'u-ana'), account)).toBe(false)
  })

  it('knows a person by id, else by handle', () => {
    expect(commenterKey(c('1', 'x', 'Ana', 'u-ana'))).toBe('id:u-ana')
    expect(commenterKey(c('1', 'x', '@Ana'))).toBe('u:ana')
    expect(commenterKey({ id: '1' })).toBeNull()
  })

  it('queues one per person, oldest comment first, and leaves out the rest', () => {
    const plan = planComments(
      [
        c('c3', 'CHACAL otra vez 🔥', 'ana', 'u-ana', '2026-10-25T16:09:00+0000'),
        c('c1', 'Chacal!', 'ana', 'u-ana', '2026-10-25T16:01:00+0000'),
        c('c2', 'CHÁCAL', 'beto', 'u-beto', '2026-10-25T16:02:00+0000'),
        c('c4', 'qué lindo', 'cora', 'u-cora'),
        c('c5', 'CHACAL', 'flamingo.county', 'ig-fc'),
        c('c6', 'chacales', 'dani', 'u-dani'),
        c('c7', 'chacal', 'eva', 'u-eva'),
        c('c8', 'chacal', 'fede', 'u-fede'),
      ],
      { keyword: 'CHACAL', account, knownCommentIds: new Set(['c7']), knownPeople: new Set(['id:u-fede']) },
    )
    expect(plan.map((p) => [p.comment.id, p.action])).toEqual([
      ['c1', 'queue'],
      ['c2', 'queue'],
      ['c8', 'repeat'], // already DM'd in this campaign, by an earlier run
      ['c3', 'repeat'], // ana's second comment
    ])
  })

  it('caps the hour', () => {
    expect(capRoom(0, 30)).toBe(30)
    expect(capRoom(29, 30)).toBe(1)
    expect(capRoom(35, 30)).toBe(0)
    expect(capRoom(0, null)).toBe(30)
  })
})

describe('what a DM may say', () => {
  it('takes the proposed wording', () => {
    expect(dmTextProblem(ES)).toBeNull()
    expect(dmTextProblem(EN)).toBeNull()
  })
  it('refuses links, offers and drinks', () => {
    expect(dmTextProblem('Reserva aquí: https://chacal.com')).toMatch(/links/)
    expect(dmTextProblem('see flamingocounty.com')).toMatch(/links/)
    expect(dmTextProblem('Free bottle for you!')).toMatch(/offers/)
    expect(dmTextProblem('Botella gratis')).toMatch(/offers/)
    expect(dmTextProblem('')).toBeTruthy()
  })
  it('knows a wording change from a harmless one', () => {
    const base = { keyword: 'CHACAL', dmTextEs: ES, dmTextEn: EN, posts: [{ mediaId: 'm1', language: 'es' as const }] }
    expect(campaignWordingChanged(base, { ...base })).toBe(false)
    expect(campaignWordingChanged(base, { ...base, dmTextEn: EN + '!' })).toBe(true)
    expect(campaignWordingChanged(base, { ...base, posts: [{ mediaId: 'm2', language: 'es' }] })).toBe(true)
  })
})

describe('draft to Instagram media', () => {
  const ES_CAPTION = 'Comenta CHACAL y te mandamos por DM el link pa’ reservar tu mesa'
  const EN_CAPTION = 'Comment CHACAL and we’ll DM you the link to book your table'
  const media = [
    { id: 'm-en', timestamp: '2026-10-25T15:50:40+0000', caption: EN_CAPTION + ' #miami' },
    { id: 'm-es', timestamp: '2026-10-25T15:45:30+0000', caption: ES_CAPTION + ' #hialeah' },
    { id: 'm-old', timestamp: '2026-10-24T20:00:00+0000', caption: 'other' },
  ]
  it('finds each of two posts five minutes apart, by caption', () => {
    expect(matchDraftMedia({ publishAt: '2026-10-25T15:45:00.000Z', caption: ES_CAPTION }, media, new Set())?.id).toBe('m-es')
    expect(matchDraftMedia({ publishAt: '2026-10-25T15:50:00.000Z', caption: EN_CAPTION }, media, new Set())?.id).toBe('m-en')
  })
  it('does not hand the Spanish reel to the English draft when Instagram ran late', () => {
    // ES went live 3.5 minutes after its slot, 1.5 minutes before the EN slot; EN is not up yet.
    const late = [{ id: 'm-es', timestamp: '2026-10-25T15:48:30+0000', caption: ES_CAPTION }]
    expect(matchDraftMedia({ publishAt: '2026-10-25T15:50:00.000Z', caption: EN_CAPTION }, late, new Set())).toBeNull()
    expect(matchDraftMedia({ publishAt: '2026-10-25T15:45:00.000Z', caption: ES_CAPTION }, late, new Set())?.id).toBe('m-es')
  })
  it('gives up rather than guess', () => {
    expect(matchDraftMedia({ publishAt: '2026-10-25T15:45:00.000Z', caption: 'something else entirely' }, media, new Set())).toBeNull()
    expect(matchDraftMedia({ publishAt: '2026-10-25T15:45:00.000Z', caption: ES_CAPTION }, media, new Set(['m-es']))).toBeNull()
    expect(matchDraftMedia({ publishAt: '2026-10-25T15:45:00.000Z', caption: '' }, media, new Set())).toBeNull() // two in the window, nothing to tell them by
    expect(matchDraftMedia({ publishAt: '2026-10-24T20:01:00.000Z', caption: '' }, media, new Set())?.id).toBe('m-old')
    expect(matchDraftMedia({ publishAt: null, caption: ES_CAPTION }, media, new Set())).toBeNull()
  })
})

describe('the No DM button', () => {
  it('round-trips its callback', () => {
    expect(parseNoDmCallback(noDmCallback(42))).toBe(42)
    expect(parseNoDmCallback('em:a:42')).toBeNull()
  })
})

describe('with no active campaign', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('makes no network call', async () => {
    process.env.META_GRAPH_TOKEN = 'x'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const payload = { find: async () => ({ docs: [] }) } as unknown as Payload
    expect(await runCommentDm(payload)).toMatchObject({ campaigns: 0, sent: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
    delete process.env.META_GRAPH_TOKEN
  })
})

/* ------------------------------------------------------------------------ */
/* Against the database, with a fake Graph and Telegram                     */
/* ------------------------------------------------------------------------ */

const TOKEN = 'TEST-SYSTEM-USER-TOKEN-comment-dm-0123456789'
const PAGE_TOKEN = 'TEST-PAGE-TOKEN-comment-dm-9876543210'
const NOW = new Date('2026-10-25T16:10:00Z')

type World = {
  scopes: string[] | null
  comments: Record<string, IgCommenter[]>
  send: (body: { recipient: { comment_id: string }; message: { text: string } }) => Response
}
type Sent = { url: URL; method: string; auth: string | null; body: Record<string, unknown> }

function fake(world: World) {
  const graph: Sent[] = []
  const telegram: { method: string; body: Record<string, unknown> }[] = []
  let messageId = 100
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (url.host === 'api.telegram.org') {
        telegram.push({ method: url.pathname.split('/').pop()!, body })
        return Response.json({ ok: true, result: { message_id: ++messageId } })
      }
      graph.push({ url, method: init?.method ?? 'GET', auth: new Headers(init?.headers).get('authorization'), body })
      const path = url.pathname.replace(/^\/v\d+\.\d+/, '')
      const err = (code: number, message: string, subcode?: number) =>
        Response.json({ error: { code, message: `${message} ${TOKEN}`, error_subcode: subcode } }, { status: 400 })
      if (path === '/me/accounts') {
        return Response.json({
          data: [
            { id: 'page-club', name: 'Club de la Amistad', access_token: 'club', instagram_business_account: { id: 'ig-club', username: 'clubdelaamistad' } },
            { id: 'page-fc', name: 'Flamingo County', access_token: PAGE_TOKEN, instagram_business_account: { id: 'ig-fc', username: 'flamingo.county' } },
          ],
        })
      }
      if (path === '/me/permissions') {
        if (!world.scopes) return err(100, 'nope')
        return Response.json({ data: world.scopes.map((permission) => ({ permission, status: 'granted' })) })
      }
      const m = /^\/([^/]+)(\/comments)?$/.exec(path)
      if (path === '/ig-fc/messages' && init?.method === 'POST') return world.send(body)
      if (m && m[2]) return Response.json({ data: world.comments[m[1]] ?? [] })
      if (m && m[1].startsWith('media-')) {
        return Response.json({
          id: m[1],
          username: m[1] === 'media-club' ? 'clubdelaamistad' : 'flamingo.county',
          permalink: `https://www.instagram.com/reel/${m[1]}/`,
          timestamp: '2026-10-25T15:45:30+0000',
        })
      }
      return err(803, 'unknown path')
    }),
  )
  return { graph, telegram }
}

const ok = () => Response.json({ recipient_id: 'r-1', message_id: 'mid-1' })
const ALL_SCOPES = ['instagram_basic', 'instagram_manage_comments', 'instagram_manage_messages', 'pages_show_list']

describe('comment DMs against the database', () => {
  let payload: Payload
  let user: User
  let mcpReq: PayloadRequest
  const errors = vi.spyOn(console, 'error')

  const cleanup = async () => {
    await payload.delete({ collection: 'hq-comment-replies', where: { id: { exists: true } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-comment-campaigns', where: { id: { exists: true } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-events', where: { refId: { like: 'comment-dm' } }, overrideAccess: true })
  }
  const campaign = (data: Partial<HqCommentCampaign> = {}) =>
    payload.create({
      collection: 'hq-comment-campaigns',
      data: {
        name: 'Chacal NYE',
        active: true,
        keyword: 'CHACAL',
        posts: [
          { mediaId: 'media-es', language: 'es' },
          { mediaId: 'media-en', language: 'en' },
        ],
        dmTextEs: ES,
        dmTextEn: EN,
        ...data,
      },
      overrideAccess: true,
    }) as Promise<HqCommentCampaign>
  const replies = async () =>
    (
      await payload.find({ collection: 'hq-comment-replies', sort: 'commentId', limit: 100, depth: 0, overrideAccess: true })
    ).docs as HqCommentReply[]
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * MIN)
  const ts = (minutesBeforeNow: number) => new Date(NOW.getTime() - minutesBeforeNow * MIN).toISOString().replace('.000Z', '+0000')

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await cleanup()
    user = await payload.create({
      collection: 'users',
      data: { email: `comment-dm-test-${Date.now()}@example.com`, password: 'not-a-real-password-1' },
      overrideAccess: true,
    })
    mcpReq = await createLocalReq({ user: { ...user, collection: 'users' } }, payload)
    mcpReq.payloadAPI = 'MCP'
    errors.mockImplementation(() => undefined)
  })
  beforeEach(async () => {
    process.env.META_GRAPH_TOKEN = TOKEN
    process.env.TELEGRAM_BOT_TOKEN = 'tg-test'
    process.env.TELEGRAM_OWNER_CHAT_ID = '1001'
    resetCommentDmState()
    await cleanup()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.META_GRAPH_TOKEN
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
  })
  afterAll(async () => {
    errors.mockRestore()
    if (!payload) return
    await cleanup()
    if (user) await payload.delete({ collection: 'users', id: user.id, overrideAccess: true })
  })

  it('alerts at once, DMs each person once after the delay, and never us', async () => {
    const c = await campaign()
    const world: World = {
      scopes: ALL_SCOPES,
      comments: {
        'media-es': [
          { id: 'c1', text: '¡CHACAL! 🔥', timestamp: ts(3), username: 'ana', from: { id: 'u-ana', username: 'ana' } },
          { id: 'c2', text: 'chacal otra vez', timestamp: ts(2), username: 'ana', from: { id: 'u-ana', username: 'ana' } },
          { id: 'c3', text: 'CHACAL', timestamp: ts(2), username: 'flamingo.county', from: { id: 'ig-fc', username: 'flamingo.county' } },
          { id: 'c4', text: 'qué rico', timestamp: ts(1), username: 'cora', from: { id: 'u-cora', username: 'cora' } },
        ],
        'media-en': [
          { id: 'c5', text: 'Chacal <b>yes</b>', timestamp: ts(1), username: 'beto', from: { id: 'u-beto', username: 'beto' } },
          // Ana on the other post: still one DM per person per campaign.
          { id: 'c6', text: 'CHACAL', timestamp: ts(1), username: 'ana', from: { id: 'u-ana', username: 'ana' } },
        ],
      },
      send: ok,
    }
    const { graph, telegram } = fake(world)

    const first = await runCommentDm(payload, NOW, { rng: () => 0.5 })
    expect(first).toMatchObject({ campaigns: 1, posts: 2, matched: 2, sent: 0, skipped: 2 })
    let rows = await replies()
    expect(rows.map((r) => [r.commentId, r.status, r.username, r.language])).toEqual([
      ['c1', 'pending', 'ana', 'es'],
      ['c2', 'skipped', 'ana', 'es'],
      ['c5', 'pending', 'beto', 'en'],
      ['c6', 'skipped', 'ana', 'en'],
    ])
    expect(rows[0].scheduledAt).toBe(at(8.5).toISOString())
    expect(rows[0].dmText).toBe(ES)
    expect(rows[2].dmText).toBe(EN)
    // Nothing was sent yet; the owner heard about each post's matches right away, with a No DM button.
    expect(graph.filter((g) => g.method === 'POST')).toHaveLength(0)
    const alerts = telegram.filter((t) => t.method === 'sendMessage')
    expect(alerts).toHaveLength(2)
    expect(String(alerts[0].body.text)).toContain('@ana')
    expect(String(alerts[1].body.text)).toContain('Chacal &lt;b&gt;yes&lt;/b&gt;') // escaped
    expect(JSON.stringify(alerts[0].body.reply_markup)).toContain(noDmCallback(rows[0].id))
    // The token never went into a URL.
    for (const g of graph) expect(g.url.toString()).not.toContain(TOKEN)

    // A second poll before the DM is due: nothing new, nothing said again.
    telegram.length = 0
    expect(await runCommentDm(payload, at(2), { rng: () => 0.5 })).toMatchObject({ matched: 0, sent: 0, skipped: 0 })
    expect(telegram).toHaveLength(0)

    // Due: one private reply per person, with the Page token, to the comment id.
    const third = await runCommentDm(payload, at(9), { rng: () => 0.5 })
    expect(third).toMatchObject({ sent: 2, manual: 0 })
    const posts = graph.filter((g) => g.method === 'POST')
    expect(posts.map((p) => p.body)).toEqual([
      { recipient: { comment_id: 'c1' }, message: { text: ES } },
      { recipient: { comment_id: 'c5' }, message: { text: EN } },
    ])
    expect(posts[0].auth).toBe(`Bearer ${PAGE_TOKEN}`)
    rows = await replies()
    expect(rows.filter((r) => r.status === 'sent').map((r) => [r.commentId, r.messageId])).toEqual([
      ['c1', 'mid-1'],
      ['c5', 'mid-1'],
    ])
    expect(String(telegram.at(-1)?.body.text)).toContain('DM sent')

    // And never again.
    await runCommentDm(payload, at(30), { rng: () => 0.5 })
    expect(graph.filter((g) => g.method === 'POST')).toHaveLength(2)
    expect(c.id).toBeTruthy()
  })

  it('without instagram_manage_messages: no send, the DM to paste at the due time, the scope said once', async () => {
    await campaign({ posts: [{ mediaId: 'media-es', language: 'es' }] })
    const world: World = {
      scopes: ['instagram_basic', 'instagram_manage_comments'],
      comments: { 'media-es': [{ id: 'c1', text: 'chacal', timestamp: ts(1), username: 'ana', from: { id: 'u-ana', username: 'ana' } }] },
      send: () => {
        throw new Error('must not send')
      },
    }
    const { graph, telegram } = fake(world)
    await runCommentDm(payload, NOW, { rng: () => 0 })
    const scopeMsgs = () => telegram.filter((t) => String(t.body.text).includes('instagram_manage_messages') && String(t.body.text).includes('Said once'))
    expect(scopeMsgs()).toHaveLength(1)
    expect((await replies())[0].status).toBe('pending')

    resetCommentDmState() // a restart: the "once" is in the database
    const out = await runCommentDm(payload, at(6), { rng: () => 0 })
    expect(out).toMatchObject({ sent: 0, manual: 1 })
    expect(graph.filter((g) => g.method === 'POST')).toHaveLength(0)
    expect(scopeMsgs()).toHaveLength(1)
    const manual = telegram.find((t) => String(t.body.text).includes('DM by hand'))!
    expect(String(manual.body.text)).toContain('@ana')
    expect(String(manual.body.text)).toContain(`<code>${ES}</code>`)
    expect(String(manual.body.text)).toContain('https://www.instagram.com/reel/media-es/')
    expect((await replies())[0]).toMatchObject({ status: 'manual', ownerNotified: true })
  })

  it('when Meta refuses the send: manual with the reason, no retry', async () => {
    await campaign({ posts: [{ mediaId: 'media-es', language: 'es' }] })
    let tries = 0
    const world: World = {
      scopes: null, // Graph won't say: learn from the send
      comments: { 'media-es': [{ id: 'c1', text: 'CHACAL', timestamp: ts(1), username: 'ana', from: { id: 'u-ana', username: 'ana' } }] },
      send: () => {
        tries++
        return Response.json({ error: { code: 10, message: `(#10) Application does not have permission for this action ${PAGE_TOKEN}` } }, { status: 403 })
      },
    }
    const { graph, telegram } = fake(world)
    await runCommentDm(payload, NOW, { rng: () => 0 })
    await runCommentDm(payload, at(5), { rng: () => 0 })
    await runCommentDm(payload, at(7), { rng: () => 0 })
    // Once with the Page token, once with the system user token (a refusal sent nothing), never again.
    expect(tries).toBe(2)
    expect(graph.filter((g) => g.method === 'POST').map((g) => g.auth)).toEqual([`Bearer ${PAGE_TOKEN}`, `Bearer ${TOKEN}`])
    const row = (await replies())[0]
    expect(row).toMatchObject({ status: 'manual', errorCode: '10' })
    expect(row.error).toContain('does not have permission')
    expect(row.error).not.toContain(PAGE_TOKEN)
    expect(telegram.some((t) => String(t.body.text).includes('DM by hand'))).toBe(true)
  })

  it('without instagram_manage_comments: reads nothing and says so once', async () => {
    await campaign()
    const world: World = { scopes: ['instagram_basic', 'instagram_manage_messages'], comments: {}, send: ok }
    const { graph, telegram } = fake(world)
    await runCommentDm(payload, NOW)
    resetCommentDmState()
    await runCommentDm(payload, at(2))
    expect(graph.some((g) => g.url.pathname.endsWith('/comments'))).toBe(false)
    expect(telegram.filter((t) => String(t.body.text).includes('instagram_manage_comments'))).toHaveLength(1)
  })

  it("refuses a post that isn't ours", async () => {
    await campaign({ posts: [{ mediaId: 'media-club', language: 'es' }] })
    const world: World = { scopes: ALL_SCOPES, comments: { 'media-club': [{ id: 'x', text: 'chacal', username: 'z', timestamp: ts(1) }] }, send: ok }
    const { graph, telegram } = fake(world)
    await runCommentDm(payload, NOW)
    expect(graph.some((g) => g.url.pathname.endsWith('/media-club/comments'))).toBe(false)
    expect(await replies()).toHaveLength(0)
    expect(telegram.some((t) => String(t.body.text).includes('not a @flamingo.county post'))).toBe(true)
  })

  it('holds the hourly cap, tells the owner once, and sends the rest later', async () => {
    await campaign({ hourlyCap: 1, posts: [{ mediaId: 'media-es', language: 'es' }] })
    const world: World = {
      scopes: ALL_SCOPES,
      comments: {
        'media-es': ['ana', 'beto', 'cora'].map((u, i) => ({ id: `c${i}`, text: 'CHACAL', timestamp: ts(5 - i), username: u, from: { id: `u-${u}`, username: u } })),
      },
      send: ok,
    }
    const { telegram } = fake(world)
    await runCommentDm(payload, NOW, { rng: () => 0 })
    expect(await runCommentDm(payload, at(6), { rng: () => 0 })).toMatchObject({ sent: 1 })
    expect(await runCommentDm(payload, at(8), { rng: () => 0 })).toMatchObject({ sent: 0 })
    expect(telegram.filter((t) => String(t.body.text).includes('hit 1 this hour'))).toHaveLength(1)
    expect(await runCommentDm(payload, at(67), { rng: () => 0 })).toMatchObject({ sent: 1 })
    expect((await replies()).map((r) => r.status)).toEqual(['sent', 'sent', 'pending'])
  })

  it('skips a comment past 7 days', async () => {
    await campaign({ posts: [{ mediaId: 'media-es', language: 'es' }] })
    fake({ scopes: ALL_SCOPES, comments: { 'media-es': [{ id: 'old', text: 'chacal', timestamp: ts(8 * 24 * 60), username: 'ana', from: { id: 'u-ana' } }] }, send: ok })
    expect(await runCommentDm(payload, NOW)).toMatchObject({ matched: 0, skipped: 1 })
    expect((await replies())[0]).toMatchObject({ status: 'skipped' })
  })

  it('No DM: the owner stops one, the other buttons stay', async () => {
    await campaign({ posts: [{ mediaId: 'media-es', language: 'es' }] })
    const world: World = {
      scopes: ALL_SCOPES,
      comments: { 'media-es': ['ana', 'beto'].map((u, i) => ({ id: `c${i}`, text: 'chacal', timestamp: ts(3 - i), username: u, from: { id: `u-${u}`, username: u } })) },
      send: ok,
    }
    const { graph } = fake(world)
    await runCommentDm(payload, NOW, { rng: () => 0 })
    const [ana, beto] = await replies()
    expect(ana.alertMessageId).toBeTruthy()
    const { outcome, keep } = await skipCommentDm(payload, ana.id, ana.alertMessageId!)
    expect(outcome).toContain('No DM for @ana')
    expect(keep.inline_keyboard.flat().map((b) => b.callback_data)).toEqual([noDmCallback(beto.id)])
    expect((await skipCommentDm(payload, ana.id)).outcome).toContain('already skipped')
    await runCommentDm(payload, at(6), { rng: () => 0 })
    expect(graph.filter((g) => g.method === 'POST').map((p) => (p.body.recipient as { comment_id: string }).comment_id)).toEqual(['c1'])
  })

  it('over MCP: set up, never switched on; a wording change switches it off', async () => {
    const { telegram } = fake({ scopes: ALL_SCOPES, comments: {}, send: ok })
    const doc = (await payload.create({
      collection: 'hq-comment-campaigns',
      data: { name: 'Chacal', active: true, keyword: 'CHACAL', posts: [{ mediaId: 'media-es', language: 'es' }], dmTextEs: ES, dmTextEn: EN },
      req: mcpReq,
      overrideAccess: false,
    })) as HqCommentCampaign
    expect(doc.active).toBe(false)
    await expect(
      payload.update({ collection: 'hq-comment-campaigns', id: doc.id, data: { dmTextEs: 'Botella gratis 🍾' }, req: mcpReq, overrideAccess: false }),
    ).rejects.toThrow()

    // The owner switches it on in the admin: told what will go out.
    await payload.update({ collection: 'hq-comment-campaigns', id: doc.id, data: { active: true }, overrideAccess: true })
    expect(telegram.some((t) => String(t.body.text).includes('Comment DMs on'))).toBe(true)

    // Claude edits the wording: off again, and the owner hears why.
    await payload.update({ collection: 'hq-comment-campaigns', id: doc.id, data: { dmTextEs: ES.replace('¡Hola!', '¡Hey!') }, req: mcpReq, overrideAccess: false })
    const fresh = (await payload.findByID({ collection: 'hq-comment-campaigns', id: doc.id, overrideAccess: true })) as HqCommentCampaign
    expect(fresh.active).toBe(false)
    expect(telegram.some((t) => String(t.body.text).includes('paused'))).toBe(true)

    // A harmless edit (notes) of an active campaign leaves it on.
    await payload.update({ collection: 'hq-comment-campaigns', id: doc.id, data: { active: true }, overrideAccess: true })
    await payload.update({ collection: 'hq-comment-campaigns', id: doc.id, data: { notes: 'ok' }, req: mcpReq, overrideAccess: false })
    expect(((await payload.findByID({ collection: 'hq-comment-campaigns', id: doc.id, overrideAccess: true })) as HqCommentCampaign).active).toBe(true)
  })
})
