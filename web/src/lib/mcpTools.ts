import { lookup } from 'dns/promises'
import { isIP } from 'net'
import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import type { HqSocialDraft } from '../payload-types'
import { buildBrief } from './brief'
import { miamiTime } from './hq'
import { isRunningCount, type MetricSummary } from './postiz'
import { PUBLISHABLE, publishStatus, requestPublish } from './publishRequests'
import { MESSAGE_LIMIT, esc, sendMessage, telegramConfigured } from './telegram'

/**
 * HQ's own MCP tools, beside the generic per-collection ones the plugin
 * generates. Each must also be ticked on the API key before a client sees it
 * (Admin → MCP → API Keys), the same as the collections.
 */

type ToolResult = { content: { type: 'text'; text: string }[] }
const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] })

/** Telegram HTML → plain text, for a client that is not Telegram. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/* ------------------------------------------------------------------------ */
/* Social report — the input to the weekly review                           */
/* ------------------------------------------------------------------------ */

const CHECKPOINT_ORDER = ['24h', '3d', '7d']

function readings(metrics: Record<string, MetricSummary>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(metrics).map(([label, m]) => [label, isRunningCount(label) ? m.latest : m.sum]),
  )
}

/**
 * Every post published in the window with what is known about it — kind,
 * language, time, its furthest checkpoint per platform, and link clicks — plus
 * each account's first and last snapshot in the window. Plain data: comparing
 * posts and drawing lessons is the reader's job, not this tool's.
 */
export async function socialReport(payload: Payload, days: number, now: Date = new Date()) {
  const from = new Date(now.getTime() - days * 86_400_000).toISOString()
  const [drafts, stats, clicks, channels] = await Promise.all([
    payload.find({
      collection: 'hq-social-drafts',
      where: { and: [{ status: { equals: 'scheduled' } }, { publishAt: { greater_than: from } }] },
      sort: 'publishAt',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'hq-social-stats',
      where: { and: [{ kind: { equals: 'post' } }, { createdAt: { greater_than: from } }] },
      limit: 2000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'hq-clicks',
      where: { createdAt: { greater_than: from } },
      limit: 10_000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'hq-social-stats',
      where: { and: [{ kind: { equals: 'channel' } }, { createdAt: { greater_than: from } }] },
      sort: 'createdAt',
      limit: 2000,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const idOf = (v: unknown) => (v && typeof v === 'object' ? (v as { id: number }).id : (v as number | null))

  const posts = drafts.docs.map((d: HqSocialDraft) => {
    const results: Record<string, { checkpoint: string; metrics: Record<string, number> }> = {}
    for (const s of stats.docs.filter((s) => idOf(s.draft) === d.id)) {
      const prev = results[s.platform]
      if (!prev || CHECKPOINT_ORDER.indexOf(s.checkpoint ?? '') > CHECKPOINT_ORDER.indexOf(prev.checkpoint)) {
        results[s.platform] = {
          checkpoint: s.checkpoint ?? '?',
          metrics: readings(s.metrics as Record<string, MetricSummary>),
        }
      }
    }
    return {
      draft: d.id,
      caption: d.caption.length > 160 ? d.caption.slice(0, 159) + '…' : d.caption,
      pillar: d.pillar ?? null,
      language: d.language ?? null,
      platforms: d.platforms,
      media: (d.media ?? []).length,
      publishedMiami: d.publishAt ? miamiTime(d.publishAt) : null,
      results,
      linkClicks: clicks.docs.filter((c) => idOf(c.draft) === d.id).length,
    }
  })

  const accounts: Record<string, { first: Record<string, number>; last: Record<string, number> }> = {}
  for (const c of channels.docs) {
    const r = readings(c.metrics as Record<string, MetricSummary>)
    accounts[c.platform] ??= { first: r, last: r }
    accounts[c.platform].last = r
  }

  const bioClicks: Record<string, number> = {}
  for (const c of clicks.docs.filter((c) => !c.draft)) bioClicks[c.source] = (bioClicks[c.source] ?? 0) + 1

  return { windowDays: days, posts, accounts, bioClicks }
}

/* ------------------------------------------------------------------------ */
/* Draft media from a URL                                                   */
/* ------------------------------------------------------------------------ */

const MEDIA_LIMIT = 50 * 1024 * 1024
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'video/mp4']

/** Loopback, private, link-local, CGNAT and unique-local ranges, v4 and v6. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    )
  }
  const v6 = ip.toLowerCase()
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6)
}

/**
 * Fetch a public https image or video into `hq-media` so a draft can use it.
 *
 * The server does the fetching, so it refuses anything that could reach
 * inside: https only, every resolved address must be public, and redirects
 * are not followed (a public URL could otherwise bounce to a private one).
 * Same type and size rules as an upload in the admin.
 */
export async function addMediaFromUrl(req: PayloadRequest, rawUrl: string, note?: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Not a URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Only https URLs.')
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('That host is not a public address.')
  }

  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!MEDIA_TYPES.includes(type)) throw new Error(`Unsupported type "${type}". JPEG, PNG or MP4 only.`)
  if (Number(res.headers.get('content-length') ?? 0) > MEDIA_LIMIT) throw new Error('Larger than 50 MB.')

  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > MEDIA_LIMIT) throw new Error('Larger than 50 MB.')

  const ext = type === 'video/mp4' ? 'mp4' : type === 'image/png' ? 'png' : 'jpg'
  const base = (url.pathname.split('/').pop() || 'media').replace(/\.[^.]*$/, '').replace(/[^\w-]+/g, '-').slice(0, 60)
  const doc = await req.payload.create({
    collection: 'hq-media',
    data: { note: note ?? `From ${url.hostname}` },
    file: { data, mimetype: type, name: `${base || 'media'}-${Date.now()}.${ext}`, size: data.length },
    req,
    overrideAccess: false,
  })
  return { id: doc.id, filename: doc.filename, mimeType: doc.mimeType, filesize: doc.filesize }
}

/* ------------------------------------------------------------------------ */
/* Telegram: results from Claude, to the owner                              */
/* ------------------------------------------------------------------------ */

/**
 * A client that loops must not be able to flood the owner's phone. Ten messages in ten minutes
 * and sixty in a day are far more than a person asks Claude to send, and the limit is
 * per server process, so a restart clears it: this is a brake on a runaway, not a quota.
 */
const SEND_WINDOW_MS = 10 * 60_000
const SEND_PER_WINDOW = 10
const SEND_PER_DAY = 60
let sentAt: number[] = []

/** For tests. */
export function resetTelegramSendLimit() {
  sentAt = []
}

/**
 * Send one message to the owner's Telegram chat, as HQ's bot. The chat is not a parameter: there
 * is no way to point this anywhere else. The text is escaped (it is plain text, never markup),
 * headed "Claude" so it reads differently from HQ's own messages, and refused, not trimmed, when
 * it will not fit, so nothing is silently cut off.
 */
export async function sendToOwnerTelegram(args: { text: string; title?: string }, now: number = Date.now()) {
  if (!telegramConfigured()) throw new Error("Telegram isn't set up on this server.")
  sentAt = sentAt.filter((t) => now - t < 86_400_000)
  if (sentAt.length >= SEND_PER_DAY) throw new Error('Daily limit of 60 messages reached.')
  if (sentAt.filter((t) => now - t < SEND_WINDOW_MS).length >= SEND_PER_WINDOW)
    throw new Error('Too many messages in the last 10 minutes. Put it in one message, or wait.')

  const head = `🤖 <b>Claude</b>${args.title ? ` · ${esc(args.title)}` : ''}`
  const body = `${head}\n\n${esc(args.text)}`
  if (body.length > MESSAGE_LIMIT)
    throw new Error(`Too long for one Telegram message once formatted (${body.length} of ${MESSAGE_LIMIT}). Shorten it or split it.`)

  const sent = await sendMessage(body)
  sentAt.push(now) // only a message that went counts against the limit
  return { messageId: sent.message_id }
}

/* ------------------------------------------------------------------------ */
/* Tool definitions                                                         */
/* ------------------------------------------------------------------------ */

const guard = async (fn: () => Promise<ToolResult>): Promise<ToolResult> => {
  try {
    return await fn()
  } catch (err) {
    return text(`Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}

type McpTool = NonNullable<NonNullable<MCPPluginConfig['mcp']>['tools']>[number]

export const hqMcpTools: McpTool[] = [
  {
    name: 'hqBrief',
    description:
      'The Flamingo HQ brief right now: what happened since the last scheduled brief, what is waiting on the owner (listing requests, drafts to approve, listings needing owner confirmation), open tasks, social numbers and posts going out in the next 24 hours. Read-only; does not move the scheduled brief.',
    parameters: {},
    handler: (_args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(htmlToText(await buildBrief(req.payload)))),
  },
  {
    name: 'hqSocialReport',
    description:
      'Results of every social post published in the last N days: caption, pillar, language, platforms, Miami publish time, the furthest stats checkpoint (24h/3d/7d) per platform, and link clicks; plus each account’s first and last snapshot in the window and bio-link clicks. JSON. Use it for the weekly review. Small samples: compare over weeks, not single posts.',
    parameters: { days: z.number().int().min(1).max(90).default(28).describe('Window in days (default 28)') },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify(await socialReport(req.payload, Number(args.days ?? 28)), null, 2))),
  },
  {
    name: 'hqSendTelegram',
    description:
      "Send a message to the owner's Telegram chat, from HQ's bot (the same chat as the morning brief). Use it to hand over results when the owner asks you to: a summary, what you found, a link. Plain text, up to about 3,500 characters; put any link in the text. It goes only to the owner and cannot be pointed anywhere else. Rate limited (10 per 10 minutes). Do not send secrets or keys, and do not send unprompted.",
    parameters: {
      text: z.string().min(1).max(3500).describe('The message, plain text'),
      title: z.string().max(100).optional().describe('Optional short heading, shown after "Claude"'),
    },
    handler: (args: Record<string, unknown>) =>
      guard(async () => {
        const sent = await sendToOwnerTelegram({ text: String(args.text), title: args.title as string | undefined })
        return text(`Sent to the owner's Telegram (message ${sent.messageId}).`)
      }),
  },
  {
    name: 'hqAddDraftMediaFromUrl',
    description:
      'Download a public https JPEG, PNG or MP4 (up to 50 MB) into HQ media and return its id, for the `media` field of an hq-social-drafts document. The first media id on a draft is the cover shown in Telegram. Instagram and TikTok drafts need at least one.',
    parameters: {
      url: z.string().url().describe('Public https URL of the image or video'),
      note: z.string().max(200).optional().describe('Optional note, e.g. the source or credit'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () =>
        text(JSON.stringify(await addMediaFromUrl(req, String(args.url), args.note as string | undefined))),
      ),
  },
  {
    name: 'hqRequestPublish',
    description:
      'Ask the owner to publish the current draft of a site document (' +
      PUBLISHABLE.join(', ') +
      '). Save the draft first with the create/update tool and draft: true — drafts are never visible on the site. The owner sees exactly what changes against the live page in Telegram and taps Publish or Reject. If you edit the draft again before they tap, they are shown the new version instead. Publishes nothing by itself.',
    parameters: {
      collection: z.enum(PUBLISHABLE).describe('Which collection'),
      id: z.union([z.string(), z.number()]).describe('Document id'),
      reason: z.string().max(500).optional().describe('One line for the owner: what this is'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () =>
        text(
          JSON.stringify({
            ...(await requestPublish(req.payload, args as never)),
            next: 'Waiting for the owner to tap Publish in Telegram. Check with hqPublishStatus.',
          }),
        ),
      ),
  },
  {
    name: 'hqPublishStatus',
    description: 'Where a publish request stands: pending, published, rejected, superseded, stale (the draft changed and was re-sent), expired or failed.',
    parameters: { requestId: z.number().int().positive() },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify(await publishStatus(req.payload, Number(args.requestId))))),
  },
]
