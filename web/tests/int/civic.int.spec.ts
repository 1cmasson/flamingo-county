import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  addressKey,
  kindFromDor,
  KIND,
  matchesRule,
  nextDates,
  normalizeAddress,
  parseDayLetters,
  parseRule,
  PolygonIndex,
  prettyAddress,
  rrule,
  simplifyRing,
  slugOf,
} from '@/lib/civicGeo'
import { buildTiles, labelPoint } from '@/lib/civicTiles'

/**
 * The address page turns the cities' pickup rules ("1ST and 3RD Tuesday",
 * "TF") into dates. A wrong date gets someone a fine for bulk trash put out
 * early, so the rules are pinned against a real month: October 2026 starts on
 * a Thursday.
 */
describe('pickup rules', () => {
  it('reads the shapes the county and the cities write', () => {
    expect(parseRule('Monday & Thursday')).toEqual({ days: [1, 4], weeks: null })
    expect(parseRule('Tuesday Friday')).toEqual({ days: [2, 5], weeks: null })
    expect(parseRule('1ST and 3RD Tuesday')).toEqual({ days: [2], weeks: [1, 3] })
    expect(parseRule('1 & 3 Friday')).toEqual({ days: [5], weeks: [1, 3] })
    expect(parseRule('2nd Friday')).toEqual({ days: [5], weeks: [2] })
    expect(parseRule('whenever')).toBeNull()
    expect(parseDayLetters('TF')).toEqual({ days: [2, 5], weeks: null })
    expect(parseDayLetters('R')).toEqual({ days: [4], weeks: null })
  })

  it('finds the nth weekday of the month', () => {
    const second = parseRule('2nd Friday')!
    expect(matchesRule(second, '2026-10-02')).toBe(false)
    expect(matchesRule(second, '2026-10-09')).toBe(true)
  })

  it('counts today, and rolls into next month', () => {
    expect(nextDates(parseRule('Monday & Thursday')!, '2026-10-08', 3)).toEqual(['2026-10-08', '2026-10-12', '2026-10-15'])
    expect(nextDates(parseRule('1ST and 3RD Tuesday')!, '2026-10-21', 2)).toEqual(['2026-11-03', '2026-11-17'])
  })

  it('names no date for every-other-week with no known anchor', () => {
    const r = { ...parseRule('Wednesday')!, biweekly: true }
    expect(nextDates(r, '2026-10-07')).toEqual([])
    expect(rrule(r)).toBeNull()
  })

  it('writes the same rules for a calendar', () => {
    expect(rrule(parseRule('Monday & Thursday')!)).toBe('FREQ=WEEKLY;BYDAY=MO,TH')
    expect(rrule(parseRule('1ST and 3RD Tuesday')!)).toBe('FREQ=MONTHLY;BYDAY=1TU,3TU')
    expect(rrule(parseRule('2nd Friday')!)).toBe('FREQ=MONTHLY;BYDAY=2FR')
  })
})

describe('addresses', () => {
  it('reads an address the way people type it', () => {
    expect(normalizeAddress('5410 west 6th lane')).toEqual({ text: '5410 W 6 LN', zip: null })
    expect(normalizeAddress('5410 W. 6th Ln, Hialeah, FL 33012')).toEqual({ text: '5410 W 6 LN', zip: '33012' })
    expect(normalizeAddress('1201 W 44th Pl apt 3').text).toBe('1201 W 44 PL')
    expect(normalizeAddress('220 SW 31st Ave Miami').text).toBe('220 SW 31 AVE')
  })

  it('stores the county’s spelling under the same key', () => {
    expect(addressKey([5410, 'W', '6TH', 'LN', null])).toBe('5410 W 6 LN')
    expect(addressKey([900, null, 'ALHAMBRA', 'CIR', null])).toBe('900 ALHAMBRA CIR')
    expect(prettyAddress('5410 W 6 LN')).toBe('5410 W 6th Ln')
    expect(prettyAddress('251 E 11 ST')).toBe('251 E 11th St')
  })

  it('reads a building from its land-use code', () => {
    expect(kindFromDor('0101')).toBe(KIND.home)
    expect(kindFromDor('0802')).toBe(KIND.home)
    expect(kindFromDor('0201')).toBe(KIND.mobile)
    expect(kindFromDor('0407')).toBe(KIND.building)
    expect(kindFromDor('4837')).toBe(KIND.business)
    expect(kindFromDor(null)).toBe(KIND.unknown)
  })

  it('finds the polygon holding a point, holes included', () => {
    const idx = new PolygonIndex()
    const outer: [number, number][] = [[-80.3, 25.8], [-80.2, 25.8], [-80.2, 25.9], [-80.3, 25.9], [-80.3, 25.8]]
    const hole: [number, number][] = [[-80.26, 25.84], [-80.24, 25.84], [-80.24, 25.86], [-80.26, 25.86], [-80.26, 25.84]]
    idx.add([outer, hole], 7)
    expect(idx.find(-80.29, 25.81)).toBe(7)
    expect(idx.find(-80.25, 25.85)).toBe(-1)
    expect(idx.find(-80.1, 25.85)).toBe(-1)
  })
})

describe('map', () => {
  it('drops points that barely bend a line, and keeps the shape', () => {
    const wobbly: [number, number][] = [[0, 0], [0.5, 0.000001], [1, 0], [1, 1], [0, 1], [0, 0]]
    const out = simplifyRing(wobbly, 0.0001)
    expect(out).toHaveLength(5)
    expect(out[0]).toEqual(out[out.length - 1])
  })

  it('puts a label inside an L-shaped zone, not in its empty corner', () => {
    // An L: the bounding box's centre (0.5, 0.5) is outside it.
    const L: [number, number][] = [[0, 0], [1, 0], [1, 0.3], [0.3, 0.3], [0.3, 1], [0, 1], [0, 0]]
    const [x, y] = labelPoint([[L]])!
    expect(x < 0.3 || y < 0.3).toBe(true)
  })
})

describe('tiles', () => {
  it('cuts a zone into gzipped tiles from the county view in, and keeps detail layers off the far-out ones', async () => {
    const db = createClient({ url: 'file::memory:' })
    const square = { type: 'Feature' as const, properties: { district: 13 }, geometry: { type: 'MultiPolygon', coordinates: [[[[-80.4, 25.7], [-80.2, 25.7], [-80.2, 25.9], [-80.4, 25.9], [-80.4, 25.7]]]] } }
    const flood = { ...square, properties: { zone: 'AE' } }
    const { tiles } = await buildTiles(db, { commission: [square], flood: [flood] }, [])
    expect(tiles).toBeGreaterThan(7)
    const zooms = (await db.execute('SELECT DISTINCT z FROM tiles')).rows.map((r) => Number(r.z))
    expect(zooms).toEqual([8, 9, 10, 11, 12, 13, 14])
    const z0 = (await db.execute('SELECT data FROM tiles WHERE z = 8 LIMIT 1')).rows[0].data as ArrayBuffer
    const bytes = new Uint8Array(z0)
    expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]) // gzip
    const { gunzipSync } = await import('node:zlib')
    const far = gunzipSync(bytes).toString('latin1')
    expect(far).toContain('commission')
    expect(far).not.toContain('flood') // flood starts at zoom 10
    const near = (await db.execute('SELECT data FROM tiles WHERE z = 12 LIMIT 1')).rows[0].data as ArrayBuffer
    expect(gunzipSync(new Uint8Array(near)).toString('latin1')).toContain('flood')
    db.close()
  })
})

describe('privacy', () => {
  it('never asks the county for owners, mailing addresses, prices or values', async () => {
    const { ADDRESS_FIELDS, PARCEL_FIELDS } = await import('@/lib/civicSync')
    for (const f of [...ADDRESS_FIELDS.split(','), ...PARCEL_FIELDS.split(',')]) {
      expect(f).not.toMatch(/OWNER|MAILING_ADDR|PRICE|ASSESS|VAL|SALE|LEGAL/)
    }
  })
})

/** The page's queries, against a small database in the sync's layout. */
describe('lookups', () => {
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'civic-'))
    process.env.CIVIC_DIR = dir
    const db = createClient({ url: `file:${join(dir, 'civic.db')}` })
    await db.executeMultiple(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE addr (
        key TEXT NOT NULL, zip INTEGER NOT NULL, munic INTEGER NOT NULL, city INTEGER NOT NULL,
        lat INTEGER NOT NULL, lon INTEGER NOT NULL, units INTEGER NOT NULL, kind INTEGER NOT NULL,
        garbage INTEGER, recycling INTEGER, bulk INTEGER, flood INTEGER, surge INTEGER, commission INTEGER,
        precinct INTEGER, elementary INTEGER, middle INTEGER, high INTEGER, house INTEGER, senate INTEGER,
        PRIMARY KEY (key, zip)
      ) WITHOUT ROWID;
      INSERT INTO addr VALUES ('5410 W 6 AVE', 33012, 0, 0, 2587200, -8029500, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1);
      INSERT INTO addr VALUES ('5410 W 6 LN', 33012, 0, 0, 2587172, -8029677, 1, 0, 0, -1, 0, 0, 0, 0, 0, -1, -1, -1, -1, -1);
      INSERT INTO addr VALUES ('220 SW 31 AVE', 33135, 1, 1, 2576900, -8024900, 1, 3, -1, -1, -1, 1, 0, 0, 0, -1, -1, -1, -1, -1);
    `)
    const meta = {
      fetchedAt: '2026-10-07',
      names: ['HIALEAH', 'MIAMI'],
      zones: {
        garbage: [{ by: 'hialeah', zone: '1', rule: { days: [1, 4], weeks: null } }],
        recycling: [],
        bulk: [{ by: 'hialeah', zone: '2F', rule: { days: [5], weeks: [2] } }],
        flood: ['X', 'AE'],
        surge: ['D'],
        commission: [{ district: 13, name: 'Commissioner' }],
        precinct: [{ precinct: 318, polling: null }],
        elementary: [], middle: [], high: [], house: [], senate: [],
      },
      places: { fire: [], police: [], library: [], park: [], hospital: [] },
    }
    for (const [k, v] of Object.entries(meta)) await db.execute({ sql: 'INSERT INTO meta VALUES (?, ?)', args: [k, JSON.stringify(v)] })
    db.close()
  })

  it('suggests the stored address for partial and sloppy input', async () => {
    const { suggest } = await import('@/lib/civic')
    expect((await suggest('5410 w 6')).map((s) => s.label)).toEqual(['5410 W 6th Ave', '5410 W 6th Ln'])
    expect((await suggest('5410 6 ln')).map((s) => s.slug)).toEqual(['5410-w-6-ln-33012'])
    expect((await suggest('220 sw 31st ave, miami fl 33135'))[0]).toMatchObject({ city: 'Miami', zip: '33135' })
    expect(await suggest('5410 W 6 LN 33010')).toEqual([])
  })

  it('builds a report from a slug', async () => {
    const { addressReport } = await import('@/lib/civic')
    const r = (await addressReport(slugOf('5410 W 6 LN', '33012'), '2026-10-07'))!
    expect(r.trash.bulk?.next[0]).toBe('2026-10-09')
    expect(r.trash.garbage?.next[0]).toBe('2026-10-08')
    expect(r).toMatchObject({ munic: 'HIALEAH', flood: 'X', surge: 'D', precinct: 318 })
    const miami = (await addressReport('220-sw-31-ave-33135'))!
    expect(miami).toMatchObject({ city: 'MIAMI', kind: KIND.mobile, flood: 'AE', trash: { garbage: null } })
    expect(await addressReport('not-an-address')).toBeNull()
  })

  it('finds the address nearest a point', async () => {
    const { nearestAddress } = await import('@/lib/civic')
    expect((await nearestAddress([25.87172, -80.29677]))?.slug).toBe('5410-w-6-ln-33012')
    expect(await nearestAddress([25.5, -80.6])).toBeNull()
  })
})
