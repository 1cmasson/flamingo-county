import {
  GraphError,
  MAX_PAGES,
  graphGet,
  isInvalidParam,
  readInsights,
  type GraphAccount,
  type InsightRow,
  type Paged,
  type Reading,
} from './metaGraph'

/**
 * The account-level half of Meta's Graph API, read-only: the whole
 * @flamingo.county account and Facebook Page per day, who follows it and when
 * they are online, the comments on our reels, and other professional
 * accounts' public numbers through Business Discovery. lib/graphTelemetry.ts
 * and lib/market.ts decide when to read; this file only knows how. The client
 * (token in the Authorization header only, scrubbed errors, cursor paging,
 * the Flamingo County account filter) is lib/metaGraph.ts.
 *
 * Every name below was checked against Meta's reference on 2026-10-20, v26.0:
 *
 * - Instagram account insights:
 *   https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights
 *   Current, `period=day`, `metric_type=total_value`: `reach`, `views`,
 *   `accounts_engaged`, `total_interactions`, `likes`, `comments`, `shares`,
 *   `saves`, `replies`, `reposts`, plus `follows_and_unfollows` (breakdown
 *   `follow_type`) and `profile_links_taps` (breakdown `contact_button_type`:
 *   BOOK_NOW, CALL, DIRECTION, EMAIL, INSTANT_EXPERIENCE, TEXT, UNDEFINED).
 *   `views` and `comments` are marked "in development".
 *   Demographics, `period=lifetime` with a required `timeframe`:
 *   `follower_demographics` and `engaged_audience_demographics`, broken down
 *   by age, city, country or gender, top 45 values only, and nothing for an
 *   account under 100 followers.
 * - Gone, and not asked for (see `IG_ACCOUNT_REJECTED`): `impressions` (v22,
 *   April 2025), `profile_views`, `website_clicks`, `email_contacts`,
 *   `phone_call_clicks`, `text_message_clicks`, `get_directions_clicks` (v21,
 *   January 2025), `audience_city`/`_country`/`_gender_age`/`_locale` (v18,
 *   December 2023), and `reached_audience_demographics` (no longer in the
 *   v26 table). `engaged_audience_demographics` lost its last_14/30/90_days
 *   and prev_month timeframes in v20. Changelogs:
 *   https://developers.facebook.com/docs/graph-api/changelog/version21.0 ,
 *   https://developers.facebook.com/docs/graph-api/changelog/version22.0 ,
 *   https://developers.facebook.com/documentation/instagram-platform/changelog
 *   No metric replaces website clicks: bio-link taps are counted by our own
 *   /go/ links (hq-clicks) instead.
 * - `follower_count` and `online_followers` are no longer in the v26 metrics
 *   table; the page names them only in its limitations ("not available …
 *   with fewer than 100 followers", online_followers "only available for the
 *   last 30 days"). The follower total is read from the documented
 *   `followers_count` field on the IG User node instead
 *   (https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user).
 *   `online_followers` is still tried weekly; a refusal is recorded, not fatal.
 * - Facebook Page insights, `period=day`:
 *   https://developers.facebook.com/docs/graph-api/reference/insights
 *   `page_follows`, `page_daily_follows_unique`, `page_daily_unfollows_unique`,
 *   `page_media_view`, `page_total_media_view_unique`, `page_post_engagements`,
 *   `page_views_total`, `page_total_actions`. Not asked: `page_impressions*`
 *   ("Deprecated above Graph API v25") and `page_fans` (Page likes, retired in
 *   favour of follows). Meta warns more Page metrics go on June 15, 2026 for
 *   every version; any it refuses is dropped and named on the row.
 * - Comments: GET /{ig-media-id}/comments needs `instagram_manage_comments`
 *   on top of instagram_basic, returns top-level comments only, 50 at most
 *   per page, newest first:
 *   https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments
 * - Business Discovery (GET /{our-ig-id}?fields=business_discovery.username(x){…}),
 *   with instagram_basic, instagram_manage_insights and pages_read_engagement:
 *   https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery
 *   Professional (business or creator) accounts only, never age-gated ones.
 *   Media fields: `like_count` (left out when the owner hides likes),
 *   `comments_count`, and `view_count`, which exists only through Business
 *   Discovery and only for Reels (June 2025), and since April 22, 2026 adds
 *   Facebook views of crossposted reels:
 *   https://developers.facebook.com/docs/instagram-platform/reference/instagram-media
 *   The returned media cannot be read directly, and `media_url` and
 *   `thumbnail_url` are never asked for: we keep counts, captions and links,
 *   not anyone's pictures. The Discovery limit is 1,000 queries per user per
 *   hour since March 30, 2026 (was 240).
 */

/* ------------------------------------------------------------------------ */
/* Instagram: the account, per day                                          */
/* ------------------------------------------------------------------------ */

export const IG_ACCOUNT_DAY_METRICS = [
  'reach',
  'views',
  'accounts_engaged',
  'total_interactions',
  'likes',
  'comments',
  'shares',
  'saves',
  'replies',
  'reposts',
] as const

/**
 * One request each: a `breakdown` applies to every metric in the request, and
 * a metric without it would refuse the whole batch.
 */
export const IG_ACCOUNT_BREAKDOWN_METRICS = [
  { metric: 'follows_and_unfollows', breakdown: 'follow_type' },
  { metric: 'profile_links_taps', breakdown: 'contact_button_type' },
] as const

/** Names that once worked and are gone, with why — so nobody adds them back. */
export const IG_ACCOUNT_REJECTED: Record<string, string> = {
  impressions: 'deprecated in v22.0, gone for every version since 2025-04-21; views replaced it',
  profile_views: 'deprecated in v21.0, gone since 2025-01-08',
  website_clicks: 'deprecated in v21.0, gone since 2025-01-08; no replacement (bio taps are counted by /go/ links)',
  email_contacts: 'deprecated in v21.0; profile_links_taps (EMAIL) replaces it',
  phone_call_clicks: 'deprecated in v21.0; profile_links_taps (CALL) replaces it',
  text_message_clicks: 'deprecated in v21.0; profile_links_taps (TEXT) replaces it',
  get_directions_clicks: 'deprecated in v21.0; profile_links_taps (DIRECTION) replaces it',
  audience_city: 'deprecated in v18.0; follower_demographics (city) replaces it',
  audience_country: 'deprecated in v18.0; follower_demographics (country) replaces it',
  audience_gender_age: 'deprecated in v18.0; follower_demographics (age, gender) replaces it',
  reached_audience_demographics: 'not in the v26.0 metrics table',
  follower_count: 'not in the v26.0 metrics table; the IG User field followers_count is read instead',
}

/**
 * Breakdown rows → flat numbers: `follows_and_unfollows.FOLLOWER`,
 * `profile_links_taps.CALL`. A `timeframe` dimension (demographics carry one)
 * is left out of the key. The total, when Graph sends one, keeps the bare name.
 */
export function parseBreakdownRows(rows: InsightRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows as BreakdownRow[]) {
    const total = row.total_value?.value
    if (typeof total === 'number') out[row.name] = total
    for (const b of row.total_value?.breakdowns ?? []) {
      const keep = (b.dimension_keys ?? []).map((k) => k !== 'timeframe')
      for (const r of b.results ?? []) {
        if (typeof r.value !== 'number') continue
        const dims = (r.dimension_values ?? []).filter((_, i) => keep[i] ?? true)
        if (!dims.length) continue
        const key = `${row.name}.${dims.join('|')}`
        out[key] = (out[key] ?? 0) + r.value
      }
    }
  }
  return out
}

type BreakdownRow = InsightRow & {
  total_value?: {
    value?: unknown
    breakdowns?: { dimension_keys?: string[]; results?: { dimension_values?: string[]; value?: unknown }[] }[]
  }
}

const unix = (d: Date) => String(Math.floor(d.getTime() / 1000))

/** The account's own counts, read now: `followers_count`, `follows_count`, `media_count`. */
export async function igAccountFields(account: GraphAccount, token: string): Promise<Record<string, number>> {
  const res = await graphGet<Record<string, unknown>>(
    `/${account.igUserId}`,
    { fields: 'followers_count,follows_count,media_count' },
    token,
  )
  const out: Record<string, number> = {}
  for (const k of ['followers_count', 'follows_count', 'media_count']) if (typeof res[k] === 'number') out[k] = res[k] as number
  return out
}

/**
 * One day of account insights, `since` to `until`. The plain metrics go in one
 * request (a refused name is found and dropped by `readInsights`), each
 * breakdown metric in its own. A refused breakdown metric is named in
 * `failed`, never fatal. Null when Graph had no rows at all.
 */
export async function igAccountDay(
  account: GraphAccount,
  token: string,
  since: Date,
  until: Date,
  rejected: Set<string>,
): Promise<Reading | null> {
  const base = { period: 'day', metric_type: 'total_value', since: unix(since), until: unix(until) }
  const metrics: Record<string, number> = {}
  const failed: string[] = []
  const raw: InsightRow[] = []

  try {
    const plain = await readInsights(
      async (m) =>
        (await graphGet<{ data?: InsightRow[] }>(`/${account.igUserId}/insights`, { ...base, metric: m.join(',') }, token))
          .data ?? [],
      IG_ACCOUNT_DAY_METRICS,
      rejected,
    )
    if (plain) {
      Object.assign(metrics, plain.metrics)
      failed.push(...plain.failed)
      raw.push(...plain.raw)
    }
  } catch (err) {
    if (!isInvalidParam(err)) throw err
    failed.push(...IG_ACCOUNT_DAY_METRICS)
  }

  for (const { metric, breakdown } of IG_ACCOUNT_BREAKDOWN_METRICS) {
    if (rejected.has(metric)) {
      failed.push(metric)
      continue
    }
    try {
      const rows =
        (
          await graphGet<{ data?: InsightRow[] }>(
            `/${account.igUserId}/insights`,
            { ...base, metric, breakdown },
            token,
          )
        ).data ?? []
      Object.assign(metrics, parseBreakdownRows(rows))
      raw.push(...rows)
    } catch (err) {
      if (!isInvalidParam(err)) throw err
      rejected.add(metric)
      failed.push(metric)
    }
  }

  if (!raw.length) return null
  return { metrics, retention: null, failed, raw }
}

/* ------------------------------------------------------------------------ */
/* Instagram: who follows, and when they are online                          */
/* ------------------------------------------------------------------------ */

export const DEMOGRAPHIC_BREAKDOWNS = ['city', 'country', 'age', 'gender'] as const
export type DemographicBreakdown = (typeof DEMOGRAPHIC_BREAKDOWNS)[number]

/**
 * The timeframes to try, in order. Followers are a snapshot, so the widest
 * window that still answers is the one wanted; the engaged audience lost its
 * longer windows in v20 and keeps only this_week and this_month.
 */
export const DEMOGRAPHIC_METRICS = {
  follower_demographics: ['last_30_days', 'this_month'],
  engaged_audience_demographics: ['this_month', 'this_week'],
} as const
export type DemographicMetric = keyof typeof DEMOGRAPHIC_METRICS

export type Demographics = {
  /** The timeframe that answered, or null when none did. */
  timeframe: string | null
  /** `{ city: { "Hialeah, Florida": 120, … }, age: { "25-34": 80, … }, … }` */
  by: Partial<Record<DemographicBreakdown, Record<string, number>>>
  /** `follower_demographics.city` and the like, when Graph refused every timeframe. */
  failed: string[]
  raw: InsightRow[]
}

/** One demographic metric, by every breakdown: one request each. */
export async function igDemographics(account: GraphAccount, token: string, metric: DemographicMetric): Promise<Demographics> {
  const out: Demographics = { timeframe: null, by: {}, failed: [], raw: [] }
  const timeframes: readonly string[] = DEMOGRAPHIC_METRICS[metric]
  for (const breakdown of DEMOGRAPHIC_BREAKDOWNS) {
    // Once one timeframe answers, the rest of the breakdowns use it.
    const tries = out.timeframe ? [out.timeframe] : timeframes
    let done = false
    for (const timeframe of tries) {
      try {
        const rows =
          (
            await graphGet<{ data?: InsightRow[] }>(
              `/${account.igUserId}/insights`,
              { metric, period: 'lifetime', metric_type: 'total_value', timeframe, breakdown },
              token,
            )
          ).data ?? []
        out.timeframe = timeframe
        out.raw.push(...rows)
        const flat = parseBreakdownRows(rows)
        const prefix = `${metric}.`
        out.by[breakdown] = Object.fromEntries(
          Object.entries(flat)
            .filter(([k]) => k.startsWith(prefix))
            .map(([k, v]) => [k.slice(prefix.length), v]),
        )
        done = true
        break
      } catch (err) {
        if (!isInvalidParam(err)) throw err
      }
    }
    if (!done) out.failed.push(`${metric}.${breakdown}`)
  }
  return out
}

/**
 * `online_followers` for `since`–`until` (at most the last 30 days): one value
 * per reporting day, `{ "0": n, …, "23": n }`. Throws GraphError 100 if the
 * metric is gone or the account is under 100 followers.
 */
export async function igOnlineFollowers(account: GraphAccount, token: string, since: Date, until: Date): Promise<InsightRow[]> {
  return (
    (
      await graphGet<{ data?: InsightRow[] }>(
        `/${account.igUserId}/insights`,
        { metric: 'online_followers', period: 'lifetime', since: unix(since), until: unix(until) },
        token,
      )
    ).data ?? []
  )
}

/* ------------------------------------------------------------------------ */
/* Facebook: the Page, per day                                               */
/* ------------------------------------------------------------------------ */

export const FB_PAGE_DAY_METRICS = [
  'page_follows',
  'page_daily_follows_unique',
  'page_daily_unfollows_unique',
  'page_media_view',
  'page_total_media_view_unique',
  'page_post_engagements',
  'page_views_total',
  'page_total_actions',
] as const

/**
 * The Page's numbers for the Miami day `dayStart`–`dayEnd`. Page days are
 * Meta's own: they end at 07:00 UTC (Pacific midnight), three hours after a
 * Miami day ends. So the Page day that best matches Miami day D is the one
 * whose `end_time` falls just after D's end — 21 of its 24 hours are D's.
 * The request runs a day past `dayEnd` so that value is in range, and only
 * the value ending within 12 hours after `dayEnd` is kept, by its time, never
 * by position. A metric with no such value yet is left out (asked next run).
 */
export async function fbPageDay(
  account: GraphAccount,
  userToken: string,
  dayStart: Date,
  dayEnd: Date,
  rejected: Set<string>,
): Promise<Reading | null> {
  const token = account.pageToken ?? userToken
  const from = dayEnd.getTime()
  const to = from + 12 * 60 * 60 * 1000
  return readInsights(
    async (metrics) => {
      const rows =
        (
          await graphGet<{ data?: InsightRow[] }>(
            `/${account.pageId}/insights`,
            {
              metric: metrics.join(','),
              period: 'day',
              since: unix(dayStart),
              until: unix(new Date(from + 24 * 60 * 60 * 1000)),
            },
            token,
            [token, userToken],
          )
        ).data ?? []
      return rows
        .map((r) => ({
          ...r,
          values: ((r.values ?? []) as { value?: unknown; end_time?: string }[]).filter((v) => {
            const t = v.end_time ? Date.parse(v.end_time) : NaN
            return t > from && t <= to
          }),
        }))
        .filter((r) => r.values.length)
    },
    FB_PAGE_DAY_METRICS,
    rejected,
  )
}

/* ------------------------------------------------------------------------ */
/* Comments on our own reels                                                 */
/* ------------------------------------------------------------------------ */

export type IgComment = { id: string; text?: string; timestamp?: string; like_count?: number; username?: string }

const COMMENT_FIELDS = 'id,text,timestamp,like_count,username'
const COMMENT_FIELDS_BASIC = 'id,text,timestamp'

/**
 * Top-level comments on one of our media, newest first, up to five pages of
 * 50. `username` is asked for only so the caller can tell our own comments
 * from other people's; it is not meant to be stored (lib/graphTelemetry.ts).
 * Throws GraphError (a permission code) when the token lacks
 * instagram_manage_comments.
 */
export async function listIgComments(mediaId: string, token: string): Promise<IgComment[]> {
  const read = async (fields: string) => {
    const out: IgComment[] = []
    let after: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const params: Record<string, string> = { fields, limit: '50' }
      if (after) params.after = after
      const res = await graphGet<Paged<IgComment>>(`/${mediaId}/comments`, params, token)
      out.push(...(res.data ?? []))
      after = res.paging?.cursors?.after
      if (!after || !res.data?.length) break
    }
    return out
  }
  try {
    return await read(COMMENT_FIELDS)
  } catch (err) {
    if (!isInvalidParam(err)) throw err
    return read(COMMENT_FIELDS_BASIC)
  }
}

/* ------------------------------------------------------------------------ */
/* Business Discovery                                                        */
/* ------------------------------------------------------------------------ */

/** Instagram's own rule for a username: letters, digits, dots and underscores, 30 at most. */
export const IG_USERNAME = /^[a-z0-9._]{1,30}$/

export type BdMedia = {
  id: string
  caption?: string
  timestamp: string
  media_type?: string
  media_product_type?: string
  permalink?: string
  like_count?: number
  comments_count?: number
  view_count?: number
}

export type BdAccount = {
  id: string
  username?: string
  followers_count?: number
  media_count?: number
  media: BdMedia[]
  /** True when Graph refused `view_count` and the media were read without it. */
  viewsRefused: boolean
}

const BD_MEDIA_FIELDS = 'id,caption,timestamp,media_type,media_product_type,permalink,like_count,comments_count'

/** Thrown when the account answers but one of our media fields is refused: our query, not their account. */
export const BD_FIELD_REFUSED = 'bd_field_refused'

/**
 * Another professional account's public numbers and its latest `limit` media,
 * in one request. Account fields are the ones the IG User reference marks
 * Public (`username`, `followers_count`, `media_count`). `username` must
 * already pass `IG_USERNAME`: it goes inside the `fields` string, so anything
 * else could rewrite the query.
 *
 * If Graph refuses the request with error 100, it is asked again without
 * `view_count`; if that is refused too, once more with the account's id,
 * username and followers only. When that last one answers, the account is
 * fine and a media field is the problem: the error says so
 * (`BD_FIELD_REFUSED` in its message) rather than blaming the account.
 */
export async function businessDiscovery(
  account: GraphAccount,
  token: string,
  username: string,
  limit = 25,
): Promise<BdAccount> {
  if (!IG_USERNAME.test(username)) throw new GraphError(`not an Instagram username: ${JSON.stringify(username)}`, 400, 100)
  type Reply = { business_discovery?: Omit<BdAccount, 'media' | 'viewsRefused'> & { media?: { data?: BdMedia[] } } }
  const get = (inner: string) =>
    graphGet<Reply>(`/${account.igUserId}`, { fields: `business_discovery.username(${username}){${inner}}` }, token)
  const ask = (mediaFields: string) => get(`id,username,followers_count,media_count,media.limit(${limit}){${mediaFields}}`)
  let viewsRefused = false
  let res: Reply
  try {
    res = await ask(`${BD_MEDIA_FIELDS},view_count`)
  } catch (err) {
    if (!isInvalidParam(err)) throw err
    viewsRefused = true
    try {
      res = await ask(BD_MEDIA_FIELDS)
    } catch (again) {
      if (!isInvalidParam(again)) throw again
      await get('id,username,followers_count') // throws the account's own error, if it is the account
      throw new GraphError(`${BD_FIELD_REFUSED}: the account answers, but Graph refused a media field (${(again as Error).message})`, 400, 100)
    }
  }
  const bd = res.business_discovery
  if (!bd) throw new GraphError(`no business_discovery for ${username}`, 404, 110)
  const { media, ...rest } = bd
  return { ...rest, media: media?.data ?? [], viewsRefused }
}

/**
 * Business Discovery refusing one username because of the account, not us:
 * a personal account, an age-gated one, or none by that name. Meta does not
 * document the error (its Instagram error table has no row for it); in
 * practice it is code 110 "Invalid user id". Only 110 counts: a 100 is also
 * what a bad field name gets, and blaming every account for our query would
 * park the whole watchlist for a week. A 100 is kept as an `error`, retried
 * daily, with its code on the watchlist row.
 */
export const isNotProfessional = (err: unknown) => err instanceof GraphError && err.code === 110
