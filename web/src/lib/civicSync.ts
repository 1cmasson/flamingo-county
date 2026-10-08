import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { createClient, type Client, type InStatement } from '@libsql/client'

import { addressKey, daysKey, KIND, kindFromDor, parseDayLetters, parseRule, PolygonIndex, ringsContain, simplifyRing, titleCase, type Ring, type Rule } from './civicGeo'
import { buildTiles, labelPoint } from './civicTiles'
import { todayISO } from './dates'
import { civicDir, civicSchemaOnDisk, dbPath, SCHEMA, schemaFile } from './civicStatus'

/**
 * Builds the address database: every street address in Miami-Dade, with the
 * trash, flood, storm-surge, district, precinct and school zone it falls in,
 * from the county's, the cities' and FEMA's public map services.
 *
 * It runs on the server (at boot when the data is missing or a month old; see
 * instrumentation.ts) or by hand with `pnpm civic:sync`. Nothing it builds is
 * committed: it all lives in `civicDir()`, on the server's data volume.
 *
 * - The two big layers (614k addresses, 944k parcels) are cached as raw files
 *   and only downloaded again when the county's "last edited" date moves.
 *   Everything else is small and is fetched every run.
 * - The database is built beside the live one and swapped in with a rename, so
 *   a reader never sees half of it.
 * - **Privacy.** The county's parcel layer carries owners' names, mailing
 *   addresses, sale prices and assessed values. Only the fields in the
 *   allowlists below are ever requested; a parcel contributes nothing but its
 *   land-use code, reduced to a five-way `kind`.
 */

const HIA = 'https://hgis.hialeahfl.gov/arcgis/rest/services/Government_Services/Solid_Waste/MapServer'
const MIA = 'https://gis.miami.gov/gis/rest/services/SolidWaste'
/**
 * The county's published Open Data services, addressed by name. (Its 311 map
 * service renumbered and dropped most layers overnight on 2026-10-07; these
 * are the ones the county publishes for reuse.)
 */
const OD = 'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services'
const od = (name: string) => `${OD}/${name}/FeatureServer/0`

export const LAYERS = {
  addresses: od('GeoAddress_gdb'),
  parcels: od('PaGISView_gdb'),
  hialeahGarbage: `${HIA}/2`,
  hialeahRecycling: `${HIA}/0`,
  hialeahBulk: `${HIA}/1`,
  miamiGarbage: `${MIA}/GarbageRoutes/MapServer/0`,
  miamiRecycling: `${MIA}/RecycleRoutes/MapServer/0`,
  miamiBulk: `${MIA}/BulkTrash_4Day_Plan/MapServer/0`,
  countyGarbage: od('GarbagePickupRoute_gdb'),
  countyRecycling: od('RecyclingRoute_gdb'),
  flood: od('FEMAFloodZone_gdb'),
  surge: od('HurricaneEvacZone_gdb'),
  commission: od('CommissionDistrict_gdb'),
  precinct: od('Precinct_gdb'),
  polling: od('PollingPlace_gdb'),
  elementary: od('ElementaryAttendanceBoundary_gdb'),
  middle: od('MiddleAttendanceBoundary_gdb'),
  high: od('HighAttendanceBoundary_gdb'),
  house: od('HouseDistrict_gdb'),
  senate: od('SenateDistrict_gdb'),
  countyFire: od('FireStation_gdb'),
  cityFire: od('MunicipalFireStation_gdb'),
  countyPolice: od('PoliceStation_gdb'),
  cityPolice: od('MunicipalPoliceStation_gdb'),
  countyLibrary: od('Library_gdb'),
  cityLibrary: od('MunicipalLibrary_gdb'),
  countyPark: od('CountyParkCenterpoints_PROS_View_for_ALWAYS_ON'),
  cityPark: od('MunicipalPark_gdb'),
  hospital: od('Hospital_gdb'),
  cities: od('Municipalitypoly_gdb'),
} as const

/** The only address fields requested. FOLIO joins a parcel's land use, then is dropped. */
export const ADDRESS_FIELDS = 'HSE_NUM,PRE_DIR,ST_NAME,ST_TYPE,SUF_DIR,ZIP,MUNIC_NAME,MAILING_MUNIC,FOLIO'
/** The only parcel fields requested: never owners, mailing addresses, prices or values. */
export const PARCEL_FIELDS = 'FOLIO,DOR_CODE_CUR'

/** ~2 m: enough to keep an address on the right side of a boundary, a fraction of the download. */
const SIMPLIFY = '0.00002'
const UA = 'flamingocounty.com civic sync (+https://flamingocounty.com)'

// Where the database lives and its layout version (SCHEMA): civicStatus.ts,
// which proxy.ts reads without loading this file.
export { civicDir, dbPath, SCHEMA }

/* --------------------------------------------------------------- fetch */

type Attrs = Record<string, unknown>
type Feature = { attributes: Attrs; geometry?: { rings?: Ring[]; x?: number; y?: number } }

async function query(layer: string, params: Record<string, string>): Promise<{ features: Feature[]; exceeded: boolean }> {
  const body = new URLSearchParams({ f: 'json', ...params })
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${layer}/query`, {
        method: 'POST',
        body,
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(120_000),
      })
      const json = (await res.json()) as { features?: Feature[]; exceededTransferLimit?: boolean; error?: { message: string } }
      if (json.error) throw new Error(json.error.message)
      return { features: json.features ?? [], exceeded: !!json.exceededTransferLimit }
    } catch (err) {
      if (attempt >= 5) throw new Error(`${layer}: ${(err as Error).message}`)
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
}

async function count(layer: string): Promise<number> {
  const body = new URLSearchParams({ f: 'json', where: '1=1', returnCountOnly: 'true' })
  const res = await fetch(`${layer}/query`, { method: 'POST', body, headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) })
  return Number(((await res.json()) as { count?: number }).count ?? 0)
}

async function lastEdit(layer: string): Promise<number | null> {
  try {
    const res = await fetch(`${layer}?f=json`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) })
    const json = (await res.json()) as { editingInfo?: { dataLastEditDate?: number; lastEditDate?: number } }
    return json.editingInfo?.dataLastEditDate ?? json.editingInfo?.lastEditDate ?? null
  } catch {
    return null
  }
}

/** How many features the layer hands out per request. */
async function maxRecords(layer: string): Promise<number> {
  const res = await fetch(`${layer}?f=json`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) })
  return Math.min(2000, Number(((await res.json()) as { maxRecordCount?: number }).maxRecordCount) || 1000)
}

/** Every feature, in OBJECTID order, a few pages at a time. */
async function each(layer: string, params: Record<string, string>, onPage: (f: Feature[]) => void, parallel = 4) {
  const total = await count(layer)
  const pageSize = await maxRecords(layer)
  const offsets: number[] = []
  for (let o = 0; o < total; o += pageSize) offsets.push(o)
  for (let i = 0; i < offsets.length; i += parallel) {
    const pages = await Promise.all(
      offsets.slice(i, i + parallel).map((o) =>
        query(layer, { ...params, orderByFields: 'OBJECTID', resultOffset: String(o), resultRecordCount: String(pageSize) }),
      ),
    )
    for (const p of pages) onPage(p.features)
  }
}

/**
 * A small layer whole: polygons simplified, points as they are, all in
 * lat/lon. Pages advance by what the server actually sent: some layers cap a
 * page at 100 however many are asked for, and skipping by the asked-for size
 * would silently drop most of the layer.
 */
async function all(layer: string, fields: string, geometry = true): Promise<Feature[]> {
  const out: Feature[] = []
  for (;;) {
    const { features, exceeded } = await query(layer, {
      where: '1=1',
      outFields: fields,
      returnGeometry: String(geometry),
      outSR: '4326',
      maxAllowableOffset: SIMPLIFY,
      orderByFields: 'OBJECTID',
      resultOffset: String(out.length),
      resultRecordCount: '1000',
    })
    out.push(...features)
    if (!features.length || !exceeded) break
  }
  // The safety net: a layer that came back short fails the sync, and the last good data stays.
  const expected = await count(layer)
  if (out.length < expected) throw new Error(`${layer}: got ${out.length} of ${expected} features`)
  return out
}

/* --------------------------------------------------------------- storm surge */

/** Address counts by storm-surge planning zone ("A"…"E"), and outside every zone. */
export type ZoneCounts = { total: number; none: number; byZone: Record<string, number> }
export type SurgeArea = {
  slug: string
  munic: string
  addresses: ZoneCounts
  /**
   * Addresses whose parcel's land use is a mobile home. Not shown: a mobile
   * home park is usually one parcel with one address, so this counts parks,
   * not homes (279 in the county on 2026-10-07).
   */
  mobile: ZoneCounts
  /** The same counts by ZIP code, for "which parts of the city": never by street or house. */
  zips: ({ zip: string } & ZoneCounts)[]
}
export type SurgeSummary = { zones: string[]; county: ZoneCounts; mobile: ZoneCounts; areas: SurgeArea[] }

/** One group of addresses, as counted in the database: municipality, ZIP, zone (null outside every zone), mobile or not. */
export type SurgeGroup = { munic: string; zip: string; zone: string | null; mobile: boolean; n: number }

const emptyCounts = (): ZoneCounts => ({ total: 0, none: 0, byZone: {} })
function addTo(c: ZoneCounts, zone: string | null, n: number) {
  c.total += n
  if (zone) c.byZone[zone] = (c.byZone[zone] ?? 0) + n
  else c.none += n
}

/**
 * How many addresses each municipality (and the unincorporated county) has
 * in each storm-surge planning zone. Municipalities by name, the
 * unincorporated county last; ZIP codes in order.
 */
export function surgeSummary(groups: SurgeGroup[], zones: string[]): SurgeSummary {
  const county = emptyCounts()
  const mobile = emptyCounts()
  const areas = new Map<string, SurgeArea & { zipMap: Map<string, { zip: string } & ZoneCounts> }>()
  for (const g of groups) {
    if (!g.munic) continue
    addTo(county, g.zone, g.n)
    if (g.mobile) addTo(mobile, g.zone, g.n)
    const a = areas.get(g.munic) ?? { slug: municSlug(g.munic), munic: g.munic, addresses: emptyCounts(), mobile: emptyCounts(), zips: [], zipMap: new Map() }
    addTo(a.addresses, g.zone, g.n)
    if (g.mobile) addTo(a.mobile, g.zone, g.n)
    if (g.zip) {
      const z = a.zipMap.get(g.zip) ?? { zip: g.zip, ...emptyCounts() }
      addTo(z, g.zone, g.n)
      a.zipMap.set(g.zip, z)
    }
    areas.set(g.munic, a)
  }
  const rank = (m: string) => (m === UNINCORPORATED ? 1 : 0)
  return {
    zones: [...zones].sort(),
    county,
    mobile,
    areas: [...areas.values()]
      .sort((a, b) => rank(a.munic) - rank(b.munic) || a.munic.localeCompare(b.munic))
      .map(({ zipMap, ...a }) => ({ ...a, zips: [...zipMap.values()].sort((x, y) => x.zip.localeCompare(y.zip)) })),
  }
}

/* --------------------------------------------------------------- raw caches */

type CacheState = Record<string, { edited: number | null; rows: number; at: string }>

async function cacheLayer(
  dir: string,
  name: 'addresses' | 'parcels',
  state: CacheState,
  force: boolean,
  log: (s: string) => void,
): Promise<string> {
  const file = join(dir, 'raw', `${name}.jsonl`)
  const layer = LAYERS[name]
  const edited = await lastEdit(layer)
  const prev = state[name]
  if (!force && prev && edited && prev.edited === edited && existsSync(file)) {
    log(`${name}: unchanged since ${new Date(edited).toISOString().slice(0, 10)}, kept`)
    return file
  }
  log(`${name}: downloading…`)
  const tmp = `${file}.tmp`
  const out = createWriteStream(tmp)
  let rows = 0
  const isAddr = name === 'addresses'
  await each(
    layer,
    isAddr
      ? { where: '1=1', outFields: ADDRESS_FIELDS, returnGeometry: 'true', outSR: '4326' }
      : { where: '1=1', outFields: PARCEL_FIELDS, returnGeometry: 'false' },
    (features) => {
      for (const { attributes: a, geometry: g } of features) {
        const row = isAddr
          ? [a.HSE_NUM, a.PRE_DIR, a.ST_NAME, a.ST_TYPE, a.SUF_DIR, a.ZIP, a.MUNIC_NAME, a.MAILING_MUNIC, a.FOLIO, g?.x, g?.y]
          : [a.FOLIO, a.DOR_CODE_CUR]
        out.write(JSON.stringify(row) + '\n')
        rows++
      }
    },
  )
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
  renameSync(tmp, file)
  state[name] = { edited, rows, at: new Date().toISOString() }
  log(`${name}: ${rows} rows`)
  return file
}

async function* lines(file: string): AsyncGenerator<unknown[]> {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of rl) if (line) yield JSON.parse(line) as unknown[]
}

/* --------------------------------------------------------------- zones */

const str = (v: unknown): string => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())
const phone = (v: unknown): string => {
  const d = str(v).replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : str(v) === 'null' ? '' : str(v)
}

export type Pickup = { by: 'hialeah' | 'miami' | 'county'; zone: string; rule: Rule | null; appointment?: boolean }

/** A zone table: rows, and an index that maps a point to its row. */
class Zones<T> {
  rows: T[] = []
  index = new PolygonIndex()
  private ids = new Map<string, number>()
  add(features: Feature[], key: (a: Attrs) => string | null, row: (a: Attrs) => T | null) {
    for (const f of features) {
      const k = key(f.attributes)
      const rings = f.geometry?.rings
      if (k == null || !rings?.length) continue
      let i = this.ids.get(k)
      if (i === undefined) {
        const r = row(f.attributes)
        if (r == null) continue
        i = this.rows.push(r) - 1
        this.ids.set(k, i)
      }
      this.index.add(rings, i)
    }
    return this
  }
  find(x: number, y: number) {
    return this.index.find(x, y)
  }
}

type Place = { name: string; address: string; phone: string; at: [number, number] }
type PollingSite = Omit<Place, 'at'> & { at: [number, number] | null }

/**
 * The Supervisor of Elections' own polling-place list for an upcoming
 * election, saved from the PDF it publishes about a month before
 * (src/data/civic/polling-<election date>.json).
 *
 * It wins over the county's Open Data layer, which lags: on 2026-10-07 that
 * layer still held the August primary's sites for precincts 99 and 253.
 * Once the election date has passed the file stops counting, and the layer
 * is used again until the next list is added.
 *
 * To add the next one: download the list ("Precinct / Polling Place List",
 * miamidade.gov/elections/library/), read each page as laid-out text, and
 * cut the rows by the header's column positions (Place Name, Office Location,
 * CITY, ZIP). A line without a precinct number continues the row above
 * (long names wrap). Keep `election`, `published` and `source`.
 */
type OfficialPolling = {
  election: string
  electionName: string
  published: string
  source: string
  by: string
  rows: { precinct: number; sub: number; name: string; address: string; city: string; zip: string }[]
}

const OFFICIAL_DIR = join(process.cwd(), 'src/data/civic')

/** Every saved list, oldest election first. */
function officialLists(dir: string): OfficialPolling[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^polling-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as OfficialPolling)
    .sort((a, b) => (a.election < b.election ? -1 : 1))
}

export function officialPolling(today: string = todayISO(), dir = OFFICIAL_DIR): OfficialPolling | null {
  return officialLists(dir).find((l) => l.election >= today) ?? null
}

/**
 * The newest list we hold, upcoming or past. The vote pages use it to say an
 * election is over: after its date `officialPolling` returns nothing, and
 * the sites fall back to the county layer.
 */
export function latestOfficialPolling(dir = OFFICIAL_DIR): OfficialPolling | null {
  return officialLists(dir).at(-1) ?? null
}

/* --------------------------------------------------------------- where to vote */

/** One precinct in one place: a municipality, and for unincorporated Miami-Dade, a commission district. */
export type VotePlacement = { precinct: number; munic: string; district: number | null }
/** A "where to vote" page: its slug, and the precincts with addresses (or area) in it. */
export type VoteArea = { slug: string; munic: string; district: number | null; precincts: number[] }

export const UNINCORPORATED = 'UNINCORPORATED MIAMI-DADE'

/** A municipality's URL slug: "HIALEAH GARDENS" → "hialeah-gardens", the unincorporated county → "unincorporated". */
export function municSlug(munic: string): string {
  return munic === UNINCORPORATED ? 'unincorporated' : munic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/**
 * The vote pages: one per municipality, and unincorporated Miami-Dade split
 * by commission district. A precinct is listed in every place it has
 * addresses, so one that crosses a city line is on both cities' pages.
 * Municipalities come first, by name; then the districts, by number.
 */
export function voteAreas(placements: VotePlacement[]): VoteArea[] {
  const areas = new Map<string, VoteArea>()
  for (const p of placements) {
    if (!p.munic) continue
    const uninc = p.munic === UNINCORPORATED
    const slug = uninc
      ? p.district != null
        ? `unincorporated-district-${p.district}`
        : 'unincorporated'
      : municSlug(p.munic)
    const area = areas.get(slug) ?? { slug, munic: p.munic, district: uninc ? p.district : null, precincts: [] }
    if (!area.precincts.includes(p.precinct)) area.precincts.push(p.precinct)
    areas.set(slug, area)
  }
  const rank = (a: VoteArea) => (a.munic === UNINCORPORATED ? 1 : 0)
  return [...areas.values()]
    .map((a) => ({ ...a, precincts: [...a.precincts].sort((x, y) => x - y) }))
    .sort((a, b) => rank(a) - rank(b) || (rank(a) ? (a.district ?? 99) - (b.district ?? 99) : a.munic.localeCompare(b.munic)))
}

function places(features: Feature[], nameOf: (a: Attrs) => string = (a) => str(a.NAME || a.BRANCH), keep: (a: Attrs) => boolean = () => true): Place[] {
  return features
    .filter((f) => f.geometry?.x != null && keep(f.attributes))
    .map((f) => ({
      name: titleCase(nameOf(f.attributes)),
      address: titleCase(str(f.attributes.ADDRESS)),
      phone: phone(f.attributes.PHONE),
      at: [Math.round(f.geometry!.y! * 1e6) / 1e6, Math.round(f.geometry!.x! * 1e6) / 1e6] as [number, number],
    }))
}

/* --------------------------------------------------------------- map */

/** About 9 m: invisible at street zoom, a fraction of the points. */
const DISPLAY_TOLERANCE = 0.00008

type GeoFeature = { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }

/** Signed area: the county draws outer rings clockwise (negative here) and holes the other way. */
function area(ring: Ring): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return a / 2
}

/**
 * ArcGIS rings → a GeoJSON MultiPolygon. ArcGIS lists outer rings and holes
 * together and tells them apart by direction; GeoJSON wants each hole inside
 * its own polygon, or the map would paint the hole in.
 */
function toGeo(rings: Ring[], properties: Record<string, unknown>): GeoFeature | null {
  const simple = rings.map((r) => simplifyRing(r, DISPLAY_TOLERANCE)).filter((r) => r.length >= 4)
  if (!simple.length) return null
  const outers: Ring[][] = []
  const holes: Ring[] = []
  for (const r of simple) {
    if (area(r) > 0) holes.push(r)
    else outers.push([r])
  }
  for (const h of holes) {
    const home = outers.find((poly) => ringsContain([poly[0]], h[0][0], h[0][1]))
    if (home) home.push(h)
  }
  if (!outers.length) return null
  return { type: 'Feature', properties, geometry: { type: 'MultiPolygon', coordinates: outers } }
}

function point(at: [number, number], properties: Record<string, unknown>): GeoFeature {
  const [lat, lon] = at
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } }
}

const hash = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)

/** The label of a polygon layer, as a point of its own: one per zone, not one per tile it crosses. */
function labelOf(f: GeoFeature | null, lens: string, props: Record<string, unknown>): GeoFeature | null {
  if (!f) return null
  const at = labelPoint(f.geometry.coordinates as Ring[][])
  return at ? { type: 'Feature', properties: { lens, ...props }, geometry: { type: 'Point', coordinates: at } } : null
}

/* --------------------------------------------------------------- build */

export type SyncResult = { addresses: number; seconds: number; unmatched: Record<string, number> }

export async function syncCivic({
  dir = civicDir(),
  force = false,
  log = (s: string) => console.log(`[civic] ${s}`),
}: { dir?: string; force?: boolean; log?: (s: string) => void } = {}): Promise<SyncResult> {
  const started = Date.now()
  mkdirSync(join(dir, 'raw'), { recursive: true })
  const stateFile = join(dir, 'raw', 'state.json')
  const state: CacheState = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}

  const addrFile = await cacheLayer(dir, 'addresses', state, force, log)
  const parcelFile = await cacheLayer(dir, 'parcels', state, force, log)
  writeFileSync(stateFile, JSON.stringify(state, null, 1))

  log('zones and places…')
  const L = LAYERS
  const [hg, hr, hb, mg, mr, mb, cg, cr, fl, su, co, pr, po, el, mi, hi, ho, se] = await Promise.all([
    all(L.hialeahGarbage, 'ZONE,SERVICE'),
    all(L.hialeahRecycling, 'ZONE_,SERVICE'),
    all(L.hialeahBulk, 'ZONE,SERVICE'),
    all(L.miamiGarbage, 'GARBROUTE,GARBDAY'),
    all(L.miamiRecycling, 'RECYDAY,RECYROUTE'),
    all(L.miamiBulk, 'TRASHDAY'),
    all(L.countyGarbage, 'ROUTE,WEEKDAYS'),
    all(L.countyRecycling, 'ROUTE,WEEKDAY,INSERVAREA'),
    all(L.flood, 'FZONE'),
    all(L.surge, 'ZONEID'),
    all(L.commission, 'ID,COMMNAME'),
    all(L.precinct, 'ID'),
    all(L.polling, 'PRECINCT,NAME,ADDRESS,PHONE'),
    all(L.elementary, 'ID,NAME,ADDRESS,ZIPCODE,PHONE,GRADES'),
    all(L.middle, 'ID,NAME,ADDRESS,ZIPCODE,PHONE,GRADES'),
    all(L.high, 'ID,NAME,ADDRESS,ZIPCODE,PHONE,GRADES'),
    all(L.house, 'ID,REPNAME'),
    all(L.senate, 'ID,SENNAME'),
  ])

  // Trash comes from whoever picks it up: Hialeah and Miami run their own;
  // the county runs unincorporated Miami-Dade and the cities it contracts for.
  const garbage = { hialeah: new Zones<Pickup>(), miami: new Zones<Pickup>(), county: new Zones<Pickup>() }
  const recycling = { hialeah: new Zones<Pickup>(), miami: new Zones<Pickup>(), county: new Zones<Pickup>() }
  const bulk = { hialeah: new Zones<Pickup>(), miami: new Zones<Pickup>() }
  garbage.hialeah.add(hg, (a) => str(a.SERVICE) || null, (a) => ({ by: 'hialeah', zone: str(a.ZONE), rule: parseRule(str(a.SERVICE)) }))
  recycling.hialeah.add(hr, (a) => str(a.SERVICE) || null, (a) => ({ by: 'hialeah', zone: str(a.ZONE_), rule: parseRule(str(a.SERVICE)) }))
  bulk.hialeah.add(hb, (a) => str(a.ZONE) || null, (a) => ({ by: 'hialeah', zone: str(a.ZONE), rule: parseRule(str(a.SERVICE)) }))
  garbage.miami.add(mg, (a) => str(a.GARBDAY) || null, (a) => ({ by: 'miami', zone: str(a.GARBROUTE), rule: parseDayLetters(str(a.GARBDAY)) }))
  recycling.miami.add(
    mr,
    (a) => `${str(a.RECYDAY)} ${str(a.RECYROUTE)}`,
    (a) => ({ by: 'miami', zone: str(a.RECYROUTE), rule: parseRule(`${str(a.RECYROUTE)} ${str(a.RECYDAY)}`) }),
  )
  bulk.miami.add(mb, (a) => str(a.TRASHDAY) || null, (a) => ({ by: 'miami', zone: str(a.TRASHDAY), rule: parseDayLetters(str(a.TRASHDAY)) }))
  garbage.county.add(cg, (a) => str(a.WEEKDAYS) || null, (a) => ({ by: 'county', zone: str(a.WEEKDAYS), rule: parseRule(str(a.WEEKDAYS)) }))
  // Every other week, with no published anchor for which week: the day, not the date.
  recycling.county.add(
    cr.filter((f) => str(f.attributes.INSERVAREA) === 'Y'),
    (a) => str(a.WEEKDAY) || null,
    (a) => {
      const r = parseRule(str(a.WEEKDAY))
      return { by: 'county', zone: str(a.WEEKDAY), rule: r ? { ...r, biweekly: true } : null }
    },
  )

  const pollingBy = new Map<number, PollingSite | null>(po.map((f) => [Number(f.attributes.PRECINCT), places([f])[0]]))
  const official = officialPolling()
  if (official) {
    const sites = new Map<number, OfficialPolling['rows']>()
    for (const r of official.rows) sites.set(r.precinct, [...(sites.get(r.precinct) ?? []), r])
    const need = new Map<string, number[]>()
    for (const p of [...pollingBy.keys()]) if (!sites.has(p)) pollingBy.delete(p)
    for (const [p, rows] of sites) {
      // Parts of a split precinct (123.0, 123.1) voting in different places: we can't tell which part an address is in.
      if (new Set(rows.map((r) => addressKey([r.address]))).size > 1) {
        pollingBy.set(p, null)
        continue
      }
      const site = rows[0]
      const layer = pollingBy.get(p)
      if (layer && addressKey([layer.address]) === addressKey([site.address])) {
        pollingBy.set(p, { ...layer, name: site.name, address: site.address })
      } else {
        pollingBy.set(p, { name: site.name, address: site.address, phone: '', at: null })
        const key = `${addressKey([site.address])}|${site.zip}`
        need.set(key, [...(need.get(key) ?? []), p])
      }
    }
    // A moved site has no coordinates in the list: find its address among the county's own address points.
    if (need.size) {
      for await (const r of lines(addrFile)) {
        const [num, pre, name, type, suf, zip5, , , , x, y] = r as [number, string, string, string, string, number, string, string, string, number, number]
        const key = addressKey([num, pre, name, type, suf])
        for (const k of [`${key}|${String(zip5 ?? '').slice(0, 5)}`, `${key}|`]) {
          const ps = need.get(k)
          if (!ps || typeof x !== 'number') continue
          for (const p of ps) {
            const site = pollingBy.get(p)
            if (site) site.at = [Math.round(y * 1e6) / 1e6, Math.round(x * 1e6) / 1e6]
          }
          need.delete(k)
        }
        if (!need.size) break
      }
    }
    log(`  polling places: the Supervisor of Elections' list for ${official.election} (${official.rows.length} rows)${need.size ? `; ${need.size} moved sites without coordinates` : ''}`)
  }
  const school = (a: Attrs) => ({ name: titleCase(str(a.NAME)), address: titleCase(str(a.ADDRESS)), zip: str(a.ZIPCODE), phone: phone(a.PHONE), grades: str(a.GRADES) })
  const z = {
    flood: new Zones<string>().add(fl, (a) => str(a.FZONE) || null, (a) => str(a.FZONE)),
    surge: new Zones<string>().add(su, (a) => str(a.ZONEID) || null, (a) => str(a.ZONEID)),
    commission: new Zones<{ district: number; name: string }>().add(co, (a) => str(a.ID) || null, (a) => ({ district: Number(a.ID), name: str(a.COMMNAME) })),
    precinct: new Zones<{ precinct: number; polling: PollingSite | null }>().add(pr, (a) => str(a.ID) || null, (a) => ({ precinct: Number(a.ID), polling: pollingBy.get(Number(a.ID)) ?? null })),
    elementary: new Zones<ReturnType<typeof school>>().add(el, (a) => str(a.ID) || null, school),
    middle: new Zones<ReturnType<typeof school>>().add(mi, (a) => str(a.ID) || null, school),
    high: new Zones<ReturnType<typeof school>>().add(hi, (a) => str(a.ID) || null, school),
    house: new Zones<{ district: number; name: string }>().add(ho, (a) => str(a.ID) || null, (a) => ({ district: Number(a.ID), name: str(a.REPNAME) })),
    senate: new Zones<{ district: number; name: string }>().add(se, (a) => str(a.ID) || null, (a) => ({ district: Number(a.ID), name: str(a.SENNAME) })),
  }

  const [cf, mf, cp, mp, cl, ml, ck, mk, hs] = await Promise.all([
    all(L.countyFire, 'NAME,ADDRESS'),
    all(L.cityFire, 'NAME,ADDRESS'),
    all(L.countyPolice, 'NAME,ADDRESS,PHONE'),
    all(L.cityPolice, 'NAME,ADDRESS,PHONE'),
    all(L.countyLibrary, 'BRANCH,ADDRESS,PHONE,WKDAY'),
    all(L.cityLibrary, 'BRANCH,ADDRESS,PHONE'),
    all(L.countyPark, 'NAME,ADDRESS,PHONE,DEVELOP'),
    all(L.cityPark, 'NAME,ADDRESS,PHONE,DEVELOP'),
    all(L.hospital, 'NAME,ADDRESS,PHONE'),
  ])
  const developed = (a: Attrs) => !/^(no|undeveloped)$/i.test(str(a.DEVELOP))
  const placeLists = {
    fire: [
      ...places(cf, (a) => `Fire Station ${str(a.NAME)}`.replace(/^Fire Station (.*Station.*)$/i, '$1')),
      ...places(mf),
    ],
    police: [...places(cp), ...places(mp)],
    library: [...places(cl, undefined, (a) => !/closed/i.test(str(a.WKDAY))), ...places(ml)],
    park: [...places(ck, undefined, developed), ...places(mk, undefined, developed)],
    hospital: places(hs),
  }

  log('map layers…')
  const cityF = await all(L.cities, 'NAME')
  const rings = (f: Feature) => f.geometry?.rings ?? []
  const keep = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x != null)
  const mapLayers: Record<string, GeoFeature[]> = {}
  const labels: GeoFeature[] = []
  const polygons = (lens: string, items: { f: Feature; props: Record<string, unknown>; label?: Record<string, unknown> }[]) => {
    const out: GeoFeature[] = []
    for (const { f, props, label } of items) {
      const g = toGeo(rings(f), props)
      if (!g) continue
      out.push(g)
      if (label) {
        const l = labelOf(g, lens, label)
        if (l) labels.push(l)
      }
    }
    mapLayers[lens] = out
  }
  polygons(
    'garbage',
    [
      ...hg.map((f) => ({ f, rule: parseRule(str(f.attributes.SERVICE)), by: 'hialeah' })),
      ...mg.map((f) => ({ f, rule: parseDayLetters(str(f.attributes.GARBDAY)), by: 'miami' })),
      ...cg.map((f) => ({ f, rule: parseRule(str(f.attributes.WEEKDAYS)), by: 'county' })),
    ]
      .filter((g) => g.rule)
      .map(({ f, rule, by }) => ({ f, props: { days: daysKey(rule!.days), by }, label: { days: daysKey(rule!.days), minz: 13 } })),
  )
  // Only the zones FEMA calls high-risk (A…, V…): the rest of the county is X.
  polygons('flood', fl.filter((f) => /^[AV]/.test(str(f.attributes.FZONE))).map((f) => ({ f, props: { zone: str(f.attributes.FZONE) } })))
  polygons('surge', su.filter((f) => str(f.attributes.ZONEID)).map((f) => ({ f, props: { zone: str(f.attributes.ZONEID) }, label: { zone: str(f.attributes.ZONEID), minz: 11 } })))
  polygons(
    'commission',
    co.map((f) => {
      const p = { district: Number(f.attributes.ID), name: str(f.attributes.COMMNAME) }
      return { f, props: p, label: p }
    }),
  )
  polygons('precinct', pr.map((f) => ({ f, props: { precinct: Number(f.attributes.ID) }, label: { precinct: Number(f.attributes.ID), minz: 14 } })))
  polygons(
    'elementary',
    el.map((f) => {
      const name = titleCase(str(f.attributes.NAME))
      return { f, props: { name, c: Math.abs(hash(name)) % 13 }, label: { name, minz: 12 } }
    }),
  )
  polygons(
    'cities',
    cityF.map((f) => {
      const name = titleCase(str(f.attributes.NAME))
      return { f, props: { name }, label: /^Unincorporated/.test(name) ? undefined : { name } }
    }),
  )
  mapLayers.polling = keep([...pollingBy].map(([n, p]) => (p?.at ? point(p.at, { precinct: n, name: p.name, address: p.address }) : null)))
  mapLayers.places = Object.entries(placeLists).flatMap(([kind, list]) => list.map((p) => point(p.at, { kind, name: p.name, address: p.address, phone: p.phone })))
  log(`  ${JSON.stringify(Object.fromEntries(Object.entries(mapLayers).map(([k, v]) => [k, v.length])))}, ${labels.length} labels`)

  /* ---- the database, built beside the live one ---- */
  const live = dbPath(dir)
  const tmp = `${live}.tmp`
  rmSync(tmp, { force: true })
  const db = createClient({ url: `file:${tmp}` })
  try {
    await db.executeMultiple(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE parcel (folio TEXT PRIMARY KEY, kind INTEGER NOT NULL) WITHOUT ROWID;
      CREATE TABLE stage (
        key TEXT NOT NULL, zip INTEGER NOT NULL, munic INTEGER NOT NULL, city INTEGER NOT NULL,
        lat INTEGER NOT NULL, lon INTEGER NOT NULL, folio TEXT,
        garbage INTEGER, recycling INTEGER, bulk INTEGER, flood INTEGER, surge INTEGER, commission INTEGER,
        precinct INTEGER, elementary INTEGER, middle INTEGER, high INTEGER, house INTEGER, senate INTEGER
      );
    `)

    log('land use…')
    await insertMany(db, 'INSERT OR IGNORE INTO parcel (folio, kind) VALUES', 2, lines(parcelFile), (r) => {
      const [folio, code] = r as [string, string]
      return folio ? [String(folio), kindFromDor(code)] : null
    })

    log('matching addresses to zones…')
    // Trash tables merge the three sources; each address points into the merged table.
    const merged = { garbage: [] as Pickup[], recycling: [] as Pickup[], bulk: [] as Pickup[] }
    const offsets: Record<string, number> = {}
    for (const kind of ['garbage', 'recycling', 'bulk'] as const) {
      const sources = kind === 'bulk' ? bulk : kind === 'garbage' ? garbage : recycling
      for (const [by, zones] of Object.entries(sources)) {
        offsets[`${kind}:${by}`] = merged[kind].length
        merged[kind].push(...zones.rows)
      }
    }
    // County-served homes book bulk trash by appointment instead of a day.
    const countyBulk = merged.bulk.push({ by: 'county', zone: '', rule: null, appointment: true }) - 1
    const pick = (kind: 'garbage' | 'recycling' | 'bulk', by: string, zones: Zones<Pickup> | undefined, x: number, y: number) => {
      const i = zones ? zones.find(x, y) : -1
      return i < 0 ? -1 : offsets[`${kind}:${by}`] + i
    }

    const unmatched: Record<string, number> = {}
    const miss = (k: string, v: number) => {
      if (v < 0) unmatched[k] = (unmatched[k] ?? 0) + 1
      return v
    }
    // City names are stored once and referred to by number; coordinates as
    // integers of 1e-5 degree (about a metre). Keeps the file a third the size.
    const names: string[] = []
    const nameId = new Map<string, number>()
    const id = (s2: string) => {
      let i = nameId.get(s2)
      if (i === undefined) {
        i = names.push(s2) - 1
        nameId.set(s2, i)
      }
      return i
    }
    let n = 0
    const rows = async function* () {
      for await (const r of lines(addrFile)) {
        const [num, pre, name, type, suf, zip5, munic, mailing, folio, x, y] = r as [number, string, string, string, string, number, string, string, string, number, number]
        if (!num || !name || typeof x !== 'number' || typeof y !== 'number') continue
        const key = addressKey([num, pre, name, type, suf])
        const zip = Number(String(zip5 ?? '').slice(0, 5)) || 0
        const m = str(munic).toUpperCase()
        const by = m === 'HIALEAH' ? 'hialeah' : m === 'MIAMI' ? 'miami' : 'county'
        const g = pick('garbage', by, garbage[by], x, y)
        const rc = pick('recycling', by, recycling[by], x, y)
        const b = by === 'county' ? (g >= 0 ? countyBulk : -1) : pick('bulk', by, bulk[by as 'hialeah' | 'miami'], x, y)
        n++
        yield [
          key, zip, id(m), id(str(mailing).toUpperCase() || m), Math.round(y * 1e5), Math.round(x * 1e5),
          str(folio) || null, miss(`garbage:${by}`, g), rc, b, miss('flood', z.flood.find(x, y)), z.surge.find(x, y),
          miss('commission', z.commission.find(x, y)), miss('precinct', z.precinct.find(x, y)), z.elementary.find(x, y),
          z.middle.find(x, y), z.high.find(x, y), miss('house', z.house.find(x, y)), miss('senate', z.senate.find(x, y)),
        ]
      }
    }
    await insertMany(
      db,
      `INSERT INTO stage (key, zip, munic, city, lat, lon, folio, garbage, recycling, bulk, flood, surge,
        commission, precinct, elementary, middle, high, house, senate) VALUES`,
      19,
      rows(),
      (r) => r as (string | number | null)[],
    )
    log(`  unmatched ${JSON.stringify(unmatched)}`)

    log('compacting…')
    // One row per address: some are listed once per building of a complex, so
    // the copies collapse into a count. The address is the table's key, which
    // makes the prefix search an index walk with no second index to store.
    await db.executeMultiple(`
      CREATE TABLE addr (
        key TEXT NOT NULL, zip INTEGER NOT NULL, munic INTEGER NOT NULL, city INTEGER NOT NULL,
        lat INTEGER NOT NULL, lon INTEGER NOT NULL, units INTEGER NOT NULL, kind INTEGER NOT NULL,
        garbage INTEGER, recycling INTEGER, bulk INTEGER, flood INTEGER, surge INTEGER, commission INTEGER,
        precinct INTEGER, elementary INTEGER, middle INTEGER, high INTEGER, house INTEGER, senate INTEGER,
        PRIMARY KEY (key, zip)
      ) WITHOUT ROWID;
      INSERT INTO addr
        SELECT s.key, s.zip, s.munic, s.city, s.lat, s.lon, g.c,
          COALESCE((SELECT kind FROM parcel WHERE parcel.folio = s.folio), ${KIND.unknown}),
          s.garbage, s.recycling, s.bulk, s.flood, s.surge, s.commission, s.precinct, s.elementary, s.middle, s.high, s.house, s.senate
        FROM stage s
        JOIN (SELECT MIN(rowid) AS keep, COUNT(*) AS c FROM stage GROUP BY key, zip) g ON s.rowid = g.keep
        ORDER BY s.key, s.zip;
      DROP TABLE stage;
      DROP TABLE parcel;
    `)
    n = Number((await db.execute('SELECT COUNT(*) AS n FROM addr')).rows[0].n)

    log('where to vote…')
    // Each precinct goes wherever its addresses are: the municipality the
    // county writes on each address, and for unincorporated addresses the
    // commission district they fall in.
    // While the Supervisor of Elections' list is the source, a precinct the
    // county still draws but the list leaves out (100 on 2026-10-07) votes
    // nowhere this election, so it is on no page.
    const listed = official ? new Set(official.rows.map((r) => r.precinct)) : null
    const spread = (await db.execute('SELECT DISTINCT precinct, munic, commission FROM addr WHERE precinct >= 0')).rows
    const placements: VotePlacement[] = spread
      .map((r) => ({
        precinct: z.precinct.rows[Number(r.precinct)].precinct,
        munic: names[Number(r.munic)] ?? '',
        district: r.commission != null && Number(r.commission) >= 0 ? (z.commission.rows[Number(r.commission)]?.district ?? null) : null,
      }))
      .filter((p) => !listed || listed.has(p.precinct))
    // A precinct with no address point in it (nine on 2026-10-07, each with a
    // polling place) goes by where its own area lies: the city boundary and
    // the commission district around a point inside it.
    const placed = new Set(placements.map((p) => p.precinct))
    const cityZones = new Zones<string>().add(cityF, (a) => str(a.NAME) || null, (a) => str(a.NAME).toUpperCase())
    const byArea: number[] = []
    for (const f of pr) {
      const precinct = Number(f.attributes.ID)
      if (placed.has(precinct) || (listed && !listed.has(precinct))) continue
      const g = toGeo(rings(f), {})
      const at = g ? labelPoint(g.geometry.coordinates as Ring[][]) : null
      if (!at) continue
      const ci = cityZones.find(at[0], at[1])
      if (ci < 0) continue
      const co = z.commission.find(at[0], at[1])
      placements.push({ precinct, munic: cityZones.rows[ci], district: co >= 0 ? z.commission.rows[co].district : null })
      placed.add(precinct)
      byArea.push(precinct)
    }
    const areas = voteAreas(placements)
    const unlisted = listed ? z.precinct.rows.map((r) => r.precinct).filter((p) => !listed.has(p)) : []
    const unplaced = z.precinct.rows.map((r) => r.precinct).filter((p) => !placed.has(p) && !unlisted.includes(p))
    log(
      `  ${areas.length} pages; by area: ${byArea.join(', ') || 'none'}; not on the list: ${unlisted.join(', ') || 'none'}; unplaced: ${unplaced.join(', ') || 'none'}`,
    )
    const latest = latestOfficialPolling()

    log('storm surge…')
    // Every address counted by municipality, ZIP, surge zone and whether its
    // parcel is a mobile home. Counts only: no address leaves the database.
    const surgeRows = (
      await db.execute(`SELECT munic, zip, surge, kind = ${KIND.mobile} AS mobile, COUNT(*) AS n FROM addr GROUP BY munic, zip, surge, mobile`)
    ).rows
    const surge = surgeSummary(
      surgeRows.map((r) => ({
        munic: names[Number(r.munic)] ?? '',
        zip: Number(r.zip) ? String(r.zip).padStart(5, '0') : '',
        zone: r.surge != null && Number(r.surge) >= 0 ? (z.surge.rows[Number(r.surge)] ?? null) : null,
        mobile: Number(r.mobile) === 1,
        n: Number(r.n),
      })),
      z.surge.rows,
    )
    log(`  ${JSON.stringify(surge.county)}`)

    const fetchedAt = new Date().toISOString().slice(0, 10)
    const meta: Record<string, unknown> = {
      fetchedAt,
      names,
      zones: { ...merged, ...Object.fromEntries(Object.entries(z).map(([k, v]) => [k, v.rows])) },
      places: placeLists,
      sources: Object.fromEntries(Object.entries(LAYERS).map(([k, v]) => [k, v])),
      // Where the Election Day sites came from: the Supervisor of Elections' list, or the county layer.
      pollingSource: official
        ? { by: official.by, url: official.source, election: official.election, electionName: official.electionName, published: official.published }
        : { by: 'Miami-Dade County', url: LAYERS.polling, election: null, electionName: null, published: null },
      // The "where to vote" pages. `lastElection` is the newest official list
      // we hold, past or not, so the pages can say when its election is over.
      // Storm-surge planning zones: address counts by city, ZIP and zone.
      surge,
      vote: {
        areas,
        byArea,
        unlisted,
        unplaced,
        lastElection: latest
          ? { election: latest.election, electionName: latest.electionName, published: latest.published, url: latest.source, by: latest.by }
          : null,
      },
      counts: { addresses: n, unmatched },
    }
    await db.batch(
      Object.entries(meta).map(([key, value]) => ({ sql: 'INSERT INTO meta (key, value) VALUES (?, ?)', args: [key, JSON.stringify(value)] })),
      'write',
    )
    log('map tiles…')
    const t = await buildTiles(db, mapLayers, labels)
    log(`  ${t.tiles} tiles, ${Math.round(t.bytes / 1e6)} MB`)
    await db.execute('VACUUM')
    db.close()
    renameSync(tmp, live)
    writeFileSync(schemaFile(dir), String(SCHEMA))
    // Schema 1 kept the map as GeoJSON files; the tiles replaced them.
    rmSync(join(dir, 'map'), { recursive: true, force: true })
    const seconds = Math.round((Date.now() - started) / 1000)
    log(`done: ${n} addresses in ${seconds}s, ${Math.round(statSync(live).size / 1e6)} MB`)
    return { addresses: n, seconds, unmatched }
  } catch (err) {
    db.close()
    rmSync(tmp, { force: true })
    throw err
  }
}

/** Multi-row INSERTs, a few hundred rows a statement and a few statements a transaction. */
async function insertMany<T>(
  db: Client,
  head: string,
  cols: number,
  source: AsyncIterable<T>,
  toRow: (r: T) => (string | number | null)[] | null,
) {
  const perStatement = Math.floor(30000 / cols)
  const placeholder = `(${Array(cols).fill('?').join(',')})`
  let rows: (string | number | null)[][] = []
  let batch: InStatement[] = []
  const flushStatement = () => {
    if (!rows.length) return
    batch.push({ sql: `${head} ${rows.map(() => placeholder).join(',')}`, args: rows.flat() })
    rows = []
  }
  const flushBatch = async () => {
    flushStatement()
    if (batch.length) await db.batch(batch, 'write')
    batch = []
  }
  for await (const r of source) {
    const row = toRow(r)
    if (!row) continue
    rows.push(row)
    if (rows.length >= perStatement) {
      flushStatement()
      if (batch.length >= 8) await flushBatch()
    }
  }
  await flushBatch()
}

/** True when the database is missing or older than `maxAgeDays`. */
export function civicStale(maxAgeDays = 30, dir = civicDir()): boolean {
  const p = dbPath(dir)
  if (!existsSync(p)) return true
  if (civicSchemaOnDisk(dir) !== SCHEMA) return true
  return Date.now() - statSync(p).mtimeMs > maxAgeDays * 86_400_000
}

let running: Promise<SyncResult> | null = null

/**
 * Starts a sync if the data is missing or a month old, once per process. Never
 * throws: a failed sync leaves the last good database in place.
 */
export function ensureCivic(): void {
  if (running || process.env.CIVIC_SYNC === 'off' || !civicStale()) return
  running = syncCivic()
  running
    .catch((err) => console.error('[civic] sync failed, keeping the last good data:', err))
    .finally(() => {
      running = null
    })
}
