import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'
import type { Payload, PayloadRequest } from 'payload'
import sharp from 'sharp'
import { z } from 'zod'

import { PUBLISHED } from '../fields/shared'
import type { Event, HqSocialDraft, Story } from '../payload-types'
import { hqMediaDir } from '../collections/HqMedia'
import { CHUNK_MAX_CHARS, MAX_CHUNKS, addArtworkChunk, finishArtworkUpload, startArtworkUpload } from './artworkUpload'
import { buildBrief } from './brief'
import { trafficReport } from './growth'
import { addDays, dateOnly, eventEndDay, todayISO } from './dates'
import { cancelDraft, miamiTime } from './hq'
import { isRunningCount, type MetricSummary } from './postiz'
import { PUBLISHABLE, publishStatus, requestPublish } from './publishRequests'
import { PHOTO_LICENSES, canonicalLicenseUrl, isPhotoLicense, licenseLabel, type PhotoLicense } from './photoLicense'
import { REQUEST_KINDS, isRequestKind, type RequestKind } from './requestKinds'
import {
  ARTWORK_BUDGET,
  ARTWORK_CREDIT,
  ARTWORK_ORIGINS,
  ARTWORK_UPLOAD_LIMIT,
  checkArtworkMeta,
  fitArtwork,
  focalPoint,
  storeSiteArtwork,
  type ArtworkMetaArgs,
  type ArtworkOrigin,
} from './siteArtwork'
import { routes } from './routes'
import { SITE_NAME } from './site'
import { MESSAGE_LIMIT, esc, sendMessage, telegramConfigured } from './telegram'

/**
 * HQ's own MCP tools, beside the generic per-collection ones the plugin
 * generates. Each must also be ticked on the API key before a client sees it
 * (Admin → MCP → API Keys), the same as the collections.
 */

export { ARTWORK_BUDGET, ARTWORK_CREDIT, ARTWORK_ORIGINS, fitArtwork, type ArtworkOrigin }

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
      where: { and: [{ status: { in: ['scheduled', 'published'] } }, { publishAt: { greater_than: from } }] },
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
/* Weekly review: everything the routine reads, in one call                 */
/* ------------------------------------------------------------------------ */

const REVIEW_DAYS = 28
const AHEAD_DAYS = 14
const STORY_LIMIT = 10

/** A localized field read with `locale: 'all'`: `{ en, es }`, or a bare string on an unlocalized read. */
function bothLanguages(v: unknown): { es: string | null; en: string | null } {
  if (v && typeof v === 'object') {
    const l = v as Record<string, string | null | undefined>
    return { es: l.es ?? null, en: l.en ?? null }
  }
  return { es: null, en: typeof v === 'string' ? v : null }
}

/**
 * The weekly review's whole input: the 28-day social report, the current
 * playbook, the published events coming up in the next 14 days, the newest
 * published stories, and the social drafts already waiting for the owner.
 *
 * Built field by field from depth-0 reads, so nothing comes along by accident:
 * no listing phone or hours (an event's `listing` would populate them at a
 * higher depth, and most are placeholder data), and nothing from listing
 * requests or subscribers, which are never read here. Only published site
 * content is listed: the key's user is staff, and staff can read drafts.
 */
export async function weeklyReviewContext(payload: Payload, now: Date = new Date()) {
  const today = todayISO(now)
  const until = addDays(today, AHEAD_DAYS)

  const [report, playbook, events, stories, pending] = await Promise.all([
    socialReport(payload, REVIEW_DAYS, now),
    payload.findGlobal({ slug: 'hq-playbook', depth: 0, overrideAccess: true }),
    payload.find({
      collection: 'events',
      where: {
        and: [
          PUBLISHED,
          { date: { less_than_equal: `${until}T23:59:59.999Z` } },
          // From yesterday: a 9PM to 1AM night that started yesterday is still on today.
          {
            or: [
              { date: { greater_than_equal: `${addDays(today, -1)}T00:00:00.000Z` } },
              { endDate: { greater_than_equal: `${today}T00:00:00.000Z` } },
            ],
          },
        ],
      },
      sort: 'date',
      locale: 'all',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'stories',
      where: PUBLISHED,
      sort: '-updatedAt',
      locale: 'all',
      limit: STORY_LIMIT,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'hq-social-drafts',
      where: { status: { equals: 'pending' } },
      sort: 'scheduledFor',
      limit: 50,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  const upcomingEvents = (events.docs as Event[])
    .map((e) => ({ e, endDay: eventEndDay(e) }))
    .filter(({ endDay }) => endDay >= today)
    .map(({ e, endDay }) => ({
      id: e.id,
      slug: e.slug,
      title: bothLanguages(e.title),
      date: dateOnly(e.date),
      ...(endDay !== dateOnly(e.date) ? { endDay } : {}),
      timeLabel: bothLanguages(e.timeLabel),
      hasImage: Boolean(e.image),
      path: { es: routes.event('es', e.slug), en: routes.event('en', e.slug) },
    }))

  const recentStories = (stories.docs as Story[]).map((s) => ({
    id: s.id,
    slug: s.slug,
    title: bothLanguages(s.title),
    updated: dateOnly(s.updatedAt),
    hasImage: Boolean(s.cover),
    path: { es: routes.story('es', s.slug), en: routes.story('en', s.slug) },
  }))

  const pendingDrafts = (pending.docs as HqSocialDraft[]).map((d) => ({
    id: d.id,
    scheduledMiami: miamiTime(d.scheduledFor),
    platforms: d.platforms,
    pillar: d.pillar ?? null,
    language: d.language ?? null,
    caption: d.caption.length > 120 ? d.caption.slice(0, 119) + '…' : d.caption,
  }))

  return {
    generatedMiami: miamiTime(now),
    socialReport: report,
    playbook: playbook.body?.trim()
      ? {
          body: playbook.body,
          updatedFrom: { from: dateOnly(playbook.updatedFrom?.from), to: dateOnly(playbook.updatedFrom?.to) },
          sampleSize: playbook.sampleSize ?? null,
          updatedAt: playbook.updatedAt ?? null,
        }
      : null,
    upcomingEvents: { from: today, to: until, events: upcomingEvents },
    // Stories carry no date of their own, so "upcoming" means the newest published ones.
    recentStories,
    pendingDrafts,
  }
}

/* ------------------------------------------------------------------------ */
/* Growth review: traffic, what shipped, experiments, plus the social review */
/* ------------------------------------------------------------------------ */

const SHIPPED_TYPES = [
  'site.published',
  'social.scheduled',
  'social.failed',
  'listing_request.created',
  'subscriber.created',
  'member.created',
]

/**
 * The growth review's whole input (web/hq/growth-review.md): everything the
 * weekly social review reads, plus the site's own traffic, what is on the site,
 * what shipped in the window, the experiment ledger and the open tasks.
 *
 * Same rules as `weeklyReviewContext`: published content only, depth 0, and
 * nothing with contact details. Listing requests and signups are counted from
 * `hq-events` by type, never read.
 */
export async function growthContext(payload: Payload, now: Date = new Date()) {
  const since = new Date(now.getTime() - REVIEW_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const recentlyClosed = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const published = (collection: 'events' | 'stories' | 'spotlights' | 'weekly-events') =>
    payload.count({ collection, where: PUBLISHED, overrideAccess: true }).then((r) => r.totalDocs)
  const listingsBy = (status: string) =>
    payload
      .count({
        collection: 'listings',
        where: { and: [PUBLISHED, { publicationStatus: { equals: status } }] },
        overrideAccess: true,
      })
      .then((r) => r.totalDocs)

  const [review, traffic, events, stories, spotlights, weekly, ready, needsOwner, unsourced, shipped, experiments, tasks] =
    await Promise.all([
      weeklyReviewContext(payload, now),
      trafficReport(payload, REVIEW_DAYS, now),
      published('events'),
      published('stories'),
      published('spotlights'),
      published('weekly-events'),
      listingsBy('ready'),
      listingsBy('needs_owner_confirmation'),
      listingsBy('unsourced'),
      payload.find({
        collection: 'hq-events',
        where: { and: [{ createdAt: { greater_than_equal: since } }, { type: { in: SHIPPED_TYPES } }] },
        sort: '-createdAt',
        limit: 200,
        depth: 0,
        overrideAccess: true,
        select: { type: true, summary: true, data: true, createdAt: true },
      }),
      payload.find({
        collection: 'hq-experiments',
        where: {
          or: [
            { status: { in: ['planned', 'running'] } },
            { and: [{ status: { equals: 'done' } }, { updatedAt: { greater_than_equal: recentlyClosed } }] },
          ],
        },
        sort: '-updatedAt',
        limit: 50,
        depth: 0,
        overrideAccess: true,
      }),
      payload.find({
        collection: 'hq-tasks',
        where: { status: { not_equals: 'done' } },
        sort: 'dueAt',
        limit: 50,
        depth: 0,
        overrideAccess: true,
        select: { title: true, assignee: true, status: true, dueAt: true },
      }),
    ])

  // Intake is counted, never listed: its summaries name the people who wrote in.
  // `listingRequests` is every request off the hub, whatever its kind (the name
  // predates the other three); `requestsByKind` splits it. Only `kind` is read
  // from the event's data.
  const intake = {
    listingRequests: 0,
    requestsByKind: Object.fromEntries(REQUEST_KINDS.map((k) => [k, 0])) as Record<RequestKind, number>,
    newsletterSignups: 0,
    memberSignups: 0,
  }
  const shippedRows: { day: string; type: string; summary: string }[] = []
  for (const e of shipped.docs) {
    if (e.type === 'listing_request.created') {
      intake.listingRequests += 1
      const kind = (e.data as { kind?: unknown } | null)?.kind
      intake.requestsByKind[isRequestKind(kind) ? kind : 'listing'] += 1
    }
    else if (e.type === 'subscriber.created') intake.newsletterSignups += 1
    else if (e.type === 'member.created') intake.memberSignups += 1
    else shippedRows.push({ day: todayISO(new Date(e.createdAt)), type: e.type, summary: e.summary })
  }

  return {
    goal: 'More visitors from Miami-Dade to flamingocounty.com, organic first. Then more verified restaurant listings, then paid spotlights sold privately (never prices on the site).',
    ...review,
    traffic,
    inventory: {
      listings: { ready, needsOwnerConfirmation: needsOwner, unsourced },
      events,
      weeklyEvents: weekly,
      stories,
      spotlights,
    },
    shipped: { days: REVIEW_DAYS, items: shippedRows },
    intake: { days: REVIEW_DAYS, ...intake },
    experiments: experiments.docs.map((x) => ({
      id: x.id,
      title: x.title,
      status: x.status,
      verdict: x.verdict ?? null,
      hypothesis: x.hypothesis,
      metric: x.metric,
      baseline: x.baseline ?? null,
      expected: x.expected ?? null,
      startedOn: dateOnly(x.startedOn) || null,
      checkOn: dateOnly(x.checkOn) || null,
      result: x.result ?? null,
    })),
    openTasks: tasks.docs.map((t) => ({
      id: t.id,
      title: t.title,
      assignee: t.assignee,
      status: t.status,
      due: t.dueAt ? miamiTime(t.dueAt) : null,
    })),
  }
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
 * Fetch a file the server is pointed at, without letting it reach inside.
 *
 * https only, no credentials or port in the URL, every resolved address
 * public, and redirects are not followed (a public URL could otherwise bounce
 * to a private one). When `hosts` is given, the host must be one of them,
 * exactly. Then the type and size rules of an upload in the admin.
 */
async function fetchPublicFile(
  rawUrl: string,
  opts: { types: readonly string[]; typesLabel: string; limit: number; hosts?: readonly string[] },
): Promise<{ url: URL; data: Buffer; type: string }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Not a URL.')
  }
  if (url.protocol !== 'https:') throw new Error('Only https URLs.')
  if (url.username || url.password || url.port) throw new Error('No credentials or port in the URL.')
  if (opts.hosts && !opts.hosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`Host "${url.hostname}" is not allowed. Only: ${opts.hosts.join(', ')}.`)
  }
  const addresses = await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error('That host is not a public address.')
  }

  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      // Wikimedia refuses requests without a descriptive User-Agent.
      headers: { 'User-Agent': 'FlamingoCountyHQ/1.0 (+https://flamingocounty.com)' },
    })
  } catch (err) {
    throw new Error(`Fetch failed (redirects are not followed): ${err instanceof Error ? err.message : String(err)}`)
  }
  if (res.redirected || (res.status >= 300 && res.status < 400)) {
    throw new Error('The URL redirects, and redirects are not followed. Use the direct file URL.')
  }
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!opts.types.includes(type)) throw new Error(`Unsupported type "${type}". ${opts.typesLabel} only.`)
  const tooBig = `Larger than ${Math.round(opts.limit / 1024 / 1024)} MB.`
  if (Number(res.headers.get('content-length') ?? 0) > opts.limit) throw new Error(tooBig)

  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > opts.limit) throw new Error(tooBig)
  return { url, data, type }
}

/** A filename stem from a URL's last path segment: "Hialeah_Park_Race_Track_-28830740140-". */
function fileStem(url: URL): string {
  const parts = url.pathname.split('/')
  // A IIIF image ends in …/<identifier>/full/<size>/<rotation>/default.jpg: name it by the identifier.
  const full = parts.lastIndexOf('full')
  let last = (/^default\./.test(parts.at(-1) ?? '') && full > 0 ? parts[full - 1] : parts.pop()) || 'media'
  try {
    last = decodeURIComponent(last)
  } catch {
    // keep it as it is
  }
  return last.replace(/\.[^.]*$/, '').replace(/[^\w-]+/g, '-').slice(0, 60) || 'media'
}

/**
 * Fetch a public https image or video into `hq-media` so a draft can use it.
 * The server does the fetching, so it refuses anything that could reach
 * inside (`fetchPublicFile`). Same type and size rules as an admin upload.
 */
export async function addMediaFromUrl(req: PayloadRequest, rawUrl: string, note?: string) {
  const { url, data, type } = await fetchPublicFile(rawUrl, {
    types: MEDIA_TYPES,
    typesLabel: 'JPEG, PNG or MP4',
    limit: MEDIA_LIMIT,
  })
  return storeHqMedia(req, { data, type, stem: fileStem(url), note: note ?? `From ${url.hostname}` })
}

/**
 * Put bytes into `hq-media`. Instagram takes JPEG only, and a PNG (the event
 * poster, a screenshot) would fail there at approval time, so it is
 * re-encoded here, flattened on white. Shared by the URL and upload tools.
 */
async function storeHqMedia(req: PayloadRequest, args: { data: Buffer; type: string; stem: string; note: string }) {
  let file = args.data
  let mimetype = args.type
  if (mimetype === 'image/png') {
    file = await sharp(file).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer()
    mimetype = 'image/jpeg'
  }
  const ext = mimetype === 'video/mp4' ? 'mp4' : 'jpg'
  const doc = await req.payload.create({
    collection: 'hq-media',
    data: { note: args.note },
    file: { data: file, mimetype, name: `${args.stem}-${Date.now()}.${ext}`, size: file.length },
    req,
    overrideAccess: false,
  })
  return { id: doc.id, filename: doc.filename, mimeType: doc.mimeType, filesize: doc.filesize }
}

/**
 * What a file really is, from its first bytes. A declared type alone is not
 * trusted: a mislabelled file would only fail later, at approval time.
 * QuickTime (.mov) shares MP4's container but Postiz accepts only MP4.
 */
export function sniffMediaType(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp') {
    return b.subarray(8, 12).toString('latin1') === 'qt  ' ? 'video/quicktime' : 'video/mp4'
  }
  return null
}

/** Base64 in, checked bytes out: size first (before decoding), then the declared type against the real one. */
export function decodeUpload(
  args: { dataBase64: string; mimeType: string },
  limit: number = MEDIA_LIMIT,
): { data: Buffer; type: string } {
  const b64 = args.dataBase64.replace(/\s+/g, '')
  if (b64.length > Math.ceil((limit * 4) / 3) + 8) throw new Error(`Larger than ${Math.round(limit / 1024 / 1024)} MB.`)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new Error('dataBase64 is not valid base64.')
  const data = Buffer.from(b64, 'base64')
  if (data.length > limit) throw new Error(`Larger than ${Math.round(limit / 1024 / 1024)} MB.`)
  const real = sniffMediaType(data)
  if (real === 'video/quicktime') throw new Error('That is a QuickTime (.mov) file. Export it as MP4 (H.264) first.')
  if (!real || !MEDIA_TYPES.includes(real)) throw new Error('Not a JPEG, PNG or MP4 file.')
  if (real !== args.mimeType) throw new Error(`Declared ${args.mimeType} but the file is ${real}.`)
  return { data, type: real }
}

/**
 * Add a file sent from the caller's own computer to `hq-media`: for a finished
 * video that is not on any public URL. Authenticated by the MCP key like every
 * tool, so the file is never exposed. A file already stored (same bytes) is
 * returned, not stored twice, so a retry is safe.
 */
export async function addMediaFromUpload(
  req: PayloadRequest,
  args: { filename: string; mimeType: string; dataBase64: string; note?: string },
) {
  const { data, type } = decodeUpload(args)
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16)
  const tag = `[sha256 ${hash}]`
  const found = await req.payload.find({
    collection: 'hq-media',
    where: { note: { contains: tag } },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: false,
  })
  if (found.docs[0]) {
    const d = found.docs[0]
    return { id: d.id, filename: d.filename, mimeType: d.mimeType, filesize: d.filesize, existing: true }
  }
  const stem = args.filename.replace(/\.[^.]*$/, '').replace(/[^\w-]+/g, '-').slice(0, 60) || 'upload'
  const note = `${args.note ? `${args.note.slice(0, 160)} ` : 'Uploaded from the owner\'s computer '}${tag}`
  return { ...(await storeHqMedia(req, { data, type, stem, note })), existing: false }
}

/* ------------------------------------------------------------------------ */
/* Licensed venue photos, into the public media library                     */
/* ------------------------------------------------------------------------ */

/**
 * Where a site photo may be downloaded from: Wikimedia Commons' file server,
 * Flickr's, the Library of Congress's, and the University of Miami Libraries'
 * digital collections (the Cuban Heritage Collection's IIIF server, e.g. the
 * public-domain U.S. Cuban Refugee Program photos in CHC0218). Each publishes
 * a licence per file. Exact hostnames, no subdomains.
 */
export const SITE_MEDIA_HOSTS = [
  'upload.wikimedia.org',
  'live.staticflickr.com',
  'tile.loc.gov',
  'loc.gov',
  'digitalcollections.library.miami.edu',
] as const
/** Where the description page stating the licence may be. It is linked from the public page. */
const SOURCE_HOSTS = [
  'commons.wikimedia.org',
  'en.wikipedia.org',
  'es.wikipedia.org',
  'www.flickr.com',
  'flickr.com',
  'www.loc.gov',
  'loc.gov',
  'digitalcollections.library.miami.edu',
]
const SITE_MEDIA_LIMIT = 40 * 1024 * 1024
const SITE_MEDIA_TYPES = ['image/jpeg', 'image/png']
/** Narrower than this and the 1200-wide link card would blow it up. */
const SITE_MEDIA_MIN_WIDTH = 1000
/** The stored original is cut to this before Payload makes its sizes (the largest is 1920). */
const SITE_MEDIA_MAX_SIDE = 2560
/** Room for it on the cards' credit line. */
const CREDIT_MAX = 120

export type SiteMediaArgs = {
  url: string
  altEs: string
  altEn: string
  credit: string
  license: string
  licenseUrl?: string | null
  sourceUrl: string
  modified?: boolean
  /** Where the crops centre, 0–100 across and down (default the middle). */
  focalX?: number
  focalY?: number
}

const focal = focalPoint

function httpsUrl(v: string, what: string): URL {
  let u: URL
  try {
    u = new URL(v)
  } catch {
    throw new Error(`${what} is not a URL.`)
  }
  if (u.protocol !== 'https:') throw new Error(`${what} must be https.`)
  return u
}

/**
 * The licence deed to link. For a CC licence it must be that licence's own
 * deed on creativecommons.org (`deed.es` and `legalcode` are fine), so a
 * `cc-by-2.0` claim cannot point at a `by-nc` deed. Left out, it is filled in.
 */
export function checkLicenseUrl(license: PhotoLicense, given: string | null | undefined): string | null {
  const canonical = canonicalLicenseUrl(license)
  if (!given?.trim()) return canonical
  const u = httpsUrl(given.trim(), 'licenseUrl')
  if (!canonical) return u.toString() // public domain: whichever page says so
  const want = new URL(canonical)
  const path = u.pathname.replace(/(deed|legalcode)(\.[\w-]+)?$/, '').replace(/\/?$/, '/')
  if (u.hostname !== want.hostname || path !== want.pathname) {
    throw new Error(`licenseUrl does not match ${licenseLabel(license, 'en')}: expected ${canonical}`)
  }
  return canonical
}

/**
 * Download a licensed photo of a venue into the public `media` library, with
 * its credit, licence and source, and return its id for an event's `image`.
 *
 * Every rule is checked here, not only in the tool's schema:
 * - the file comes from an allowlisted host (`SITE_MEDIA_HOSTS`), over https,
 *   without redirects, from a public address, as a JPEG or PNG under 40 MB;
 * - the licence is public domain or a CC licence that allows commercial reuse
 *   and changes (`PHOTO_LICENSES`: NC and ND are not there), and a licence
 *   URL, if given, is that licence's own deed;
 * - a credit and an https description page are required.
 *
 * The photo is decoded and re-encoded (no metadata carried over) and cut to
 * 2560 px; Payload then stores it as WebP with its sizes, like any upload.
 *
 * It lands in the public library, so the file has a URL from now on. It is on
 * a page only once an event that uses it is published, and that is the
 * owner's tap: setting an event's `image` over MCP is a draft edit.
 */
export async function addSiteMediaFromUrl(req: PayloadRequest, args: SiteMediaArgs) {
  const credit = String(args.credit ?? '').replace(/\s+/g, ' ').trim()
  if (!credit) throw new Error('A credit is required: the photographer or the institution.')
  if (credit.length > CREDIT_MAX) throw new Error(`Credit too long (${credit.length} of ${CREDIT_MAX} characters).`)
  const altEn = String(args.altEn ?? '').trim()
  const altEs = String(args.altEs ?? '').trim()
  if (!altEn || !altEs) throw new Error('Alt text is required in both languages (altEs, altEn).')
  if (!isPhotoLicense(args.license)) {
    throw new Error(
      `License "${String(args.license)}" is not allowed. Only ${PHOTO_LICENSES.join(', ')}: public domain, or Creative Commons that allows commercial reuse and changes (no NC, no ND).`,
    )
  }
  const license = args.license
  const licenseUrl = checkLicenseUrl(license, args.licenseUrl)
  const source = httpsUrl(String(args.sourceUrl ?? ''), 'sourceUrl')
  if (!SOURCE_HOSTS.includes(source.hostname.toLowerCase())) {
    throw new Error(`sourceUrl must be the photo's description page on ${SOURCE_HOSTS.join(', ')}.`)
  }
  const focalX = focal(args.focalX, 'focalX')
  const focalY = focal(args.focalY, 'focalY')

  const { url, data } = await fetchPublicFile(args.url, {
    types: SITE_MEDIA_TYPES,
    typesLabel: 'JPEG or PNG',
    limit: SITE_MEDIA_LIMIT,
    hosts: SITE_MEDIA_HOSTS,
  })

  // The bytes, not the header, decide what it is.
  const meta = await sharp(data)
    .metadata()
    .catch(() => null)
  if (!meta || (meta.format !== 'jpeg' && meta.format !== 'png') || !meta.width || !meta.height) {
    throw new Error('Not a readable JPEG or PNG.')
  }
  const wide = meta.orientation && meta.orientation >= 5 ? meta.height : meta.width
  if (wide < SITE_MEDIA_MIN_WIDTH) throw new Error(`Too small: ${wide} px wide, at least ${SITE_MEDIA_MIN_WIDTH} needed.`)
  const jpeg = await sharp(data)
    .rotate()
    .resize({ width: SITE_MEDIA_MAX_SIDE, height: SITE_MEDIA_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()

  const doc = await req.payload.create({
    collection: 'media',
    data: {
      alt: altEn,
      credit,
      license,
      licenseUrl,
      sourceUrl: source.toString(),
      modified: args.modified ?? true,
      // Payload takes a focal point only with both values set, and reads 0 as unset.
      ...(focalX !== undefined || focalY !== undefined
        ? { focalX: Math.max(1, focalX ?? 50), focalY: Math.max(1, focalY ?? 50) }
        : {}),
    },
    file: { data: jpeg, mimetype: 'image/jpeg', name: `${fileStem(url)}-${Date.now()}.jpg`, size: jpeg.length },
    locale: 'en',
    req,
    overrideAccess: false,
  })
  await req.payload.update({ collection: 'media', id: doc.id, data: { alt: altEs }, locale: 'es', req, overrideAccess: false })
  return { id: doc.id, filename: doc.filename, width: doc.width, height: doc.height }
}

/* ------------------------------------------------------------------------ */
/* Story reels, into the public videos library                              */
/* ------------------------------------------------------------------------ */

export type SiteVideoArgs = {
  hqMediaId: number | string
  posterHqMediaId: number | string
  language: 'en' | 'es'
  title: string
  posterAlt: string
  durationSeconds?: number
  credits?: string
}

/** The poster is a phone-shaped cover card; anything much wider is the wrong file. */
const POSTER_MIN_WIDTH = 720
const POSTER_MAX_RATIO = 0.8

/** An `hq-media` file's bytes, read off the volume like the Postiz upload does. */
async function readHqMedia(req: PayloadRequest, id: number | string, what: string) {
  const doc = await req.payload.findByID({ collection: 'hq-media', id, depth: 0, req, overrideAccess: false }).catch(() => null)
  if (!doc?.filename) throw new Error(`${what}: no HQ media with id ${id}.`)
  const data = await readFile(path.join(hqMediaDir(), path.basename(doc.filename)))
  return { doc, data, type: sniffMediaType(data) }
}

/**
 * Put a finished reel on the public site: copy an `hq-media` MP4 into `videos`,
 * with its cover card (an `hq-media` JPEG or PNG) as the poster, and return the
 * video's id for a story's localized `video` field.
 *
 * The reel and the card are the site's own production, already uploaded to HQ
 * for the social drafts; that is why this takes HQ ids and no URL. A third
 * party's photo still comes in only through hqAddSiteMediaFromUrl.
 *
 * The poster lands in `media` (credited to Flamingo County) so it gets the
 * WebP sizes, and doubles as the story's link preview when the story has no
 * cover of its own. Nothing shows on a page until a story using the video is
 * published by the owner's tap.
 */
export async function addSiteVideo(req: PayloadRequest, args: SiteVideoArgs) {
  const title = String(args.title ?? '').replace(/\s+/g, ' ').trim()
  if (!title || title.length > 160) throw new Error('A title of 1–160 characters is required.')
  const posterAlt = String(args.posterAlt ?? '').trim()
  if (!posterAlt) throw new Error('posterAlt is required: what the cover card shows.')
  if (args.language !== 'en' && args.language !== 'es') throw new Error('language must be en or es.')
  const duration = args.durationSeconds === undefined ? undefined : Math.round(Number(args.durationSeconds))
  if (duration !== undefined && !(duration > 0 && duration < 3600)) throw new Error('durationSeconds must be 1–3599.')

  const video = await readHqMedia(req, args.hqMediaId, 'hqMediaId')
  if (video.type !== 'video/mp4') throw new Error('hqMediaId is not an MP4.')
  const poster = await readHqMedia(req, args.posterHqMediaId, 'posterHqMediaId')
  if (poster.type !== 'image/jpeg' && poster.type !== 'image/png') throw new Error('posterHqMediaId is not a JPEG or PNG.')
  const meta = await sharp(poster.data).metadata()
  if (!meta.width || !meta.height || meta.width < POSTER_MIN_WIDTH || meta.width / meta.height > POSTER_MAX_RATIO) {
    throw new Error(`The poster should be the 1080×1920 cover card; this one is ${meta.width}×${meta.height}.`)
  }
  const jpeg = await sharp(poster.data).jpeg({ quality: 90 }).toBuffer()
  const stem = path.basename(video.doc.filename as string).replace(/\.[^.]*$/, '').replace(/-\d{10,}$/, '').slice(0, 60)

  const posterDoc = await req.payload.create({
    collection: 'media',
    data: { alt: posterAlt, credit: SITE_NAME, modified: false },
    file: { data: jpeg, mimetype: 'image/jpeg', name: `${stem}-cover-${Date.now()}.jpg`, size: jpeg.length },
    locale: args.language,
    req,
    overrideAccess: false,
  })
  // `alt` is localized and required; the card is in one language, so both carry its text.
  const other = args.language === 'en' ? 'es' : 'en'
  await req.payload.update({ collection: 'media', id: posterDoc.id, data: { alt: posterAlt }, locale: other, req, overrideAccess: false })

  const doc = await req.payload.create({
    collection: 'videos',
    data: {
      title,
      language: args.language,
      poster: posterDoc.id,
      ...(duration ? { durationSeconds: duration } : {}),
      ...(args.credits?.trim() ? { credits: args.credits.trim().slice(0, 300) } : {}),
    },
    file: { data: video.data, mimetype: 'video/mp4', name: `${stem}-${Date.now()}.mp4`, size: video.data.length },
    req,
    overrideAccess: false,
  })
  return { id: doc.id, filename: doc.filename, posterMediaId: posterDoc.id, url: doc.url }
}

/* ------------------------------------------------------------------------ */
/* Our own artwork, into the public media library                           */
/* ------------------------------------------------------------------------ */

export type SiteArtworkArgs = ArtworkMetaArgs & {
  /** The file, base64. Fine for a small file; anything bigger goes through hqStartSiteArtworkUpload. */
  dataBase64: string
}

/**
 * The one-shot way in: the whole file as base64 inside one tool call. It works
 * for a small file, but a model cannot reliably write a 100,000-character
 * argument (a 72 KB drawing is that), so the upload link
 * (`hqStartSiteArtworkUpload`, lib/artworkUpload.ts) is the usual path. The
 * checks and the storing are shared (lib/siteArtwork.ts).
 */
export async function addSiteArtworkFromUpload(req: PayloadRequest, args: SiteArtworkArgs) {
  const meta = checkArtworkMeta(args)
  const { data, type } = decodeUpload(args, ARTWORK_UPLOAD_LIMIT)
  if (type !== 'image/jpeg' && type !== 'image/png') throw new Error('Artwork must be a JPEG or PNG image.')
  return storeSiteArtwork(req.payload, meta, data, { req })
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
    name: 'hqWeeklyReviewContext',
    description:
      'Everything the weekly social review needs, in one call, as JSON: the 28-day hqSocialReport, the current playbook (null until the first review writes it), published events in the next 14 days (Spanish and English titles, dates, slugs, site paths, whether they have an image), the 10 newest published stories, and the social drafts already pending approval. Read-only. Published site content only; no contact details of any kind.',
    parameters: {},
    handler: (_args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify(await weeklyReviewContext(req.payload), null, 2))),
  },
  {
    name: 'hqGrowthContext',
    description:
      'Everything the growth review needs, in one call, as JSON: the goal; the site\u2019s own traffic for 28 days (visits and views, by day, channel, source, referring site, landing page, language, device and place); what is on the site; what shipped (publishes, scheduled posts); intake counts; the experiment ledger; open tasks; and everything hqWeeklyReviewContext returns (social report, playbook, upcoming events, recent stories, pending drafts). Read-only. Published content only; no contact details. Follow web/hq/growth-review.md.',
    parameters: {},
    handler: (_args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify(await growthContext(req.payload), null, 2))),
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
      'Download a public https JPEG, PNG or MP4 (up to 50 MB) into HQ media (a PNG is stored as JPEG, which Instagram requires) and return its id, for the `media` field of an hq-social-drafts document. The first media id on a draft is the cover shown in Telegram. Instagram and TikTok drafts need at least one.',
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
    name: 'hqAddSiteMediaFromUrl',
    description:
      'Import a LICENSED photo of a venue into the public site’s media library, with its credit, and return its id for an event’s `image` (set it with updateEvents and draft: true; it shows on the site only once the owner publishes that event). Only public domain or Creative Commons that allows commercial reuse (no NC, no ND), with attribution. Only direct file URLs on ' +
      SITE_MEDIA_HOSTS.join(', ') +
      ' (Wikimedia Commons, Flickr, Library of Congress, University of Miami Libraries: ask its IIIF server for a size, e.g. …/digital/iiif/chc0218/1449/full/2560,/0/default.jpg), JPEG or PNG, at least 1000 px wide; no redirects. Never Google Maps/Street View, Yelp, news sites or organizer flyers. Read the licence on the description page yourself; check `findMedia` first for a photo already imported. Returns {id, filename, width, height}.',
    parameters: {
      url: z.string().url().describe('Direct https file URL, e.g. https://upload.wikimedia.org/wikipedia/commons/…/File.jpg'),
      altEs: z.string().min(1).max(300).describe('Alt text in Spanish: what the photo shows'),
      altEn: z.string().min(1).max(300).describe('Alt text in English'),
      credit: z.string().min(1).max(CREDIT_MAX).describe('The author as the licence asks to credit them, e.g. "Phillip Pessar" or "Town of Miami Lakes"'),
      license: z.enum(PHOTO_LICENSES).describe('The licence stated on the description page'),
      licenseUrl: z.string().url().optional().describe('The licence deed; filled in from `license` when left out, and must match it'),
      sourceUrl: z.string().url().describe('The description page (commons.wikimedia.org, flickr.com, loc.gov or digitalcollections.library.miami.edu) where the licence is stated'),
      modified: z.boolean().optional().describe('Cropped or edited (default true: the site crops every photo it shows)'),
      focalX: z.number().min(0).max(100).optional().describe('Where crops centre across, 0–100 (default 50)'),
      focalY: z.number().min(0).max(100).optional().describe('Where crops centre down, 0–100 (default 50); e.g. 40 to crop off empty foreground'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify(await addSiteMediaFromUrl(req, args as unknown as SiteMediaArgs)))),
  },
  {
    name: 'hqAddSiteVideo',
    description:
      "Put a story's finished reel on the public site: copies an HQ media MP4 (already uploaded with hqAddDraftMediaFromUpload) into the site's videos, with its cover card (an HQ media JPEG or PNG, 1080×1920, the ¿SABÍAS QUE? / DID YOU KNOW card) as the poster. Returns {id, posterMediaId}: set `id` as the story's `video` in that language with updateStories and draft: true (the Spanish cut on locale es), then hqRequestPublish. Only Flamingo County's own reels and cards; a third party's photo goes through hqAddSiteMediaFromUrl. Each call makes a new copy, so call it once per cut.",
    parameters: {
      hqMediaId: z.union([z.number(), z.string()]).describe('The HQ media id of the MP4'),
      posterHqMediaId: z.union([z.number(), z.string()]).describe('The HQ media id of the cover card image'),
      language: z.enum(['en', 'es']).describe('The language spoken in the video'),
      title: z.string().min(1).max(160).describe('The video title in that language, e.g. "Al Capone en Hialeah"'),
      posterAlt: z.string().min(1).max(300).describe('What the cover card shows, in that language'),
      durationSeconds: z.number().int().min(1).max(3599).optional().describe('Length in seconds'),
      credits: z.string().max(300).optional().describe('Archive credits, as the captions give them'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify(await addSiteVideo(req, args as unknown as SiteVideoArgs)))),
  },
  {
    name: 'hqAddSiteArtworkFromUpload',
    description:
      'Add artwork Flamingo County made itself (a drawn cover or illustration, or our own photo) to the public site’s media library and return its id, for a listing’s `gallery`, a story’s cover or an event’s `image` (set it in a draft; it shows only once the owner publishes). Never a third party’s picture: an archive photo goes through hqAddSiteMediaFromUrl. Send the file as base64 (JPEG or PNG, checked by its real bytes, at least 1000 px wide); it is re-encoded within the site’s 400 KB image budget. Only for a SMALL file: the whole file must fit in this one call, and a 70 KB drawing is already about 95,000 characters. Anything bigger: use hqStartSiteArtworkUpload (a one-time upload link you PUT the file to with curl) instead. The credit is always "Flamingo County" ("Ilustración: Flamingo County" for an illustration), followed by `basedOn`: what it was drawn from, in each language, so that source keeps its credit; "original" for work drawn from nothing. Returns {id, filename, width, height, filesize}.',
    parameters: {
      filename: z.string().min(1).max(120).describe('The file name, e.g. hialeah-park-cover.png'),
      mimeType: z.enum(['image/jpeg', 'image/png']).describe('The type of the file'),
      dataBase64: z.string().min(16).max(35_000_000).describe('The file, base64-encoded (up to 25 MB)'),
      origin: z.enum(ARTWORK_ORIGINS).describe('own-illustration (we drew it) or own-photo (we took it)'),
      altEs: z.string().min(1).max(300).describe('Alt text in Spanish: what the picture shows'),
      altEn: z.string().min(1).max(300).describe('Alt text in English'),
      basedOnEs: z
        .string()
        .min(1)
        .max(160)
        .describe('What it was drawn from, as the Spanish credit says it, e.g. "basada en fotos del Historic American Buildings Survey (dominio público)"; "original" if from nothing'),
      basedOnEn: z
        .string()
        .min(1)
        .max(160)
        .describe('The same in English, e.g. "based on Historic American Buildings Survey photos (public domain)"; "original" if from nothing'),
      focalX: z.number().min(0).max(100).optional().describe('Where crops centre across, 0–100 (default 50)'),
      focalY: z.number().min(0).max(100).optional().describe('Where crops centre down, 0–100 (default 50)'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify(await addSiteArtworkFromUpload(req, args as unknown as SiteArtworkArgs)))),
  },
  {
    name: 'hqStartSiteArtworkUpload',
    description:
      'Step 1 of adding artwork Flamingo County made (a drawn cover, our own photo) to the public site’s media library: the usual way, for a file of any size up to 25 MB. Give the picture’s details (the same rules as hqAddSiteArtworkFromUpload: ours only, alt text and basedOn in both languages; the credit is always "Flamingo County"). Returns {uploadId, uploadUrl, expiresAt, maxBytes, send}. Step 2: send the file from your shell, exactly as `send` shows: curl -sS -X PUT --data-binary @<file> -H \'Content-Type: image/jpeg\' \'<uploadUrl>\'. The answer is {id, filename, width, height, filesize}: set that id on a draft (listing gallery, story cover, event image). The link works once, for 15 minutes; never paste it anywhere else. No shell? Send the file in pieces with hqSiteArtworkUploadChunk, then hqFinishSiteArtworkUpload.',
    parameters: {
      filename: z.string().min(1).max(120).describe('The file name, e.g. hialeah-park-cover.jpg'),
      mimeType: z.enum(['image/jpeg', 'image/png']).describe('The type of the file you will send'),
      origin: z.enum(ARTWORK_ORIGINS).describe('own-illustration (we drew it) or own-photo (we took it)'),
      altEs: z.string().min(1).max(300).describe('Alt text in Spanish: what the picture shows'),
      altEn: z.string().min(1).max(300).describe('Alt text in English'),
      basedOnEs: z
        .string()
        .min(1)
        .max(160)
        .describe('What it was drawn from, as the Spanish credit says it, e.g. "basada en fotos del Historic American Buildings Survey (dominio público)"; "original" if from nothing'),
      basedOnEn: z
        .string()
        .min(1)
        .max(160)
        .describe('The same in English, e.g. "based on Historic American Buildings Survey photos (public domain)"; "original" if from nothing'),
      focalX: z.number().min(0).max(100).optional().describe('Where crops centre across, 0–100 (default 50)'),
      focalY: z.number().min(0).max(100).optional().describe('Where crops centre down, 0–100 (default 50)'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify(await startArtworkUpload(req.payload, args as unknown as ArtworkMetaArgs)))),
  },
  {
    name: 'hqSiteArtworkUploadChunk',
    description:
      'The fallback for a client that cannot run curl: send an upload’s file in pieces. After hqStartSiteArtworkUpload, base64 the file, cut the base64 into pieces of at most ' +
      CHUNK_MAX_CHARS.toLocaleString('en-US') +
      ' characters (cut on a multiple of 4 characters), and send each with its index (from 0), the total count, and the sha256 (hex) of that piece’s DECODED bytes. A piece that does not match its sha256 is refused: resend just that one. Up to 2 MB in all. Then call hqFinishSiteArtworkUpload.',
    parameters: {
      uploadId: z.number().int().positive().describe('From hqStartSiteArtworkUpload'),
      index: z.number().int().min(0).describe('This piece’s position, from 0'),
      total: z.number().int().min(1).max(MAX_CHUNKS).describe('How many pieces in all'),
      dataBase64: z.string().min(1).max(CHUNK_MAX_CHARS).describe('This piece, base64'),
      sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).describe('sha256 hex of this piece’s decoded bytes'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () =>
        text(
          JSON.stringify(
            await addArtworkChunk(req.payload, {
              uploadId: Number(args.uploadId),
              index: Number(args.index),
              total: Number(args.total),
              dataBase64: String(args.dataBase64),
              sha256: String(args.sha256),
            }),
          ),
        ),
      ),
  },
  {
    name: 'hqFinishSiteArtworkUpload',
    description:
      'Where an artwork upload stands: stored (with {id, filename, width, height, filesize}), pending, storing, failed (with the reason) or expired. For a chunked upload with every piece in, this assembles them, checks the whole file against `sha256` when given, and stores the picture.',
    parameters: {
      uploadId: z.number().int().positive().describe('From hqStartSiteArtworkUpload'),
      sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional().describe('Optional: sha256 hex of the whole file, checked after a chunked upload is assembled'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () =>
        text(
          JSON.stringify(
            await finishArtworkUpload(req.payload, {
              uploadId: Number(args.uploadId),
              sha256: (args.sha256 as string | undefined) ?? null,
            }),
          ),
        ),
      ),
  },
  {
    name: 'hqAddDraftMediaFromUpload',
    description:
      "Add a photo or video from the caller's own computer to HQ media and return its id, for the `media` field of an hq-social-drafts document. Use it when the file is not on a public URL, for example a finished video. Send the file as base64 in `dataBase64` and its type in `mimeType`: JPEG, PNG or MP4 (H.264; not .mov), up to 50 MB (about 67 MB of base64). The file is checked by its real bytes. Sending the same file again returns the stored one. Instagram and TikTok drafts need at least one media. Nothing is posted by this tool.",
    parameters: {
      filename: z.string().min(1).max(120).describe('The file name, for example six-inches-en.mp4'),
      mimeType: z.enum(['image/jpeg', 'image/png', 'video/mp4']).describe('The type of the file'),
      dataBase64: z.string().min(16).max(70_000_000).describe('The file, base64-encoded'),
      note: z.string().max(200).optional().describe('Optional note, e.g. what it is'),
    },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () =>
        text(
          JSON.stringify(
            await addMediaFromUpload(req, {
              filename: String(args.filename),
              mimeType: String(args.mimeType),
              dataBase64: String(args.dataBase64),
              note: args.note as string | undefined,
            }),
          ),
        ),
      ),
  },
  {
    name: 'hqCancelDraft',
    description:
      'Cancel a social draft that is scheduled but has not gone out: removes it from the Postiz calendar and marks the draft rejected. A pending draft is just rejected. Refuses a post whose time has passed. Use when the owner says to pull a post.',
    parameters: { id: z.number().int().positive().describe('The hq-social-drafts id') },
    handler: (args: Record<string, unknown>, req: PayloadRequest) =>
      guard(async () => text(JSON.stringify({ result: await cancelDraft(req.payload, Number(args.id)) }))),
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
