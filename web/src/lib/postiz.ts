/**
 * The self-hosted Postiz public API — how an approved social draft becomes a
 * scheduled post on Facebook, Instagram and TikTok.
 *
 * `POSTIZ_API_URL` is the public API base *including* `/public/v1`. On the
 * self-hosted instance the backend sits under `/api`, so it is
 * `https://postiz.flamingocounty.com/api/public/v1` — the bare `/public/v1`
 * path is the frontend and redirects to `/auth`. Postiz takes the key raw in
 * `Authorization`, with no `Bearer` prefix.
 *
 * The per-platform settings below come from the instance's own
 * `integrationSchema` (read 2026-09-30), not from the hosted docs:
 * - Instagram requires `post_type` and at least one attachment.
 * - TikTok requires every one of its toggles and an attachment. `DIRECT_POST`
 *   publishes; `UPLOAD` only drops the file in the TikTok app's inbox.
 * - Facebook requires nothing and allows text-only posts.
 */

export const PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const
export type Platform = (typeof PLATFORMS)[number]

/** Platforms that reject a post without a photo or video. */
export const NEEDS_MEDIA: readonly Platform[] = ['instagram', 'tiktok']

/** TikTok caps the title at 90 characters; the caption itself can run to 2000. */
const TIKTOK_TITLE_LIMIT = 90

export type UploadedMedia = { id: string; path: string }

export function postizConfigured(): boolean {
  return Boolean(process.env.POSTIZ_API_URL && process.env.POSTIZ_API_KEY)
}

function settingsFor(platform: Platform, caption: string): Record<string, unknown> {
  switch (platform) {
    case 'instagram':
      return { __type: 'instagram', post_type: 'post' }
    case 'tiktok':
      return {
        __type: 'tiktok',
        title: caption.split('\n')[0].slice(0, TIKTOK_TITLE_LIMIT),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        duet: false,
        stitch: false,
        comment: true,
        autoAddMusic: 'no',
        brand_content_toggle: false,
        brand_organic_toggle: false,
        content_posting_method: 'DIRECT_POST',
      }
    case 'facebook':
      return { __type: 'facebook', post_type: 'post' }
  }
}

/**
 * The `POST /posts` body. Pure, so the shape Postiz receives is testable
 * without a Postiz.
 *
 * A time in the past (or the next minute) goes out as `now` — Postiz would
 * otherwise accept a schedule date that has already passed and leave the post
 * sitting in its calendar unpublished.
 */
export function buildPostBody(args: {
  caption: string
  platforms: Platform[]
  integrations: Partial<Record<Platform, string>>
  media: UploadedMedia[]
  scheduledFor: Date
  now?: Date
}) {
  const now = args.now ?? new Date()
  const immediate = args.scheduledFor.getTime() <= now.getTime() + 60_000

  return {
    type: immediate ? 'now' : 'schedule',
    date: (immediate ? now : args.scheduledFor).toISOString(),
    shortLink: false,
    tags: [],
    posts: args.platforms.map((platform) => {
      const id = args.integrations[platform]
      if (!id) throw new Error(`No connected Postiz channel for ${platform}`)
      return {
        integration: { id },
        value: [{ content: args.caption, image: args.media }],
        settings: settingsFor(platform, args.caption),
      }
    }),
  }
}

async function postiz<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.POSTIZ_API_URL
  const key = process.env.POSTIZ_API_KEY
  if (!base || !key) throw new Error('POSTIZ_API_URL / POSTIZ_API_KEY are not set')

  const res = await fetch(`${base.replace(/\/$/, '')}${pathname}`, {
    ...init,
    headers: { Authorization: key, ...init.headers },
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Postiz ${pathname} → ${res.status}: ${text.slice(0, 300)}`)
  return (text ? JSON.parse(text) : null) as T
}

/**
 * The public API's OpenAPI spec names the platform `identifier`; the Postiz
 * MCP returns the same thing as `platform`, and posts carry it as
 * `providerIdentifier`. Accept all three rather than find out at approval time.
 */
type Integration = {
  id: string
  identifier?: string
  providerIdentifier?: string
  platform?: string
  disabled?: boolean
}

/**
 * Channel ids, looked up rather than hard-coded: reconnecting an account in
 * Postiz mints a new id, and a stale one would fail every approval silently
 * until someone noticed nothing was posting.
 */
export async function connectedChannels(): Promise<Partial<Record<Platform, string>>> {
  const list = await postiz<Integration[]>('/integrations')
  const out: Partial<Record<Platform, string>> = {}
  for (const i of list ?? []) {
    const kind = i.identifier ?? i.providerIdentifier ?? i.platform
    if (i.disabled || !kind) continue
    if ((PLATFORMS as readonly string[]).includes(kind) && !out[kind as Platform]) {
      out[kind as Platform] = i.id
    }
  }
  return out
}

export async function uploadMedia(file: Blob, filename: string): Promise<UploadedMedia> {
  const form = new FormData()
  form.set('file', file, filename)
  const res = await postiz<UploadedMedia>('/upload', { method: 'POST', body: form })
  if (!res?.id || !res?.path) throw new Error('Postiz upload returned no id/path')
  return { id: res.id, path: res.path }
}

export async function createPost(body: ReturnType<typeof buildPostBody>): Promise<unknown> {
  return postiz('/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/* ------------------------------------------------------------------------ */
/* Analytics                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * One metric as Postiz returns it: a daily series plus the change over the
 * window. `total` arrives as a string. Labels differ per platform (checked
 * against the live instance 2026-10-01): Facebook has "Page followers" and
 * "Page Impressions", Instagram "Reach", "Likes", "Saves"…, TikTok
 * "Followers", "Total Likes", "Videos".
 */
export type Metric = {
  label: string
  data?: { total?: string | number; date?: string }[]
  percentageChange?: number | null
}

export type MetricSummary = { latest: number; sum: number }

/**
 * Collapse each series to the two readings that matter. `latest` is right for
 * a running count (followers, total likes); `sum` is right for a daily flow
 * (impressions, reach). Which is which is decided where it is displayed, by
 * `isRunningCount`, so the stored snapshot keeps both.
 *
 * Postiz's own `percentageChange` is deliberately dropped: on the live
 * instance (2026-10-01) it was 5 for every Facebook and Instagram metric and 0
 * for every TikTok one, whatever the data — a placeholder, not a measurement.
 * It stays in the snapshot's `raw`. Real change over time comes from comparing
 * our own daily snapshots.
 */
export function summarizeMetrics(metrics: Metric[] | null | undefined): Record<string, MetricSummary> {
  const out: Record<string, MetricSummary> = {}
  for (const m of metrics ?? []) {
    if (!m?.label) continue
    const values = (m.data ?? []).map((d) => Number(d.total)).filter((n) => Number.isFinite(n))
    out[m.label] = {
      latest: values.length ? values[values.length - 1] : 0,
      sum: values.reduce((a, b) => a + b, 0),
    }
  }
  return out
}

/** Followers, following, total likes, video count: things that accumulate. */
export function isRunningCount(label: string): boolean {
  return /follow|total|videos/i.test(label)
}

/** Channel analytics for the last `days` days. The id is the integration id. */
export function channelAnalytics(integrationId: string, days: number): Promise<Metric[]> {
  return postiz<Metric[]>(`/analytics/${encodeURIComponent(integrationId)}?date=${days}`)
}

/**
 * One published post's analytics. Returns `[]` — not an error — for a post
 * that is unknown, not yet published, or that Postiz could not match to the
 * platform's copy (it happens on TikTok until the release id is linked).
 */
export function postAnalytics(postId: string, days: number): Promise<Metric[]> {
  return postiz<Metric[]>(`/analytics/post/${encodeURIComponent(postId)}?date=${days}`)
}

export type CreatedPost = { platform: Platform; postId: string }

/**
 * Pull the per-channel post ids out of the create-post reply. The hosted docs
 * disagree with each other about its shape (an array of `{ postId,
 * integration }` in one place, a bare message in another), so this reads
 * every shape seen and returns `[]` rather than guessing. The stats job falls
 * back to `findPostIds` when it gets nothing.
 */
export function postIdsFrom(
  response: unknown,
  channels: Partial<Record<Platform, string>>,
): CreatedPost[] {
  const byId = new Map(Object.entries(channels).map(([p, id]) => [id, p as Platform]))
  const items = Array.isArray(response)
    ? response
    : Array.isArray((response as { posts?: unknown })?.posts)
      ? (response as { posts: unknown[] }).posts
      : []
  const out: CreatedPost[] = []
  for (const raw of items) {
    const item = raw as { postId?: string; id?: string; integration?: string | { id?: string } }
    const postId = item?.postId ?? item?.id
    const integration = typeof item?.integration === 'string' ? item.integration : item?.integration?.id
    const platform = integration ? byId.get(integration) : undefined
    if (postId && platform) out.push({ platform, postId: String(postId) })
  }
  return out
}

type ListedPost = { id: string; publishDate?: string; integration?: { id?: string } }

/**
 * Find the ids of posts already scheduled for these channels around `at`, for
 * a draft whose create reply carried none. Matches on channel and publish
 * time within ten minutes — one person posting a handful of times a week will
 * not have two posts on one channel inside that window.
 */
export async function findPostIds(
  channels: Partial<Record<Platform, string>>,
  platforms: Platform[],
  at: Date,
): Promise<CreatedPost[]> {
  const window = 10 * 60_000
  const q = new URLSearchParams({
    startDate: new Date(at.getTime() - window).toISOString(),
    endDate: new Date(at.getTime() + window).toISOString(),
  })
  const res = await postiz<ListedPost[] | { posts?: ListedPost[] }>(`/posts?${q}`)
  const list = Array.isArray(res) ? res : (res?.posts ?? [])
  const out: CreatedPost[] = []
  for (const platform of platforms) {
    const id = channels[platform]
    const match = list.find(
      (p) =>
        p.integration?.id === id &&
        p.publishDate &&
        Math.abs(new Date(p.publishDate).getTime() - at.getTime()) <= window,
    )
    if (match) out.push({ platform, postId: match.id })
  }
  return out
}
