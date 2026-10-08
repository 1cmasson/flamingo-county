import type { Lang } from '../i18n'
import data from '../data/civic/mayors.json'
import { UNINCORPORATED } from './civicSync'

/**
 * Miami-Dade's mayors: the county's, and each of the 34 cities'. Read from
 * src/data/civic/mayors.json, checked against each government's own site
 * (the date is in the file). The county's open-data layers hold no city
 * mayors, so this file is the only source; nothing else names a mayor.
 *
 * Only the public fields leave this module: name, title, how the mayor is
 * chosen, the source and the day it was checked. The file's working notes
 * (termNote, sourceSays, confidence) stay in the file.
 *
 * Re-check after every election: see AEO-HANDOFF.md ("Mayors").
 */

export type Selection = 'elected' | 'council'
export type Mayor = { name: string; title: string; selection: Selection; sourceUrl: string; checked: string }
export type CityMayor = Mayor & { munic: string }

type Raw = { name: string; title: string; selection: string; sourceUrl: string; checked: string }
const pub = (m: Raw): Mayor => ({
  name: m.name,
  title: m.title,
  selection: m.selection === 'council' ? 'council' : 'elected',
  sourceUrl: m.sourceUrl,
  checked: m.checked,
})

export const MAYORS_CHECKED: string = data.checked
export const COUNTY_MAYOR: Mayor = pub(data.county)
export const CITY_MAYORS: CityMayor[] = data.municipalities.map((m) => ({ munic: m.munic, ...pub(m) }))

/** A city's mayor by the county's municipality name ("HIALEAH"); null for the unincorporated county or a name we don't hold. */
export function cityMayor(munic: string): CityMayor | null {
  if (!munic || munic === UNINCORPORATED) return null
  return CITY_MAYORS.find((m) => m.munic === munic) ?? null
}

/**
 * The cities whose mayor may change at the 2026-11-03 election: open seats
 * (and, in Biscayne Park, a council-chosen mayor whose council seat ends),
 * and incumbents facing a challenger. The note switches itself off after
 * the runoffs (2026-12-15), so it can never go stale; re-check the names then.
 */
const ON_BALLOT = new Set([
  'CUTLER BAY',
  'PALMETTO BAY',
  'OPA-LOCKA',
  'PINECREST',
  'KEY BISCAYNE',
  'BISCAYNE PARK',
  'CORAL GABLES',
  'NORTH MIAMI',
  'AVENTURA',
  'SUNNY ISLES BEACH',
  'EL PORTAL',
  'VIRGINIA GARDENS',
])
export const BALLOT_NOTE_UNTIL = '2026-12-15'

export function ballotNote(m: CityMayor | null, lang: Lang, today: string): string | null {
  if (!m || today > BALLOT_NOTE_UNTIL || !ON_BALLOT.has(m.munic)) return null
  if (m.selection === 'council')
    return lang === 'es'
      ? 'La alcaldía puede cambiar tras la elección del 3 de noviembre de 2026.'
      : 'The mayor may change after the Nov 3, 2026 election.'
  return lang === 'es' ? 'El puesto de alcalde está en la boleta del 3 de noviembre de 2026.' : 'The mayor’s seat is on the Nov 3, 2026 ballot.'
}

/** How the mayor is chosen, without gendering the person. */
export function selectionText(s: Selection, lang: Lang): string {
  if (lang === 'es') return s === 'council' ? 'La alcaldía la escoge el concejo entre sus miembros' : 'La alcaldía se decide por voto popular'
  return s === 'council' ? 'Chosen by the council from its members' : 'Elected by voters'
}

/** "hialeahfl.gov": the source's host, for a short link label. */
export const sourceHost = (url: string) => new URL(url).hostname.replace(/^www\./, '')
