/** The one canonical origin. Everything absolute — sitemap, JSON-LD, og:url — starts here. */
export const SITE_URL = 'https://flamingocounty.com'
export const SITE_NAME = 'Flamingo County'

/** Used as og:image wherever a page has no photograph of its own. */
export const DEFAULT_OG_IMAGE = '/uploads/flamingo-city-favicon-512.png'

export function absUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * Next shallow-merges `openGraph` per page, so a page that sets one loses the
 * layout's siteName/type/image. Pages build theirs from this instead.
 */
export function openGraph(
  lang: 'en' | 'es',
  o: { title?: string; description?: string; url: string; image?: string },
) {
  return {
    type: 'website' as const,
    siteName: SITE_NAME,
    locale: lang === 'es' ? 'es_US' : 'en_US',
    title: o.title,
    description: o.description,
    url: o.url,
    images: [{ url: o.image ?? DEFAULT_OG_IMAGE }],
  }
}

export function twitterCard(image?: string) {
  return {
    card: image ? ('summary_large_image' as const) : ('summary' as const),
    images: [image ?? DEFAULT_OG_IMAGE],
  }
}
