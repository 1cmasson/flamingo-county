import type { City, Listing, Story } from '../payload-types'

/**
 * Which directory city a story belongs to, for the links between them: the
 * city page's "Stories from Hialeah" row, the story's way back to its town,
 * and nothing else.
 *
 * A story about a business takes its city from the listing. Most stories have
 * no listing (Al Capone, the Supreme Court case), so the rest are mapped here
 * by slug, which needs no migration. Only stories that are clearly about one
 * of the directory's cities are in the map: a Miami story (Bezos, Mourning in
 * Overtown) is left out rather than filed under Little Havana. A new story
 * about a town is one line here.
 */
const STORY_CITY: Record<string, string> = {
  'hialeah-park-un-siglo': 'hialeah',
  'al-capone-in-hialeah': 'hialeah',
  'hialeah-supreme-court-lukumi': 'hialeah',
  'kc-park-hialeah': 'hialeah',
  'mike-fernandez': 'hialeah',
  // Cachao, whose comeback he produced, is buried in Miami Lakes; the story ends there.
  'andy-garcia': 'lakes',
  'calle-ocho-salsa-mural': 'havana',
}

/** The city slug for a story, or null. Reads `listing.city` when the story is populated to depth 2. */
export function storyCitySlug(story: Pick<Story, 'slug' | 'listing'>): string | null {
  const listing = story.listing && typeof story.listing === 'object' ? (story.listing as Listing) : null
  const city = listing?.city && typeof listing.city === 'object' ? (listing.city as City) : null
  return city?.slug ?? STORY_CITY[story.slug] ?? null
}
