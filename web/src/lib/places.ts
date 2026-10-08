import type { CityCivic, PlacesData } from './civic'
import { UNINCORPORATED } from './civicSync'
import { areaRows, counts } from './vote'

/**
 * The city pages' answers, worked out from `placesData()`. Pure, so the pages
 * and the tests read the same thing.
 */

export type TrashMode =
  /** Hialeah and Miami publish their own routes: their zone tables. */
  | { kind: 'own'; by: 'hialeah' | 'miami' }
  /** Most addresses are on county routes: the county's day groups. */
  | { kind: 'county' }
  /** The county has (almost) no routes here and the records hold no schedule: say who does it, and stop. */
  | { kind: 'city' }

/** How many of a city's addresses each pickup provider's routes hold. */
export function trashProviders(city: CityCivic, data: Pick<PlacesData, 'zones'>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of city.garbage) {
    const by = data.zones.garbage[r.i]?.by
    if (by) out[by] = (out[by] ?? 0) + r.n
  }
  return out
}

/**
 * Who picks up the trash, as the records show it. A city whose own routes
 * cover most of it is "own"; one mostly on county routes is "county" (so is
 * the unincorporated county, always); the rest are cities that run their own
 * pickup without publishing routes we read.
 */
export function trashMode(city: CityCivic, data: Pick<PlacesData, 'zones'>): TrashMode {
  const p = trashProviders(city, data)
  if (city.munic === UNINCORPORATED) return { kind: 'county' }
  for (const by of ['hialeah', 'miami'] as const) if ((p[by] ?? 0) * 2 > city.total) return { kind: 'own', by }
  if ((p.county ?? 0) * 2 >= city.total) return { kind: 'county' }
  return { kind: 'city' }
}

/** FEMA's high-risk zones are the A and V zones (A, AE, AH, AO, VE…); D is undetermined, X is outside them. */
export const isHighRiskFlood = (zone: string) => /^[AV]/.test(zone)

export function floodHighRisk(city: CityCivic, data: Pick<PlacesData, 'zones'>): number {
  return city.flood.filter((r) => isHighRiskFlood(data.zones.flood[r.i] ?? '')).reduce((t, r) => t + r.n, 0)
}

/** The precincts a city's vote page lists (for the unincorporated county, every district's), and their sites. */
export function cityVote(city: CityCivic, data: Pick<PlacesData, 'vote' | 'precincts'>): { precincts: number; places: number; slugs: string[] } {
  const areas = data.vote.areas.filter((a) => a.munic === city.munic)
  const precincts = [...new Set(areas.flatMap((a) => a.precincts))]
  const rows = areaRows({ slug: city.slug, munic: city.munic, district: null, precincts }, data)
  const n = counts(rows.filter((r) => r.polling))
  return { precincts: precincts.length, places: n.places, slugs: areas.map((a) => a.slug) }
}
