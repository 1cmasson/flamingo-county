import type { VoteArea, VoteData, VotePrecinct } from './civic'

/**
 * The tables on the vote pages, worked out from `voteData()`. Pure, so the
 * pages and the tests read the same thing.
 */

/** Two precincts share a site when the list gives the same name and address (spacing and case aside). */
export function siteKey(p: VotePrecinct['polling']): string | null {
  if (!p) return null
  const norm = (s: string) => s.toUpperCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()
  return `${norm(p.name)}|${norm(p.address)}`
}

export type VoteRow = VotePrecinct & {
  /** The other precincts, anywhere in the county, that vote at the same site. */
  alsoHere: number[]
}

/** Every site, keyed, with the precincts that vote there. */
export function sitesOf(data: Pick<VoteData, 'precincts'>): Map<string, number[]> {
  const sites = new Map<string, number[]>()
  for (const p of data.precincts.values()) {
    const k = siteKey(p.polling)
    if (k) sites.set(k, [...(sites.get(k) ?? []), p.precinct])
  }
  for (const list of sites.values()) list.sort((a, b) => a - b)
  return sites
}

export function areaRows(area: VoteArea, data: Pick<VoteData, 'precincts'>, sites = sitesOf(data)): VoteRow[] {
  return area.precincts.map((precinct) => {
    const p = data.precincts.get(precinct) ?? { precinct, polling: null }
    const k = siteKey(p.polling)
    return { ...p, alsoHere: k ? (sites.get(k) ?? []).filter((x) => x !== precinct) : [] }
  })
}

/** How many precincts have a site, and how many distinct sites they vote at. */
export function counts(rows: VotePrecinct[]): { precincts: number; places: number } {
  const keys = rows.map((r) => siteKey(r.polling)).filter((k): k is string => !!k)
  return { precincts: rows.length, places: new Set(keys).size }
}

export function findArea(data: Pick<VoteData, 'areas'>, slug: string): VoteArea | null {
  return data.areas.find((a) => a.slug === slug) ?? null
}
