/**
 * Categories the site assigns and a business cannot pick for itself.
 *
 * `gems` (FLAMINGO COUNTY GEM / JOYA DE FLAMINGO COUNTY) marks a place that has
 * been part of the city long enough to be one of its landmarks. That is the
 * directory's call to make, so the List Your Spot form does not offer it, and a
 * request that names it anyway is saved with no category rather than with this
 * one.
 */
export const EDITORIAL_CATEGORIES: readonly string[] = ['gems']

export function isSelfServeCategory(slug: string | null | undefined): boolean {
  return !!slug && !EDITORIAL_CATEGORIES.includes(slug)
}

/**
 * A gem wears the diamond badge (`components/GemBadge.tsx`) where every other
 * listing shows its category chip, and a small diamond before its card's meta
 * line. The wording itself is the category's label, so it is translated in the
 * database like every other category and reads the same everywhere it appears.
 */
export const GEM_CATEGORY = 'gems'

export function isGem(slug: string | null | undefined): boolean {
  return slug === GEM_CATEGORY
}
