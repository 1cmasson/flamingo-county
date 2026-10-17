/**
 * What the site's use counter knows (lib/uses.ts), with no imports so the
 * collection and the browser's trackers can share it.
 */

/** Which part of the site a use happened on. */
export const USE_TOOLS = [
  /** The address tool (/address). */
  'address',
  /** A business page. */
  'listing',
  /** An event page, or an event's card on a list. */
  'event',
  'story',
  /** A free-ride line's page. */
  'route',
  /** The search on the home and city pages. */
  'search',
  /** Anywhere else. */
  'page',
] as const
export type UseTool = (typeof USE_TOOLS)[number]

export const USE_ACTIONS = [
  /** A report was shown for an address. */
  'lookup',
  /** An address link that matched nothing. */
  'not_found',
  /** A calendar file: downloaded (address, server side) or tapped (event). */
  'calendar',
  'print',
  /** In an in-app browser: "Open in Chrome" (Android). */
  'open_chrome',
  /** In an in-app browser: "Copy the link" (iPhone's way out). */
  'copy_link',
  /** The report's map tab. */
  'map',
  /** "Look up another address". */
  'change',
  /** A link inside one of the address report's cards; `section` says which. */
  'link',
  /** A phone number tapped. */
  'call',
  'email',
  /** A Google / Apple Maps or Waze link. */
  'directions',
  /** Any other site: a business's own, tickets, a source. */
  'website',
  /** Instagram, Facebook, TikTok…; `network` says which. */
  'social',
  /** An event's "I'm going" and "save" buttons. */
  'going',
  'save',
  /** Read a story to its last paragraph. */
  'read_end',
  /** A search that found something, and one that found nothing. */
  'search',
  'no_match',
] as const
export type UseAction = (typeof USE_ACTIONS)[number]

/** What can happen where: anything else is refused. */
export const TOOL_ACTIONS: Record<UseTool, readonly UseAction[]> = {
  address: ['lookup', 'not_found', 'calendar', 'print', 'open_chrome', 'copy_link', 'map', 'change', 'link'],
  listing: ['call', 'email', 'directions', 'website', 'social'],
  event: ['going', 'save', 'calendar', 'call', 'email', 'directions', 'website', 'social'],
  story: ['read_end', 'call', 'email', 'directions', 'website', 'social'],
  route: ['call', 'email', 'directions', 'website', 'social'],
  search: ['search', 'no_match'],
  page: ['call', 'email', 'directions', 'website', 'social'],
}

/** The address report's cards, by their heading id on the address page. */
export const USE_SECTIONS = ['trash', 'bus', 'flood', 'reps', 'vote', 'schools', 'near', 'sources'] as const
export type UseSection = (typeof USE_SECTIONS)[number]

/** Where the page was open: a normal browser or one app's built-in one. */
export const USE_BROWSERS = ['browser', 'instagram', 'facebook', 'tiktok', 'other-app'] as const
export type UseBrowser = (typeof USE_BROWSERS)[number]

export const USE_NETWORKS = ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'whatsapp', 'threads'] as const
export type UseNetwork = (typeof USE_NETWORKS)[number]

const NETWORK_HOSTS: [RegExp, UseNetwork][] = [
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|m\.me)$/, 'facebook'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'x'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)(threads\.net|threads\.com)$/, 'threads'],
]

const MAPS = /(^|\.)(maps\.apple\.com|maps\.google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|waze\.com)$/

/**
 * What a tapped link is, from its href alone: a call, an email, directions, a
 * social profile or another website. Links inside the site are null (the page
 * view counts them), and so are /go/ links (counted in hq-clicks).
 */
export function linkKind(
  href: string,
  ownHost: string,
): { action: 'call' | 'email' | 'directions' | 'website' } | { action: 'social'; network: UseNetwork } | null {
  if (/^tel:/i.test(href)) return { action: 'call' }
  if (/^mailto:/i.test(href)) return { action: 'email' }
  let u: URL
  try {
    u = new URL(href, `https://${ownHost}`)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (host === ownHost.toLowerCase().replace(/^www\./, '')) return null
  if (MAPS.test(host) || (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname.startsWith('/maps'))) {
    return { action: 'directions' }
  }
  for (const [re, network] of NETWORK_HOSTS) if (re.test(host)) return { action: 'social', network }
  return { action: 'website' }
}
