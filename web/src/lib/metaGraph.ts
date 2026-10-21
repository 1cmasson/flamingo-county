/**
 * Meta's Graph API, read-only, for reel numbers Postiz cannot give: watch
 * time, skip rate, the retention curve, and readings in the first hours.
 * lib/reelStats.ts decides when to read; this file only knows how.
 *
 * Off unless `META_GRAPH_TOKEN` is set: every entry point checks
 * `graphConfigured()` first, and without it nothing is fetched. The token is
 * a never-expiring System User token with instagram_basic,
 * instagram_manage_insights, pages_show_list, pages_read_engagement and
 * read_insights, assigned to the Flamingo County Page and @flamingo.county
 * only. The same Meta login also owns other Pages (Club de la Amistad), so the
 * account is found by name from the token and anything else is refused — see
 * `pickFlamingoAccount` — rather than trusting whatever /me/accounts lists.
 *
 * The token never leaves this file except in the Authorization header. Graph
 * accepts `?access_token=`, but a URL ends up in logs and error messages, and
 * Graph's own `paging.next` links carry the token in their query string — so
 * paging is rebuilt from `paging.cursors.after` instead, and a `next` link is
 * never followed, logged or stored. The Page token /me/accounts returns is
 * held in memory for the run and never saved either.
 *
 * Metric names were checked against Meta's reference on 2026-10-20 (v26.0):
 * - Instagram media insights, REELS:
 *   https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
 *   `plays`, `clips_replays_count` and `ig_reels_aggregated_all_plays_count`
 *   are gone since v22.0 (April 2025) — `views` replaced them:
 *   https://developers.facebook.com/docs/graph-api/changelog/version22.0
 *   The reference gives no unit for `ig_reels_avg_watch_time` or
 *   `ig_reels_video_view_total_time`. They are read as milliseconds (what the
 *   API has answered in practice, and the unit Facebook's own reel metrics
 *   document); confirm against the first live reading of a reel whose length
 *   is known. Meta also says these numbers can lag up to 48 hours, so a 1h
 *   reading is a first look, not a final count.
 * - Facebook reels:
 *   https://developers.facebook.com/docs/graph-api/reference/video/video_insights/
 *   (all lifetime; `post_video_avg_time_watched` and `post_video_view_time`
 *   in milliseconds). Listing a Page's reels is a GET on /{page-id}/video_reels
 *   per https://developers.facebook.com/docs/video-api/guides/reels-publishing
 *   — the edge's reference page says reading is unsupported, so Facebook is
 *   best effort: if it fails, Instagram is still measured.
 *
 * A metric Graph rejects for this account (error 100) is dropped and named on
 * the saved row, not allowed to sink the whole reading: see `readInsights`.
 */

/** Pinned so a Meta default-version bump cannot change metric names under us. */
export const GRAPH_VERSION = 'v26.0'
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

/** The only Page and Instagram account this code will read. */
export const FLAMINGO_PAGE_NAME = 'flamingo county'
export const FLAMINGO_IG_USERNAME = 'flamingo.county'

export const IG_REEL_METRICS = [
  'views',
  'reach',
  'likes',
  'comments',
  'shares',
  'saved',
  'total_interactions',
  'ig_reels_avg_watch_time',
  'ig_reels_video_view_total_time',
  'reels_skip_rate',
] as const

export const FB_REEL_METRICS = [
  'blue_reels_play_count',
  'fb_reels_total_plays',
  'fb_reels_replay_count',
  'post_impressions_unique',
  'post_video_avg_time_watched',
  'post_video_view_time',
  'post_video_retention_graph',
  'post_video_social_actions',
  'post_video_followers',
  'post_video_likes_by_reaction_type',
] as const

export function graphConfigured(): boolean {
  return Boolean(process.env.META_GRAPH_TOKEN?.trim())
}

/** Graph's error, without the URL (which could carry a token) and with any token scrubbed. */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'GraphError'
  }
}

/** Error 100 is "invalid parameter": for insights, a metric this media or account does not have. */
const isInvalidParam = (err: unknown) => err instanceof GraphError && err.code === 100

function scrub(message: string, tokens: string[]): string {
  let out = message
  for (const t of tokens) if (t) out = out.split(t).join('[token]')
  return out
}

/**
 * One GET. `secrets` are every token in play, scrubbed from anything Graph
 * echoes back before it becomes an error message.
 */
async function graphGet<T>(path: string, params: Record<string, string>, token: string, secrets: string[] = [token]): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null
  if (!res.ok || !body || body.error) {
    const message = scrub(body?.error?.message ?? `HTTP ${res.status}`, secrets)
    throw new GraphError(`Graph ${path.split('/').slice(0, 3).join('/')}: ${message}`, res.status, body?.error?.code)
  }
  return body as T
}

type Paged<T> = { data?: T[]; paging?: { cursors?: { after?: string } } }

/* ------------------------------------------------------------------------ */
/* The account                                                              */
/* ------------------------------------------------------------------------ */

export type MeAccount = {
  id: string
  name?: string
  access_token?: string
  instagram_business_account?: { id: string; username?: string }
}

export type GraphAccount = {
  pageId: string
  pageName: string
  /** For Page and video reads. In memory only. */
  pageToken: string | null
  igUserId: string
  igUsername: string
}

/**
 * The Flamingo County Page with @flamingo.county attached, or null. Both have
 * to hold: the Instagram username exactly (the dotless `flamingocounty` is
 * someone else's), and a Page name containing "Flamingo County". Zero matches
 * or more than one is null — reading the wrong account's numbers into HQ is
 * worse than reading none.
 */
export function pickFlamingoAccount(pages: MeAccount[]): GraphAccount | null {
  const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const ours = pages.filter(
    (p) =>
      norm(p.instagram_business_account?.username) === FLAMINGO_IG_USERNAME &&
      norm(p.name).includes(FLAMINGO_PAGE_NAME),
  )
  if (ours.length !== 1) return null
  const p = ours[0]
  return {
    pageId: p.id,
    pageName: p.name ?? '',
    pageToken: p.access_token ?? null,
    igUserId: p.instagram_business_account!.id,
    igUsername: p.instagram_business_account!.username!,
  }
}

const MAX_PAGES = 5

/** Find the account from the token itself (/me/accounts). */
export async function discoverAccount(token: string): Promise<GraphAccount | null> {
  const pages: MeAccount[] = []
  let after: string | undefined
  for (let i = 0; i < MAX_PAGES; i++) {
    const params: Record<string, string> = {
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      limit: '25',
    }
    if (after) params.after = after
    const res = await graphGet<Paged<MeAccount>>('/me/accounts', params, token)
    pages.push(...(res.data ?? []))
    after = res.paging?.cursors?.after
    if (!after || !res.data?.length) break
  }
  return pickFlamingoAccount(pages)
}

/* ------------------------------------------------------------------------ */
/* Insights, with metrics that may be refused                               */
/* ------------------------------------------------------------------------ */

export type InsightRow = {
  name: string
  values?: { value?: unknown }[]
  total_value?: { value?: unknown }
}

export type Reading = {
  /** Plain numbers, by Meta's metric name. An object of numbers is flattened: `post_video_social_actions.share`. */
  metrics: Record<string, number>
  /** The retention curve as received: `{ "0": 1, "1": 0.93, … }`, share of plays still watching at each segment. */
  retention: unknown
  /** Metrics Graph refused for this account, so not asked again this run. */
  failed: string[]
  raw: InsightRow[]
}

/** Graph's insight rows → numbers. */
export function parseInsightRows(rows: InsightRow[]): Pick<Reading, 'metrics' | 'retention'> {
  const metrics: Record<string, number> = {}
  let retention: unknown = null
  for (const row of rows) {
    const v = row.values?.[0]?.value ?? row.total_value?.value
    if (row.name.endsWith('retention_graph')) {
      retention = v ?? null
    } else if (typeof v === 'number') {
      metrics[row.name] = v
    } else if (v && typeof v === 'object') {
      for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
        if (typeof n === 'number') metrics[`${row.name}.${k}`] = n
      }
    }
  }
  return { metrics, retention }
}

/**
 * Ask for every wanted metric at once; if Graph refuses the batch with error
 * 100 (one bad name sinks the whole request), ask for each alone and keep the
 * ones that answer. A metric refused alone goes into `rejected`, the run's
 * shared set, so the next reel does not pay for the same discovery — unless
 * every metric was refused, which says something about this media (too old,
 * posted before the account went professional), not about the metrics, and
 * must not blind the rest of the run.
 *
 * Returns null when Graph answers with no rows: not ready yet, ask next run.
 * A zero is a real reading and is kept.
 */
export async function readInsights(
  fetchRows: (metrics: string[]) => Promise<InsightRow[]>,
  wanted: readonly string[],
  rejected: Set<string>,
): Promise<Reading | null> {
  const ask = wanted.filter((m) => !rejected.has(m))
  if (!ask.length) return null
  let rows: InsightRow[]
  const failed: string[] = wanted.filter((m) => rejected.has(m))
  try {
    rows = await fetchRows(ask)
  } catch (err) {
    if (!isInvalidParam(err)) throw err
    rows = []
    const refused: string[] = []
    for (const m of ask) {
      try {
        rows.push(...(await fetchRows([m])))
      } catch (e) {
        if (!isInvalidParam(e)) throw e
        refused.push(m)
      }
    }
    if (refused.length === ask.length) throw err
    for (const m of refused) rejected.add(m)
    failed.push(...refused)
  }
  if (!rows.length) return null
  return { ...parseInsightRows(rows), failed, raw: rows }
}

/* ------------------------------------------------------------------------ */
/* Instagram                                                                */
/* ------------------------------------------------------------------------ */

export type IgMedia = {
  id: string
  caption?: string
  media_type?: string
  media_product_type?: string
  permalink?: string
  timestamp: string
}

/** The account's reels published since `since`, newest first. */
export async function listIgReels(account: GraphAccount, since: Date, token: string): Promise<IgMedia[]> {
  const out: IgMedia[] = []
  let after: string | undefined
  for (let i = 0; i < MAX_PAGES; i++) {
    const params: Record<string, string> = {
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp',
      limit: '50',
    }
    if (after) params.after = after
    const res = await graphGet<Paged<IgMedia>>(`/${account.igUserId}/media`, params, token)
    const data = res.data ?? []
    out.push(...data)
    after = res.paging?.cursors?.after
    const oldest = data.at(-1)?.timestamp
    if (!after || !data.length || (oldest && new Date(oldest) < since)) break
  }
  return out.filter((m) => m.media_product_type === 'REELS' && new Date(m.timestamp) >= since)
}

export function igReelInsights(mediaId: string, token: string, rejected: Set<string>): Promise<Reading | null> {
  return readInsights(
    async (metrics) =>
      (await graphGet<{ data?: InsightRow[] }>(`/${mediaId}/insights`, { metric: metrics.join(',') }, token)).data ?? [],
    IG_REEL_METRICS,
    rejected,
  )
}

/* ------------------------------------------------------------------------ */
/* Facebook                                                                 */
/* ------------------------------------------------------------------------ */

export type FbReel = {
  id: string
  description?: string
  created_time?: string
  updated_time?: string
  permalink_url?: string
  /** Seconds, when Graph returns it. */
  length?: number
}

const FB_REEL_FIELDS = 'id,description,created_time,updated_time,permalink_url,length'
const FB_REEL_FIELDS_BASIC = 'id,description,created_time,updated_time'

/**
 * The Page's reels since `since`. `length` and `permalink_url` are asked for
 * but not documented on this edge; if Graph refuses them, the basic fields
 * are asked for instead.
 */
export async function listFbReels(account: GraphAccount, since: Date, userToken: string): Promise<FbReel[]> {
  const token = account.pageToken ?? userToken
  const secrets = [token, userToken]
  const read = async (fields: string) => {
    const out: FbReel[] = []
    let after: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const params: Record<string, string> = {
        fields,
        since: String(Math.floor(since.getTime() / 1000)),
        limit: '25',
      }
      if (after) params.after = after
      const res = await graphGet<Paged<FbReel>>(`/${account.pageId}/video_reels`, params, token, secrets)
      out.push(...(res.data ?? []))
      after = res.paging?.cursors?.after
      if (!after || !res.data?.length) break
    }
    return out
  }
  let reels: FbReel[]
  try {
    reels = await read(FB_REEL_FIELDS)
  } catch (err) {
    if (!isInvalidParam(err)) throw err
    reels = await read(FB_REEL_FIELDS_BASIC)
  }
  return reels.filter((r) => r.created_time && new Date(r.created_time) >= since)
}

export function fbReelInsights(
  videoId: string,
  account: GraphAccount,
  userToken: string,
  rejected: Set<string>,
): Promise<Reading | null> {
  const token = account.pageToken ?? userToken
  return readInsights(
    async (metrics) =>
      (
        await graphGet<{ data?: InsightRow[] }>(
          `/${videoId}/video_insights`,
          { metric: metrics.join(',') },
          token,
          [token, userToken],
        )
      ).data ?? [],
    FB_REEL_METRICS,
    rejected,
  )
}
