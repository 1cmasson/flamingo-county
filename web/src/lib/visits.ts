import type { Payload } from 'payload'

import { isBot } from './tracking'

/**
 * The site's own visit counter — the traffic half of the growth review
 * (web/hq/growth-review.md). `components/Pageview.tsx` beacons each page view
 * to `/api/view`, and that route writes one `hq-visits` row through
 * `recordVisit` below.
 *
 * Nothing identifying is kept: no IP, no user agent, no cookie, no visitor id.
 * A row is a path, where the visit came from (a source name and the referring
 * host, never the full referrer URL), whether it was the first page of the
 * visit, a coarse device class and Cloudflare's location headers. That is
 * enough to answer "how many people came, from where, to which page" and
 * nothing more.
 *
 * Not counted: crawlers and link previews (`isBot`), headless and audit
 * browsers, and anyone signed in to the Payload admin — the owner checking
 * the site from their own phone would otherwise be most of the traffic.
 */

export type VisitInput = {
  path: string
  /** Referring hostname, only on the first page of a visit, never our own. */
  ref?: string | null
  /** `utm_source` from the landing URL (the /go/ links set it). */
  utm?: string | null
  /** First page of this visit: arrived from outside the site, or typed in. */
  entry: boolean
}

const MAX_PATH = 200

/** A site path, without query or hash; null for anything that isn't one. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null
  let path: string
  try {
    path = new URL(raw, 'https://x.invalid').pathname
  } catch {
    return null
  }
  if (path.length > 1) path = path.replace(/\/+$/, '')
  return path.length > MAX_PATH ? null : path
}

const HOST = /^[a-z0-9.-]{1,253}$/

/** A bare lowercase hostname, without `www.`; null otherwise. */
export function normalizeHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const host = raw.trim().toLowerCase().replace(/^www\./, '')
  return HOST.test(host) && host.includes('.') ? host : null
}

/**
 * Known referrers, by hostname. Order matters: `gemini.google.com` must be
 * matched before `google.`, and `l.facebook.com` (Facebook's link shim) is
 * still Facebook.
 */
const SOURCES: [RegExp, string][] = [
  [/(^|\.)gemini\.google\.com$/, 'gemini'],
  [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'chatgpt'],
  [/(^|\.)perplexity\.ai$/, 'perplexity'],
  [/(^|\.)claude\.ai$/, 'claude'],
  [/(^|\.)copilot\.microsoft\.com$/, 'copilot'],
  [/(^|\.)google\.[a-z.]+$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yahoo\.[a-z.]+$/, 'yahoo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(threads\.net|threads\.com)$/, 'threads'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)nextdoor\.com$/, 'nextdoor'],
  [/(^|\.)youtube\.com$/, 'youtube'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
]

export type Channel = 'search' | 'ai' | 'social' | 'referral' | 'campaign' | 'direct'

const CHANNEL: Record<string, Channel> = {
  google: 'search',
  bing: 'search',
  duckduckgo: 'search',
  yahoo: 'search',
  ecosia: 'search',
  chatgpt: 'ai',
  perplexity: 'ai',
  claude: 'ai',
  gemini: 'ai',
  copilot: 'ai',
  facebook: 'social',
  instagram: 'social',
  tiktok: 'social',
  threads: 'social',
  x: 'social',
  reddit: 'social',
  whatsapp: 'social',
  nextdoor: 'social',
  youtube: 'social',
  linkedin: 'social',
}

/** Which channel a stored `source` belongs to. */
export function channelOf(source: string): Channel {
  if (source === 'direct') return 'direct'
  if (CHANNEL[source]) return CHANNEL[source]
  // A hostname we don't know is a link from another site: a backlink.
  return source.includes('.') ? 'referral' : 'campaign'
}

const UTM = /^[a-z0-9._-]{1,32}$/

/**
 * Where a visit came from, as one short name. `utm_source` wins over the
 * referrer: the /go/ links set it, and Instagram and TikTok's in-app browsers
 * often send no referrer at all. A known site becomes its name (`google`,
 * `facebook`); an unknown one stays its hostname, so links from partners'
 * own websites show up by name; no referrer at all is `direct`.
 */
export function classifySource(ref: string | null, utm: string | null): string {
  const tag = utm?.trim().toLowerCase()
  if (tag && UTM.test(tag)) {
    for (const [re, name] of SOURCES) if (re.test(tag)) return name
    // The /go/ aliases and offline tags (`qr`, `flyer`).
    if (tag === 'fb') return 'facebook'
    if (tag === 'ig') return 'instagram'
    if (tag === 'tt') return 'tiktok'
    return tag
  }
  if (!ref) return 'direct'
  for (const [re, name] of SOURCES) if (re.test(ref)) return name
  return ref
}

/** Phones and tablets vs everything else; nothing finer is kept. */
export function deviceOf(userAgent: string | null): 'mobile' | 'desktop' {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent ?? '') ? 'mobile' : 'desktop'
}

/** Audit and automation browsers that `isBot` doesn't name. */
const AUDIT = /lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|playwright|puppeteer|selenium/i

/** Signed in to the Payload admin: Payload's auth cookie. */
const STAFF_COOKIE = /(?:^|;\s*)payload-token=/

export function shouldCount(headers: Headers): boolean {
  const ua = headers.get('user-agent')
  if (isBot(ua) || AUDIT.test(ua ?? '')) return false
  if (STAFF_COOKIE.test(headers.get('cookie') ?? '')) return false
  // A browser's beacon from our own page says same-origin. A form or script
  // on another site posting here says cross-site; refuse it. Older browsers
  // send nothing, and are let through.
  const site = headers.get('sec-fetch-site')
  return !site || site === 'same-origin'
}

/**
 * At most this many rows a minute, whatever arrives. Far above real traffic
 * for now; it only bounds how fast someone could fill the table on purpose.
 */
const PER_MINUTE = 240
let windowStart = 0
let inWindow = 0

export function resetVisitLimit() {
  windowStart = 0
  inWindow = 0
}

function underLimit(now: number): boolean {
  if (now - windowStart >= 60_000) {
    windowStart = now
    inWindow = 0
  }
  inWindow += 1
  return inWindow <= PER_MINUTE
}

/**
 * Store one page view. Never throws: a visitor's page must not care whether
 * the count worked. Returns whether a row was written.
 */
export async function recordVisit(
  payload: Payload,
  input: VisitInput,
  headers: Headers,
  now: number = Date.now(),
): Promise<boolean> {
  const path = normalizePath(input.path)
  if (!path || path.startsWith('/admin') || path.startsWith('/api')) return false
  if (!shouldCount(headers) || !underLimit(now)) return false

  const ref = input.entry ? normalizeHost(input.ref) : null
  const own = normalizeHost(headers.get('x-forwarded-host') ?? headers.get('host'))
  const external = ref && ref !== own ? ref : null
  const lang = path.split('/')[1]

  try {
    await payload.create({
      collection: 'hq-visits',
      data: {
        path,
        lang: lang === 'es' || lang === 'en' ? lang : undefined,
        entry: Boolean(input.entry),
        // Only an entry has a source: later pages of a visit came from the site.
        source: input.entry ? classifySource(external, input.utm ?? null) : undefined,
        refHost: external ?? undefined,
        device: deviceOf(headers.get('user-agent')),
        // Cloudflare's headers. Region and city need "Add visitor location
        // headers" (Rules → Transform Rules → Managed Transforms) turned on.
        country: headers.get('cf-ipcountry')?.slice(0, 2) || undefined,
        region: headers.get('cf-region-code')?.slice(0, 8) || undefined,
        city: headers.get('cf-ipcity')?.slice(0, 64) || undefined,
      },
      overrideAccess: true,
      depth: 0,
    })
    return true
  } catch (err) {
    console.error('[hq] visit not recorded:', err instanceof Error ? err.message : err)
    return false
  }
}
