import type { Payload } from 'payload'

import { UNINCORPORATED } from './civicSync'
import { CITY_MAYORS } from './mayors'
import { PUBLISHED } from '../fields/shared'
import { fold } from './search'
import { ROUTE_SLUGS } from './transit'
import { deviceOf, normalizePath, shouldCount } from './visits'
import { detectWebview } from './webview'
import {
  TOOL_ACTIONS,
  USE_ACTIONS,
  USE_BROWSERS,
  USE_NETWORKS,
  USE_SECTIONS,
  USE_TOOLS,
  type UseAction,
  type UseBrowser,
  type UseNetwork,
  type UseSection,
  type UseTool,
} from './useKinds'

export { USE_ACTIONS, USE_BROWSERS, USE_NETWORKS, USE_SECTIONS, USE_TOOLS, type UseAction, type UseBrowser, type UseSection, type UseTool }

/**
 * What people do on the site, the counter's other half: `hq-visits` says
 * which pages people open, this says what they did there. On the address
 * tool: looked an address up, added the trash days to their calendar, got
 * stuck in Instagram's browser and copied the link out. On a business: called,
 * asked for directions, opened its website or Instagram. On an event: going,
 * saved, calendar. A story read to the end; a search and whether it found
 * anything; taps out of the site from anywhere else. One `hq-uses` row each.
 *
 * The same rules as the visit counter (lib/visits.ts): no IP, no user agent,
 * no cookie, no visitor id, and never an address: only its municipality
 * ("HIALEAH"), so two actions can never be tied to a person or a house.
 * What a row is about is a public page (a business, event or story slug, a
 * free-ride line), checked against the site before it is stored, and a search
 * is kept as typed only when it is one of the site's own words. Bots, staff,
 * the owner's devices and other sites' posts are not counted (`shouldCount`).
 *
 * The browser sends most rows through `/api/use` (components/UseTracker.tsx,
 * one listener for the whole site); the address tool's calendar download is
 * counted where the file is served (api/address/calendar), because a tap is
 * not a download.
 */

/** Every municipality the county names, plus the unincorporated county. Anything else is dropped. */
const AREAS = new Set([UNINCORPORATED, ...CITY_MAYORS.map((m) => m.munic)])

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type UseInput = {
  tool: UseTool
  action: UseAction
  section?: UseSection
  /** The county's municipality name for the address ("HIALEAH"). Never the address. */
  area?: string
  /** The public page it was about: a business, event or story slug, or a free-ride line. Checked before storing. */
  target?: string
  network?: UseNetwork
  /** A search, as typed: stored only when it is one of the site's own words (see `searchWords`). */
  term?: string
  /** How many businesses a search found. */
  results?: number
  path?: string
  lang?: 'es' | 'en'
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v)

/**
 * A use from an untrusted body, or null. Only known tools, actions, cards,
 * networks and municipalities get through, and only an action that can
 * happen on that tool, so nobody can write their own strings into the table;
 * an address `link` must say which card. The target and the search term are
 * only shaped here: `recordUse` checks them against the site before storing.
 */
export function normalizeUse(raw: unknown): UseInput | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  // The address tool's first beacons named no tool.
  const tool: UseTool = b.tool === undefined ? 'address' : isOneOf(USE_TOOLS, b.tool) ? b.tool : ('' as UseTool)
  if (!tool || !isOneOf(TOOL_ACTIONS[tool], b.action)) return null
  const action = b.action
  const section = isOneOf(USE_SECTIONS, b.section) ? b.section : undefined
  if (action === 'link' && !section) return null
  const network = isOneOf(USE_NETWORKS, b.network) ? b.network : undefined
  if (action === 'social' && !network) return null
  const path = normalizePath(b.path) ?? undefined
  const seg = path?.split('/')[1]
  const lang = b.lang === 'es' || b.lang === 'en' ? b.lang : seg === 'es' || seg === 'en' ? seg : undefined
  const results = typeof b.results === 'number' && Number.isFinite(b.results) ? Math.max(0, Math.min(999, Math.floor(b.results))) : undefined
  return {
    tool,
    action,
    section: action === 'link' ? section : undefined,
    area: typeof b.area === 'string' && AREAS.has(b.area) ? b.area : undefined,
    target: typeof b.target === 'string' && b.target.length <= 120 && SLUG.test(b.target) ? b.target : undefined,
    network: action === 'social' ? network : undefined,
    term: tool === 'search' && typeof b.term === 'string' ? fold(b.term).slice(0, 60) || undefined : undefined,
    results: tool === 'search' ? results : undefined,
    path: path && !path.startsWith('/admin') && !path.startsWith('/api') ? path : undefined,
    lang,
  }
}

const TARGET_COLLECTION = { listing: 'listings', event: 'events', story: 'stories' } as const

/** Answers for a few minutes, so a busy page costs one query per target, not one per tap. */
const TTL = 10 * 60_000
const known = new Map<string, { ok: boolean; at: number }>()
let vocabulary: { words: Set<string>; at: number } | null = null

export function resetUseCaches() {
  known.clear()
  vocabulary = null
}

/** Whether a target names a published page of its kind. */
async function realTarget(payload: Payload, tool: UseTool, target: string, now: number): Promise<boolean> {
  if (tool === 'route') return (ROUTE_SLUGS as readonly string[]).includes(target)
  if (!(tool in TARGET_COLLECTION)) return false
  const key = `${tool}:${target}`
  const hit = known.get(key)
  if (hit && now - hit.at < TTL) return hit.ok
  const { totalDocs } = await payload.count({
    collection: TARGET_COLLECTION[tool as keyof typeof TARGET_COLLECTION],
    where: { and: [PUBLISHED, { slug: { equals: target } }] },
    overrideAccess: true,
  })
  if (known.size > 5000) known.clear()
  known.set(key, { ok: totalDocs > 0, at: now })
  return totalDocs > 0
}

/**
 * The words the search knows, folded: every published business's name, its
 * category in both languages, its neighbourhood, cuisines and signature
 * dishes. A search is stored as typed only when it is one of these, so a
 * name, an address or anything else a person types stays out of the table.
 */
export async function searchWords(payload: Payload, now: number = Date.now()): Promise<Set<string>> {
  if (vocabulary && now - vocabulary.at < TTL) return vocabulary.words
  const words = new Set<string>()
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) words.add(fold(v))
  }
  for (const locale of ['es', 'en'] as const) {
    const { docs } = await payload.find({
      collection: 'listings',
      where: PUBLISHED,
      locale,
      depth: 1,
      limit: 2000,
      pagination: false,
      overrideAccess: true,
    })
    for (const l of docs) {
      add(l.name)
      add(l.hood)
      if (l.category && typeof l.category === 'object') add(l.category.label)
      for (const v of l.research?.cuisine ?? []) add(v)
      for (const v of l.research?.signatureItems ?? []) add(v)
    }
  }
  vocabulary = { words, at: now }
  return words
}

/** The browser from its user agent; only the app's name is kept. */
export function browserOf(userAgent: string | null): UseBrowser {
  const w = detectWebview(userAgent)
  if (!w) return 'browser'
  const app = w.app.toLowerCase()
  return isOneOf(USE_BROWSERS, app) ? app : 'other-app'
}

/** Like the visit counter's cap: only bounds how fast the table could be filled on purpose. */
const PER_MINUTE = 240
let windowStart = 0
let inWindow = 0

export function resetUseLimit() {
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
 * Store one use. Never throws: a visitor's page must not care whether the
 * count worked. Returns whether a row was written.
 */
export async function recordUse(
  payload: Payload,
  raw: unknown,
  headers: Headers,
  now: number = Date.now(),
): Promise<boolean> {
  const use = normalizeUse(raw)
  if (!use) return false
  if (!shouldCount(headers) || !underLimit(now)) return false
  const ua = headers.get('user-agent')
  try {
    const target = use.target && (await realTarget(payload, use.tool, use.target, now)) ? use.target : undefined
    // A target that isn't a real page is a made-up row: refuse it, don't store it without one.
    if (use.target && !target) return false
    const term = use.term && (await searchWords(payload, now)).has(use.term) ? use.term : undefined
    await payload.create({
      collection: 'hq-uses',
      data: {
        tool: use.tool,
        action: use.action,
        section: use.section,
        area: use.area,
        target,
        network: use.network,
        term,
        results: use.results,
        path: use.path,
        lang: use.lang,
        browser: browserOf(ua),
        device: deviceOf(ua),
        country: headers.get('cf-ipcountry')?.slice(0, 2) || undefined,
      },
      overrideAccess: true,
      depth: 0,
    })
    return true
  } catch (err) {
    console.error('[hq] use not recorded:', err instanceof Error ? err.message : err)
    return false
  }
}

const count = <K extends string>(rows: K[]) =>
  Object.fromEntries(
    Object.entries(
      rows.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {}),
    ).sort((a, b) => b[1] - a[1]),
  )

type Row = {
  tool?: string | null
  action: string
  section?: string | null
  area?: string | null
  target?: string | null
  network?: string | null
  term?: string | null
  results?: number | null
  browser?: string | null
}

/** Per target: its total and its actions, busiest first. */
function byTarget(rows: Row[], top: number) {
  const m = new Map<string, Row[]>()
  for (const r of rows) if (r.target) m.set(r.target, [...(m.get(r.target) ?? []), r])
  return [...m.entries()]
    .map(([target, rs]) => ({ target, total: rs.length, actions: count(rs.map((r) => r.action)) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, top)
}

/**
 * What people did on the site over the last `days`, for the growth review:
 * the address tool's funnel, which businesses got calls, directions and
 * website taps, which events got saved, which stories were read to the end,
 * what people searched for, and taps out of the site from everywhere else.
 */
export async function toolUseReport(payload: Payload, days: number, now: Date = new Date()) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  const res = await payload.find({
    collection: 'hq-uses',
    where: { createdAt: { greater_than_equal: since } },
    limit: 50_000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { tool: true, action: true, section: true, area: true, target: true, network: true, term: true, results: true, browser: true },
  })
  const rows = res.docs as Row[]
  const on = (tool: UseTool) => rows.filter((r) => (r.tool ?? 'address') === tool)
  const address = on('address')
  const of = (a: UseAction) => address.filter((r) => r.action === a)
  const lookups = of('lookup')
  const searches = on('search')
  return {
    days,
    note: 'What people did on the site (hq-uses), one row per action, nothing identifying: no IP, cookie or visitor id, never an address, and a search is kept as typed only when it is one of the site\'s own words (a business, category, neighbourhood, cuisine or dish). Bots and staff not counted. Targets are public slugs. Counted from the day each part shipped.',
    address: {
      note: 'lookup = a report was shown; calendar = the .ics was downloaded (the "it worked" moment); open_chrome / copy_link = ways out of an app\'s built-in browser, where the calendar button is hidden. Someone who escapes an app\'s browser loads the same report again in Safari or Chrome, so they count as two lookups (one in the app, one in a browser): read calendarPerLookup for reel traffic with that in mind.',
      actions: count(address.map((r) => r.action)),
      lookupsByBrowser: count(lookups.map((r) => r.browser ?? 'browser')),
      lookupsByArea: count(lookups.map((r) => r.area ?? 'unknown')),
      linksBySection: count(of('link').map((r) => r.section ?? 'unknown')),
      calendarPerLookup: lookups.length ? Math.round((of('calendar').length / lookups.length) * 100) / 100 : null,
    },
    listings: {
      note: 'Taps on business pages: call, directions, website, social (network says which). This is what a partner can be shown.',
      actions: count(on('listing').map((r) => r.action)),
      top: byTarget(on('listing'), 15),
    },
    events: { actions: count(on('event').map((r) => r.action)), top: byTarget(on('event'), 15) },
    stories: { readToEnd: byTarget(on('story').filter((r) => r.action === 'read_end'), 15), taps: count(on('story').map((r) => r.action)) },
    routes: { actions: count(on('route').map((r) => r.action)), top: byTarget(on('route'), 10) },
    searches: {
      total: searches.length,
      foundNothing: searches.filter((r) => r.action === 'no_match').length,
      topTerms: count(searches.filter((r) => r.term).map((r) => r.term as string)),
    },
    elsewhere: { actions: count(on('page').map((r) => r.action)) },
    socialNetworks: count(rows.filter((r) => r.network).map((r) => r.network as string)),
  }
}
