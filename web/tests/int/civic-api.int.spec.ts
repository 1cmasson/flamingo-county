import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * The public civic tools for AI agents (/mcp and /api/civic/v1): what each
 * answers, the rate limit, the 503 while data builds, and that no query is
 * ever logged. Against a small database in the sync's layout.
 */

const ADDRESS = '5410 W 6 LN'

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'civic-api-'))
  process.env.CIVIC_DIR = dir
  const { SCHEMA } = await import('@/lib/civicStatus')
  writeFileSync(join(dir, 'schema'), String(SCHEMA))
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
    INSERT INTO addr VALUES ('5410 W 6 AVE', 33012, 0, 0, 2587200, -8029500, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, -1, -1, 0, 0);
    INSERT INTO addr VALUES ('5410 W 6 LN', 33012, 0, 0, 2587172, -8029677, 1, 0, 0, -1, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0);
    INSERT INTO addr VALUES ('100 MIRACLE MILE', 33134, 1, 1, 2575000, -8026000, 1, 2, -1, -1, -1, 0, -1, 0, -1, -1, -1, -1, 0, 0);
  `)
  const counts = (total: number, none: number, byZone: Record<string, number>) => ({ total, none, byZone })
  const meta = {
    fetchedAt: '2026-10-08',
    names: ['HIALEAH', 'CORAL GABLES'],
    zones: {
      garbage: [{ by: 'hialeah', zone: '1', rule: { days: [1, 4], weeks: null } }],
      recycling: [],
      bulk: [{ by: 'hialeah', zone: '2F', rule: { days: [5], weeks: [2] } }],
      flood: ['X'],
      surge: ['D'],
      commission: [{ district: 13, name: 'René Garcia' }],
      precinct: [{ precinct: 318, polling: { name: 'Hialeah Middle School', address: '6027 E 7 Ave', phone: '', at: null } }],
      elementary: [],
      middle: [],
      high: [],
      house: [{ district: 110, name: 'A 2022 name' }],
      senate: [{ district: 36, name: 'A 2022 name' }],
    },
    places: { fire: [], police: [], library: [], park: [], hospital: [] },
    pollingSource: {
      by: 'Miami-Dade County Supervisor of Elections',
      url: 'https://www.miamidade.gov/elections/library/2026-11-03-general-election-polling-place-list.pdf',
      election: '2026-11-03',
      electionName: '2026 General Election',
      published: '2026-09-30',
    },
    vote: {
      areas: [{ slug: 'hialeah', munic: 'HIALEAH', district: null, precincts: [318] }],
      byArea: [],
      unlisted: [],
      unplaced: [],
      lastElection: { election: '2026-11-03', electionName: '2026 General Election', published: '2026-09-30', url: 'x.pdf', by: 'Supervisor' },
    },
    surge: {
      zones: ['D'],
      county: counts(3, 2, { D: 1 }),
      mobile: counts(0, 0, {}),
      areas: [
        { slug: 'coral-gables', munic: 'CORAL GABLES', addresses: counts(1, 1, {}), mobile: counts(0, 0, {}), zips: [{ zip: '33134', ...counts(1, 1, {}) }] },
        { slug: 'hialeah', munic: 'HIALEAH', addresses: counts(2, 1, { D: 1 }), mobile: counts(0, 0, {}), zips: [{ zip: '33012', ...counts(2, 1, { D: 1 }) }] },
      ],
    },
    cities: [
      { slug: 'coral-gables', munic: 'CORAL GABLES', total: 1, garbage: [], recycling: [], bulk: [], flood: [{ i: 0, n: 1 }], districts: [{ district: 13, n: 1 }], fire: [], police: [] },
      { slug: 'hialeah', munic: 'HIALEAH', total: 2, garbage: [{ i: 0, n: 2 }], recycling: [], bulk: [{ i: 0, n: 2 }], flood: [{ i: 0, n: 2 }], districts: [{ district: 13, n: 2 }], fire: [], police: [] },
    ],
    districts: [{ district: 13, name: 'René Garcia', total: 3, areas: [], unincorporatedZips: [] }],
  }
  for (const [k, val] of Object.entries(meta)) await db.execute({ sql: 'INSERT INTO meta VALUES (?, ?)', args: [k, JSON.stringify(val)] })
  db.close()
})

afterEach(async () => {
  vi.restoreAllMocks()
  const { resetRateLimits } = await import('@/lib/civicApiHttp')
  resetRateLimits()
})

const shape = (r: { ok: boolean; text: string; sources?: unknown[]; fetchedAt?: string }) => {
  expect(r.ok).toBe(true)
  expect(r.text.length).toBeGreaterThan(10)
  expect(r.sources?.length).toBeGreaterThan(0)
  expect(r.fetchedAt).toBe('2026-10-08')
}

describe('civic tools', () => {
  it('find_address: matches typed text, Spanish by default', async () => {
    const { findAddress } = await import('@/lib/civicApi')
    const r = await findAddress('5410 w 6', 'es')
    shape(r)
    if (!r.ok) throw new Error()
    expect(r.data.results.map((x) => x.slug)).toEqual(['5410-w-6-ave-33012', '5410-w-6-ln-33012'])
    expect(r.data.results[1].page).toBe('https://flamingocounty.com/es/address?a=5410-w-6-ln-33012')
    expect(r.text).toMatch(/direcciones coinciden/)
  })

  it('address_report: what the page shows, no coordinates, district numbers only', async () => {
    const { addressReportTool } = await import('@/lib/civicApi')
    const r = await addressReportTool({ slug: '5410-w-6-ln-33012' }, 'en', '2026-10-08')
    shape(r)
    if (!r.ok) throw new Error()
    const d = r.data as ReturnType<typeof import('@/lib/civicApi').reportData>
    expect(d.trash.garbage).toMatchObject({ by: 'hialeah', days: 'Monday & Thursday', nextDates: ['2026-10-08', '2026-10-12', '2026-10-15'] })
    expect(d.trash.bulk?.days).toBe('2nd Friday of the month')
    expect(d).toMatchObject({ floodZone: 'X', surgeZone: 'D', stateHouseDistrict: 110, stateSenateDistrict: 36 })
    expect(d.electionDay).toMatchObject({ precinct: 318, place: { name: 'Hialeah Middle School' }, current: true })
    expect(d.page).toBe('https://flamingocounty.com/en/address?a=5410-w-6-ln-33012')
    const text = JSON.stringify(r)
    expect(text).not.toMatch(/"lat"|"lon"|"at":|A 2022 name|258717|8029677/)
  })

  it('address_report: an ambiguous address returns candidates, an exact one resolves', async () => {
    const { addressReportTool } = await import('@/lib/civicApi')
    const amb = await addressReportTool({ address: '5410 W 6' }, 'es')
    expect(amb).toMatchObject({ ok: false, error: 'ambiguous' })
    if (amb.ok) throw new Error()
    expect(amb.candidates).toHaveLength(2)
    const one = await addressReportTool({ address: '5410 W 6th Ln, Hialeah 33012' }, 'es')
    expect(one.ok).toBe(true)
  })

  it('polling_places: by city and by precinct, and says when the election is over', async () => {
    const { pollingPlaces } = await import('@/lib/civicApi')
    const city = await pollingPlaces({ city: 'Hialeah' }, 'es', '2026-10-08')
    shape(city)
    expect(city.text).toMatch(/^Hialeah tiene 1 precinto, que vota en 1 lugar\. Para el día de las elecciones, 2026-11-03\. La votación temprana es en otros lugares\.$/)
    const one = await pollingPlaces({ precinct: 318 }, 'en', '2026-10-08')
    shape(one)
    expect(one.text).toMatch(/Precinct 318: Hialeah Middle School/)
    const after = await pollingPlaces({ precinct: '318' }, 'es', '2026-11-04')
    expect(after.text).toMatch(/ya pasó/)
    if (!after.ok) throw new Error()
    expect((after.data as { election: { current: boolean } }).election.current).toBe(false)
    expect(await pollingPlaces({ precinct: 999 }, 'es')).toMatchObject({ ok: false, error: 'not_found' })
  })

  it('evacuation_zone_summary: the county, or one city by zone and ZIP', async () => {
    const { evacuationSummary } = await import('@/lib/civicApi')
    const all = await evacuationSummary({}, 'es')
    shape(all)
    const h = await evacuationSummary({ city: 'hialeah' }, 'es')
    shape(h)
    expect(h.text).toMatch(/1 de las 2 direcciones de Hialeah/)
  })

  it('trash_schedule: routes where the records hold them, never an invented schedule', async () => {
    const { trashSchedule } = await import('@/lib/civicApi')
    const h = await trashSchedule({ city: 'Hialeah' }, 'es')
    shape(h)
    if (!h.ok) throw new Error()
    expect((h.data as { handledBy: string }).handledBy).toBe('hialeah')
    const g = await trashSchedule({ city: 'Coral Gables' }, 'es')
    shape(g)
    if (!g.ok) throw new Error()
    expect((g.data as { schedule: unknown }).schedule).toBeNull()
    expect(g.text).toMatch(/la maneja la ciudad de Coral Gables/)
  })

  it('never logs the query', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const api = await import('@/lib/civicApi')
    await api.findAddress(ADDRESS, 'es')
    await api.addressReportTool({ address: ADDRESS }, 'es')
    await api.addressReportTool({ address: '99999 nowhere st' }, 'es')
    await api.pollingPlaces({ city: 'Hialeah' }, 'es')
    await api.evacuationSummary({ city: 'Hialeah' }, 'es')
    await api.trashSchedule({ city: 'Hialeah' }, 'es')
    const { POST } = await import('@/app/mcp/route')
    await POST(mcp([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'address_report', arguments: { address: ADDRESS } } }]))
    const logged = spies.flatMap((s) => s.mock.calls.flat()).map(String).join('\n')
    expect(logged).not.toMatch(/5410|nowhere/i)
  })
})

describe('rate limit and readiness', () => {
  it('allows 60 a minute per client and tool, then asks to wait', async () => {
    const { rateLimit } = await import('@/lib/civicApiHttp')
    const t0 = 1_000_000
    for (let i = 0; i < 60; i++) expect(rateLimit('1.2.3.4', 'find_address', t0 + i)).toBeNull()
    expect(rateLimit('1.2.3.4', 'find_address', t0 + 1000)).toBe(59)
    // Another tool, or another client, has its own count; the next minute starts over.
    expect(rateLimit('1.2.3.4', 'trash_schedule', t0 + 1000)).toBeNull()
    expect(rateLimit('5.6.7.8', 'find_address', t0 + 1000)).toBeNull()
    expect(rateLimit('1.2.3.4', 'find_address', t0 + 60_000)).toBeNull()
  })

  it('answers 429 with Retry-After past the limit, with the API headers', async () => {
    const { GET } = await import('@/app/api/civic/v1/trash-schedule/route')
    const { NextRequest } = await import('next/server')
    const req = () => new NextRequest('https://flamingocounty.com/api/civic/v1/trash-schedule?city=hialeah', { headers: { 'cf-connecting-ip': '9.9.9.9' } })
    for (let i = 0; i < 60; i++) expect((await GET(req())).status).toBe(200)
    const res = await GET(req())
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(res.headers.get('x-robots-tag')).toMatch(/noindex/)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('answers 503 with Retry-After while the database is in an older layout', async () => {
    const { serveTool } = await import('@/lib/civicApiHttp')
    const dir = process.env.CIVIC_DIR!
    writeFileSync(join(dir, 'schema'), '1')
    try {
      const res = await serveTool(new Request('https://x/api'), 'find_address', async () => {
        throw new Error('must not run')
      })
      expect(res.status).toBe(503)
      expect(res.headers.get('retry-after')).toBe('600')
    } finally {
      const { SCHEMA } = await import('@/lib/civicStatus')
      writeFileSync(join(dir, 'schema'), String(SCHEMA))
    }
  })
})

function mcp(body: unknown) {
  return new Request('https://flamingocounty.com/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  })
}

describe('MCP server', () => {
  it('initializes, lists five read-only tools and answers a call with structured content', async () => {
    const { POST } = await import('@/app/mcp/route')
    const init = await POST(
      mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
    )
    expect(init.status).toBe(200)
    expect((await init.json()).result.serverInfo.name).toBe('flamingo-county-civic')
    const list = await (await POST(mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }))).json()
    const tools = list.result.tools as { name: string; annotations: { readOnlyHint: boolean } }[]
    expect(tools.map((t) => t.name).sort()).toEqual(['address_report', 'evacuation_zone_summary', 'find_address', 'polling_places', 'trash_schedule'])
    expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true)
    const call = await (
      await POST(mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'trash_schedule', arguments: { city: 'Hialeah', lang: 'en' } } }))
    ).json()
    expect(call.result.structuredContent).toMatchObject({ ok: true, tool: 'trash_schedule', lang: 'en' })
    expect(call.result.content[0].text).toMatch(/City of Hialeah/)
  })
})
