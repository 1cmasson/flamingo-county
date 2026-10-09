/**
 * `/go/...` tracking links — how social traffic is counted.
 *
 *   /go/ig                 bio link on Instagram
 *   /go/fb/12              a link in Facebook post (draft) #12
 *   /go/tt?to=/es/events   bio link on TikTok, landing on the events page
 *   /go/ig?to=https://…    a button on the link page (/links?from=ig) to
 *                          another site; only an address that is on the
 *                          published link page is followed (lib/links.ts)
 *
 * The first segment is the source; a short alias for each platform, or any
 * other short slug (`qr`, `flyer`) for offline sources. The optional second
 * segment is a draft id. The visitor lands on `to` — the home page by default
 * — tagged with UTM parameters, so the source also survives into any analytics
 * added later.
 */

const ALIASES: Record<string, string> = {
  ig: 'instagram',
  instagram: 'instagram',
  fb: 'facebook',
  facebook: 'facebook',
  tt: 'tiktok',
  tiktok: 'tiktok',
  // The link page's buttons when the bio named no platform (/links, lib/links.ts).
  bio: 'bio',
}

const SLUG = /^[a-z0-9-]{1,24}$/

/** A usable source name: the first segment of a /go/ link. */
export const isSourceSlug = (s: string) => SLUG.test(s)

export type TrackedLink = { source: string; draftId?: number; location: string }

/**
 * Only a path on this site: it must start with one `/`. `//evil.com` and
 * `/\evil.com` are protocol-relative to a browser, which would make this an
 * open redirect anyone could put in a phishing link.
 */
export function safePath(to: string | null): string {
  if (!to || !to.startsWith('/') || to.startsWith('//') || to.startsWith('/\\')) return '/'
  try {
    // Parsed against a dummy origin: anything that escapes it was not a path.
    const url = new URL(to, 'https://x.invalid')
    return url.origin === 'https://x.invalid' ? url.pathname + url.search : '/'
  } catch {
    return '/'
  }
}

/**
 * `external` is the set of outside addresses this link may send a visitor to:
 * the link page's own (lib/links.ts `externalUrls`). Any other https:// `to`
 * lands on the link page instead.
 */
export function parseTrackedLink(
  segments: string[],
  to: string | null,
  external?: ReadonlySet<string>,
): TrackedLink | null {
  const [rawSource, rawDraft, ...extra] = segments.map((s) => s.toLowerCase())
  if (!rawSource || !SLUG.test(rawSource) || extra.length) return null
  if (rawDraft !== undefined && !/^\d{1,9}$/.test(rawDraft)) return null

  const source = ALIASES[rawSource] ?? rawSource
  const draftId = rawDraft ? Number(rawDraft) : undefined

  if (to && /^https:\/\//i.test(to)) {
    if (external?.has(to)) return { source, draftId, location: to }
    to = '/links'
  }
  const path = safePath(to)
  const url = new URL(path, 'https://x.invalid')
  url.searchParams.set('utm_source', source)
  url.searchParams.set('utm_medium', ALIASES[rawSource] ? 'social' : 'offline')
  url.searchParams.set('utm_campaign', draftId ? `draft-${draftId}` : 'bio')
  return { source, draftId, location: url.pathname + url.search }
}

/**
 * Link-preview fetchers and crawlers. Every post with a link is fetched by
 * Facebook's and others' preview bots the moment it is shared; counting those
 * would credit each post with clicks nobody made.
 */
export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|telegram|discord|slack|skype|curl|wget|python|headless/i.test(
    userAgent,
  )
}
