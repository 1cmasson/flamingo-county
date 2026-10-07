import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { createClient, type Client, type InStatement } from '@libsql/client'

import { addressKey, boxOf, daysKey, KIND, kindFromDor, parseDayLetters, parseRule, PolygonIndex, ringsContain, simplifyRing, titleCase, type Box, type Ring, type Rule } from './civicGeo'

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

/** Where the database and its raw caches live: the data volume in production. */
export function civicDir(): string {
  if (process.env.CIVIC_DIR) return process.env.CIVIC_DIR
  const db = process.env.DATABASE_URL ?? ''
  if (db.startsWith('file:')) return join(db.slice(5).replace(/[^/]*$/, ''), 'civic')
  return join(process.cwd(), '.civic')
}

export const dbPath = (dir = civicDir()) => join(dir, 'civic.db')
export const mapDir = (dir = civicDir()) => join(dir, 'map')

/** The map's layers, each a GeoJSON file in mapDir(). */
export const LENSES = ['garbage', 'flood', 'surge', 'commission', 'precinct', 'polling', 'elementary', 'cities', 'places'] as const
export type Lens = (typeof LENSES)[number]

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

type GeoFeature = { type: 'Feature'; bbox: Box; properties: Record<string, unknown>; geometry: unknown }

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
  return { type: 'Feature', bbox: boxOf(simple), properties, geometry: { type: 'MultiPolygon', coordinates: outers } }
}

function point(at: [number, number], properties: Record<string, unknown>): GeoFeature {
  const [lat, lon] = at
  return { type: 'Feature', bbox: [lon, lat, lon, lat], properties, geometry: { type: 'Point', coordinates: [lon, lat] } }
}

function writeLens(dir: string, lens: Lens, features: (GeoFeature | null)[]) {
  const out = features.filter((f): f is GeoFeature => !!f)
  writeFileSync(join(mapDir(dir), `${lens}.json.tmp`), JSON.stringify({ type: 'FeatureCollection', features: out }))
  renameSync(join(mapDir(dir), `${lens}.json.tmp`), join(mapDir(dir), `${lens}.json`))
  return out.length
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

  const pollingBy = new Map(po.map((f) => [Number(f.attributes.PRECINCT), places([f])[0]]))
  const school = (a: Attrs) => ({ name: titleCase(str(a.NAME)), address: titleCase(str(a.ADDRESS)), zip: str(a.ZIPCODE), phone: phone(a.PHONE), grades: str(a.GRADES) })
  const z = {
    flood: new Zones<string>().add(fl, (a) => str(a.FZONE) || null, (a) => str(a.FZONE)),
    surge: new Zones<string>().add(su, (a) => str(a.ZONEID) || null, (a) => str(a.ZONEID)),
    commission: new Zones<{ district: number; name: string }>().add(co, (a) => str(a.ID) || null, (a) => ({ district: Number(a.ID), name: str(a.COMMNAME) })),
    precinct: new Zones<{ precinct: number; polling: Place | null }>().add(pr, (a) => str(a.ID) || null, (a) => ({ precinct: Number(a.ID), polling: pollingBy.get(Number(a.ID)) ?? null })),
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
  mkdirSync(mapDir(dir), { recursive: true })
  const cityF = await all(L.cities, 'NAME')
  const rings = (f: Feature) => f.geometry?.rings ?? []
  const counts = {
    garbage: writeLens(dir, 'garbage', [
      ...hg.map((f) => ({ f, rule: parseRule(str(f.attributes.SERVICE)), by: 'hialeah' })),
      ...mg.map((f) => ({ f, rule: parseDayLetters(str(f.attributes.GARBDAY)), by: 'miami' })),
      ...cg.map((f) => ({ f, rule: parseRule(str(f.attributes.WEEKDAYS)), by: 'county' })),
    ].map(({ f, rule, by }) => (rule ? toGeo(rings(f), { days: daysKey(rule.days), by }) : null))),
    // Only the zones FEMA calls high-risk (A…, V…): the rest of the county is X.
    flood: writeLens(dir, 'flood', fl.filter((f) => /^[AV]/.test(str(f.attributes.FZONE))).map((f) => toGeo(rings(f), { zone: str(f.attributes.FZONE) }))),
    surge: writeLens(dir, 'surge', su.filter((f) => str(f.attributes.ZONEID)).map((f) => toGeo(rings(f), { zone: str(f.attributes.ZONEID) }))),
    commission: writeLens(dir, 'commission', co.map((f) => toGeo(rings(f), { district: Number(f.attributes.ID), name: str(f.attributes.COMMNAME) }))),
    precinct: writeLens(dir, 'precinct', pr.map((f) => toGeo(rings(f), { precinct: Number(f.attributes.ID) }))),
    polling: writeLens(dir, 'polling', [...pollingBy].filter(([, p]) => p).map(([n, p]) => point(p.at, { precinct: n, name: p.name, address: p.address }))),
    elementary: writeLens(dir, 'elementary', el.map((f) => toGeo(rings(f), { name: titleCase(str(f.attributes.NAME)) }))),
    cities: writeLens(dir, 'cities', cityF.map((f) => toGeo(rings(f), { name: titleCase(str(f.attributes.NAME)) }))),
    places: writeLens(
      dir,
      'places',
      Object.entries(placeLists).flatMap(([kind, list]) => list.map((p) => point(p.at, { kind, name: p.name, address: p.address, phone: p.phone }))),
    ),
  }
  log(`  ${JSON.stringify(counts)}`)

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

    const fetchedAt = new Date().toISOString().slice(0, 10)
    const meta: Record<string, unknown> = {
      fetchedAt,
      names,
      zones: { ...merged, ...Object.fromEntries(Object.entries(z).map(([k, v]) => [k, v.rows])) },
      places: placeLists,
      sources: Object.fromEntries(Object.entries(LAYERS).map(([k, v]) => [k, v])),
      counts: { addresses: n, unmatched },
    }
    await db.batch(
      Object.entries(meta).map(([key, value]) => ({ sql: 'INSERT INTO meta (key, value) VALUES (?, ?)', args: [key, JSON.stringify(value)] })),
      'write',
    )
    await db.execute('VACUUM')
    db.close()
    renameSync(tmp, live)
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
  if (!existsSync(p) || LENSES.some((l) => !existsSync(join(mapDir(dir), `${l}.json`)))) return true
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
