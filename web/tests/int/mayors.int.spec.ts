import { existsSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import raw from '../../src/data/civic/mayors.json'
import { ballotNote, cityMayor, CITY_MAYORS, COUNTY_MAYOR, selectionText } from '@/lib/mayors'

/**
 * The mayors file (src/data/civic/mayors.json): one entry per municipality,
 * each with an https source and a checked date, and only public fields
 * leaving lib/mayors.ts.
 */

/** Miami-Dade's 34 municipalities, as the county's Municipalitypoly_gdb layer and the address list name them (2026-10-07). */
const MUNICIPALITIES = [
  'AVENTURA', 'BAL HARBOUR', 'BAY HARBOR ISLANDS', 'BISCAYNE PARK', 'CORAL GABLES', 'CUTLER BAY', 'DORAL', 'EL PORTAL',
  'FLORIDA CITY', 'GOLDEN BEACH', 'HIALEAH', 'HIALEAH GARDENS', 'HOMESTEAD', 'INDIAN CREEK VILLAGE', 'KEY BISCAYNE', 'MEDLEY',
  'MIAMI', 'MIAMI BEACH', 'MIAMI GARDENS', 'MIAMI LAKES', 'MIAMI SHORES', 'MIAMI SPRINGS', 'NORTH BAY VILLAGE', 'NORTH MIAMI',
  'NORTH MIAMI BEACH', 'OPA-LOCKA', 'PALMETTO BAY', 'PINECREST', 'SOUTH MIAMI', 'SUNNY ISLES BEACH', 'SURFSIDE', 'SWEETWATER',
  'VIRGINIA GARDENS', 'WEST MIAMI',
]

const exactlyOnce = (municipalities: string[]) => {
  for (const m of municipalities) expect(CITY_MAYORS.filter((x) => x.munic === m), m).toHaveLength(1)
  expect(CITY_MAYORS).toHaveLength(municipalities.length)
}

describe('mayors', () => {
  it('has exactly one entry for every municipality', () => {
    exactlyOnce(MUNICIPALITIES)
  })

  it('matches the municipalities of a real address database, when one is at hand (CIVIC_TEST_DB)', async () => {
    const path = process.env.CIVIC_TEST_DB
    if (!path || !existsSync(path)) return
    const db = createClient({ url: `file:${path}` })
    const names = JSON.parse(String((await db.execute("SELECT value FROM meta WHERE key = 'names'")).rows[0].value)) as string[]
    const munics = (await db.execute('SELECT DISTINCT munic FROM addr')).rows.map((r) => names[Number(r.munic)])
    db.close()
    exactlyOnce(munics.filter((m) => m !== 'UNINCORPORATED MIAMI-DADE').sort())
  })

  it('cites every mayor over https, with the day it was checked', () => {
    for (const m of [COUNTY_MAYOR, ...CITY_MAYORS]) {
      expect(m.sourceUrl, m.name).toMatch(/^https:\/\//)
      expect(m.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['elected', 'council']).toContain(m.selection)
    }
    expect(COUNTY_MAYOR.name).toBe('Daniella Levine Cava')
  })

  it('lets only the public fields out: never confidence, notes or quotes', () => {
    const out = JSON.stringify([COUNTY_MAYOR, ...CITY_MAYORS])
    expect(out).not.toMatch(/confidence|termNote|sourceSays/)
    expect(raw.municipalities.some((m) => 'confidence' in m)).toBe(true) // still kept in the file, for us
  })

  it('has no city mayor for the unincorporated county', () => {
    expect(cityMayor('UNINCORPORATED MIAMI-DADE')).toBeNull()
    expect(cityMayor('HIALEAH')?.name).toBe('Bryan Calvo')
  })

  it('notes a mayor on the 2026-11-03 ballot until the runoffs are over, then stops', () => {
    const cutler = cityMayor('CUTLER BAY')
    const gables = cityMayor('CORAL GABLES')
    const hialeah = cityMayor('HIALEAH')
    expect(ballotNote(cutler, 'es', '2026-10-08')).toBe('El puesto de alcalde está en la boleta del 3 de noviembre de 2026.')
    expect(ballotNote(gables, 'en', '2026-12-15')).toBe('The mayor’s seat is on the Nov 3, 2026 ballot.')
    expect(ballotNote(cutler, 'es', '2026-12-16')).toBeNull()
    expect(ballotNote(hialeah, 'es', '2026-10-08')).toBeNull()
    // A council-chosen mayor isn't on the ballot itself; the note says it may change.
    expect(ballotNote(cityMayor('BISCAYNE PARK'), 'es', '2026-10-08')).toMatch(/puede cambiar/)
  })

  it('says how a mayor is chosen without gendering the person', () => {
    expect(selectionText('elected', 'es')).toBe('La alcaldía se decide por voto popular')
    expect(selectionText('council', 'en')).toBe('Chosen by the council from its members')
  })
})
