/**
 * Categories the site assigns and a business cannot pick for itself.
 *
 * `gems` (LOCAL GEMS / JOYAS LOCALES) marks a place that has been part of the
 * city long enough to be one of its landmarks. That is the directory's call to
 * make, so the List Your Spot form does not offer it, and a request that names
 * it anyway is saved with no category rather than with this one.
 */
export const EDITORIAL_CATEGORIES: readonly string[] = ['gems']

export function isSelfServeCategory(slug: string | null | undefined): boolean {
  return !!slug && !EDITORIAL_CATEGORIES.includes(slug)
}
