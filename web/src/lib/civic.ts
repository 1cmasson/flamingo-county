import { existsSync, statSync } from 'node:fs'
import { createClient, type Client } from '@libsql/client'

import { todayISO } from './dates'
import { meters, nearestServing, TRANSIT, walkMinutes, type LatLng, type NearestStop, type TransitRoute } from './transit'
import { nextDates, normalizeAddress, prettyAddress, slugOf, titleCase, type Rule } from './civicGeo'
import { dbPath, type Pickup as StoredPickup } from './civicSync'

export { KIND, normalizeAddress, parseRule, matchesRule, nextDates, rrule, prettyAddress } from './civicGeo'
export { slugOf }

/**
 * What Miami-Dade County, its cities and FEMA know about a street address:
 * trash days, flood and storm-surge zones, who represents it, where it votes,
 * its schools, and the nearest public places.
 *
 * Read from the address database civicSync.ts builds on the data volume. It
 * holds addresses, never people: no owner, price or value is ever fetched.
 */

/* ------------------------------------------------------------------ data */

type Place = { name: string; address: string; phone: string; at: LatLng }
type School = { name: string; address: string; zip: string; phone: string; grades: string }
type Official = { district: number; name: string }
/** A moved site from the Supervisor of Elections' list can lack coordinates. */
type PollingPlace = Omit<Place, 'at'> & { at: LatLng | null }

type Meta = {
  fetchedAt: string
  /** City names; rows refer to them by position. */
  names: string[]
  zones: {
    garbage: StoredPickup[]
    recycling: StoredPickup[]
    bulk: StoredPickup[]
    flood: string[]
    surge: string[]
    commission: Official[]
    precinct: { precinct: number; polling: PollingPlace | null }[]
    elementary: School[]
    middle: School[]
    high: School[]
    house: Official[]
    senate: Official[]
  }
  places: Record<'fire' | 'police' | 'library' | 'park' | 'hospital', Place[]>
  pollingSource?: PollingSource
}

/** Where the Election Day sites came from: the Supervisor of Elections' list for `election`, or the county layer. */
export type PollingSource = { by: string; url: string; election: string | null; electionName: string | null; published: string | null }

/** As stored: the zip, the city names and the coordinates are numbers (coordinates in 1e-5 degrees). */
type Row = {
  key: string
  zip: number
  munic: number
  city: number
  lat: number
  lon: number
  units: number
  kind: number
  garbage: number | null
  recycling: number | null
  bulk: number | null
  flood: number | null
  surge: number | null
  commission: number | null
  precinct: number | null
  elementary: number | null
  middle: number | null
  high: number | null
  house: number | null
  senate: number | null
}

let conn: { db: Client; mtime: number; meta: Meta; checked: number } | null = null

/**
 * The open database, reopened when a sync has swapped in a new file. The
 * mtime is looked at once a minute, not on every keystroke of a search.
 */
async function open(): Promise<typeof conn> {
  const now = Date.now()
  if (conn && now - conn.checked < 60_000) return conn
  const path = dbPath()
  if (!existsSync(path)) return null
  const mtime = statSync(path).mtimeMs
  if (conn && conn.mtime === mtime) {
    conn.checked = now
    return conn
  }
  const db = createClient({ url: `file:${path}` })
  const rows = (await db.execute('SELECT key, value FROM meta')).rows
  const meta = Object.fromEntries(rows.map((r) => [String(r.key), JSON.parse(String(r.value))])) as Meta
  conn?.db.close()
  conn = { db, mtime, meta, checked: now }
  return conn
}

/**
 * The data's version, for tile URLs: a tile address never changes meaning, so
 * phones (and Cloudflare) can keep it for a year and a refresh moves to a new one.
 */
export async function civicVersion(): Promise<string | null> {
  const c = await open()
  return c ? String(Math.round(c.mtime / 1000)) : null
}

/** One gzipped vector tile, or null where the county has nothing to draw. */
export async function tileAt(z: number, x: number, y: number): Promise<Uint8Array | null> {
  const c = await open()
  if (!c) return null
  const row = (await c.db.execute({ sql: 'SELECT data FROM tiles WHERE z = ? AND x = ? AND y = ?', args: [z, x, y] })).rows[0]
  return row ? new Uint8Array(row.data as ArrayBuffer) : null
}

/** False until the first sync has finished. */
export async function civicReady(): Promise<boolean> {
  return !!(await open())
}

/** The day the records were read from the agencies, or null before the first sync. */
export async function civicFetchedAt(): Promise<string | null> {
  return (await open())?.meta.fetchedAt ?? null
}

const toRow = (r: Record<string, unknown>) => r as unknown as Row
const zipText = (z: number) => String(z).padStart(5, '0')
const atOf = (r: Row): LatLng => [r.lat / 1e5, r.lon / 1e5]

/* -------------------------------------------------------------- search */

export type Suggestion = { slug: string; label: string; zip: string; city: string }

const toSuggestion = (names: string[]) => (r: Row): Suggestion => ({
  slug: slugOf(r.key, zipText(r.zip)),
  label: prettyAddress(r.key),
  zip: zipText(r.zip),
  city: titleCase(names[r.city] ?? ''),
})

/**
 * Up to `limit` addresses for what has been typed so far: a prefix of the
 * stored spelling first ("5410 W 6" finds 5410 W 6 LN); failing that, the
 * house number with every other word somewhere after it ("5410 6 ln"); and
 * for a street typed without a number, addresses on it.
 */
export async function suggest(q: string, limit = 8): Promise<Suggestion[]> {
  const { text, zip } = normalizeAddress(q)
  if (text.length < 2) return []
  const c = await open()
  if (!c) return []
  const zipSql = zip ? ' AND zip = ?' : ''
  const zipArg = zip ? [Number(zip)] : []
  // Every key that starts with `text`: from text up to text followed by the highest character.
  let rows = (
    await c.db.execute({
      sql: `SELECT * FROM addr WHERE key >= ? AND key < ?${zipSql} ORDER BY key, zip LIMIT ?`,
      args: [text, `${text}￿`, ...zipArg, limit],
    })
  ).rows.map(toRow)

  const [num, ...words] = text.split(' ')
  if (!rows.length && /^\d+$/.test(num) && words.length) {
    const candidates = (
      await c.db.execute({ sql: `SELECT * FROM addr WHERE key >= ? AND key < ?${zipSql} LIMIT 4000`, args: [`${num} `, `${num} ￿`, ...zipArg] })
    ).rows.map(toRow)
    rows = candidates
      .filter((r) => {
        const parts = r.key.split(' ')
        return words.every((w) => parts.some((p) => p.startsWith(w)))
      })
      .slice(0, limit)
  }
  if (!rows.length && !/^\d/.test(num) && text.length >= 4) {
    rows = (await c.db.execute({ sql: `SELECT * FROM addr WHERE key LIKE ?${zipSql} LIMIT ?`, args: [`% ${text}%`, ...zipArg, limit] })).rows.map(toRow)
  }
  return rows.map(toSuggestion(c.meta.names))
}

/** The nearest address to a point, if one is within `maxMeters`: for "use my location". */
export async function nearestAddress(at: LatLng, maxMeters = 120): Promise<Suggestion | null> {
  const c = await open()
  if (!c) return null
  // No index on location: "use my location" is rare, and a scan is a fraction of a second.
  const d = 200
  const [la, lo] = [Math.round(at[0] * 1e5), Math.round(at[1] * 1e5)]
  const rows = (
    await c.db.execute({
      sql: 'SELECT * FROM addr WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?',
      args: [la - d, la + d, lo - d, lo + d],
    })
  ).rows.map(toRow)
  let best: Row | null = null
  let bestM = Infinity
  for (const r of rows) {
    const m = meters(at, atOf(r))
    if (m < bestM) {
      bestM = m
      best = r
    }
  }
  return best && bestM <= maxMeters ? toSuggestion(c.meta.names)(best) : null
}

/* --------------------------------------------------------------- report */

export type Pickup = StoredPickup & { rule: Rule | null; next: string[] }
export type Nearby = Place & { meters: number; walk: number }
export type BusStop = { route: TransitRoute; stopName: string; stationId: string; meters: number; walk: number }

export type AddressReport = {
  slug: string
  label: string
  zip: string
  /** The municipality, upper case as the county writes it: "HIALEAH", "UNINCORPORATED MIAMI-DADE". */
  munic: string
  /** The postal city, for the address line. */
  city: string
  at: LatLng
  units: number
  kind: number
  trash: { garbage: Pickup | null; recycling: Pickup | null; bulk: Pickup | null }
  flood: string | null
  surge: string | null
  commission: Official | null
  house: Official | null
  senate: Official | null
  precinct: number | null
  polling: PollingPlace | null
  pollingSource: PollingSource | null
  schools: { elementary: School | null; middle: School | null; high: School | null }
  nearby: Record<'fire' | 'police' | 'library' | 'park' | 'hospital', Nearby | null>
  bus: BusStop[]
  fetchedAt: string
}

/** Farther than this, the free Hialeah buses aren't an answer. */
const BUS_METERS = 1600

function nearest(list: Place[], at: LatLng): Nearby | null {
  let best: Nearby | null = null
  for (const p of list) {
    const m = meters(at, p.at)
    if (!best || m < best.meters) best = { ...p, meters: m, walk: walkMinutes(m) }
  }
  return best
}

/**
 * The row behind a slug. Slugs are the key and zip with every non-letter as a
 * hyphen ("5410-w-6-ln-33012"), so the key is usually the slug's words; for a
 * street spelled with punctuation ("O'BRIEN") the words are matched loosely
 * and the slug checked exactly.
 */
async function bySlug(db: Client, slug: string): Promise<Row | null> {
  const m = slug.match(/^([a-z0-9-]+)-(\d{5})$/)
  if (!m) return null
  const [, words, zip] = m
  const guess = words.replace(/-/g, ' ').toUpperCase()
  const exact = (await db.execute({ sql: 'SELECT * FROM addr WHERE key = ? AND zip = ?', args: [guess, Number(zip)] })).rows[0]
  if (exact) return toRow(exact)
  const loose = (
    await db.execute({ sql: 'SELECT * FROM addr WHERE key LIKE ? AND zip = ? LIMIT 20', args: [guess.replace(/ /g, '%'), Number(zip)] })
  ).rows.map(toRow)
  return loose.find((r) => slugOf(r.key, zip) === slug) ?? null
}

export async function addressReport(slug: string, today: string = todayISO()): Promise<AddressReport | null> {
  const c = await open()
  if (!c || !slug) return null
  const r = await bySlug(c.db, slug)
  if (!r) return null
  const z = c.meta.zones
  const pick = <T,>(list: T[], i: number | null): T | null => (i != null && i >= 0 ? (list[i] ?? null) : null)
  const pickup = (p: StoredPickup | null): Pickup | null => (p ? { ...p, next: p.rule ? nextDates(p.rule, today) : [] } : null)
  const at = atOf(r)
  const precinct = pick(z.precinct, r.precinct)
  const bus = TRANSIT.routes
    .map((route) => {
      const ways = [nearestServing(route, at, 'end'), nearestServing(route, at, 'start')].filter((s): s is NearestStop => !!s)
      const s = ways.sort((p, q) => p.meters - q.meters)[0]
      return s && s.meters <= BUS_METERS
        ? { route, stopName: s.stopName, stationId: s.station.id, meters: s.meters, walk: walkMinutes(s.meters) }
        : null
    })
    .filter((b): b is BusStop => !!b)
    .sort((a, b) => a.meters - b.meters)
  return {
    slug,
    label: r.key,
    zip: zipText(r.zip),
    munic: c.meta.names[r.munic] ?? '',
    city: c.meta.names[r.city] ?? '',
    at,
    units: r.units,
    kind: r.kind,
    trash: {
      garbage: pickup(pick(z.garbage, r.garbage)),
      recycling: pickup(pick(z.recycling, r.recycling)),
      bulk: pickup(pick(z.bulk, r.bulk)),
    },
    flood: pick(z.flood, r.flood),
    surge: pick(z.surge, r.surge),
    commission: pick(z.commission, r.commission),
    house: pick(z.house, r.house),
    senate: pick(z.senate, r.senate),
    precinct: precinct?.precinct ?? null,
    polling: precinct?.polling ?? null,
    pollingSource: c.meta.pollingSource ?? null,
    schools: { elementary: pick(z.elementary, r.elementary), middle: pick(z.middle, r.middle), high: pick(z.high, r.high) },
    nearby: {
      fire: nearest(c.meta.places.fire, at),
      police: nearest(c.meta.places.police, at),
      library: nearest(c.meta.places.library, at),
      park: nearest(c.meta.places.park, at),
      hospital: nearest(c.meta.places.hospital, at),
    },
    bus,
    fetchedAt: c.meta.fetchedAt,
  }
}

/* ------------------------------------------------------- fixed facts */

/**
 * Hialeah's government, from hialeahfl.gov (checked 2026-10-07). Its council
 * is elected citywide, by numbered group, so every Hialeah address has the
 * same mayor and the same seven council members. Other cities show the
 * county's officials and their own city's name.
 */
export const CITY_GOVERNMENT = {
  mayor: 'Bryan Calvo',
  mayorUrl: 'https://www.hialeahfl.gov/195/City-Mayor',
  councilUrl: 'https://www.hialeahfl.gov/435/City-Council',
  governmentUrl: 'https://www.hialeahfl.gov/434/Your-Government',
  checked: '2026-10-07',
}

export const LINKS = {
  hialeahSolidWaste: 'https://www.hialeahfl.gov/286/Solid-Waste-Recycling-Services',
  miamiSolidWaste: 'https://www.miami.gov/My-Government/Departments/Solid-Waste',
  countySolidWaste: 'https://www.miamidade.gov/global/solidwaste/home.page',
  countyBulky: 'https://www.miamidade.gov/bulkywaste',
  countyRecycling: 'https://www.miamidade.gov/global/solidwaste/recycling.page',
  knowYourZone: 'https://www.miamidade.gov/global/emergency/hurricane/evacuation-zones.page',
  elections: 'https://www.miamidade.gov/global/elections/home.page',
  femaFlood: 'https://msc.fema.gov/portal/search',
  findHouse: 'https://www.myfloridahouse.gov/FindYourRepresentative',
  findSenate: 'https://www.flsenate.gov/Senators/Find',
  openData: 'https://gis-mdc.opendata.arcgis.com',
}
