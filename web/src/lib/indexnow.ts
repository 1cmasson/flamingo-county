import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { LOCALES } from '../i18n'
import { routes } from './routes'
import { absUrl, SITE_URL } from './site'

/**
 * IndexNow: tells Bing (and the engines that share its index) that a URL
 * changed, instead of waiting for them to re-crawl. Bing's index feeds ChatGPT
 * search and Copilot, so freshness here is freshness in those answers.
 *
 * The key is a public identifier by design: it is served at /<key>.txt to prove
 * we own the host. It is read from INDEXNOW_KEY at runtime and nothing is sent
 * unless it is set and this is a production process, so dev servers, tests and
 * `pnpm seed` against a local DB never ping.
 */
const ENDPOINT = 'https://api.indexnow.org/IndexNow'

export const indexNowKey = () => process.env.INDEXNOW_KEY || undefined

/** Both language versions of each path. */
function bothLangs(path: (lang: 'en' | 'es') => string): string[] {
  return LOCALES.map((l) => absUrl(path(l)))
}

/** The pages whose content depends on one record. Pure, so it is unit-tested. */
export function urlsFor(
  collection: string,
  doc: { slug?: string; publicationStatus?: string | null },
  citySlug?: string | null,
): string[] {
  if (!doc.slug) return []
  switch (collection) {
    case 'listings':
      if (doc.publicationStatus === 'unsourced' || !citySlug) return []
      // The city page lists every business in it, so it changes too.
      return [
        ...bothLangs((l) => routes.business(l, citySlug, doc.slug!)),
        ...bothLangs((l) => routes.city(l, citySlug)),
      ]
    case 'events':
      return [...bothLangs((l) => routes.event(l, doc.slug!)), ...bothLangs(routes.events)]
    case 'stories':
      return [...bothLangs((l) => routes.story(l, doc.slug!)), ...bothLangs(routes.stories)]
    case 'cities':
      return bothLangs((l) => routes.city(l, doc.slug!))
    default:
      return []
  }
}

/** Fire-and-forget: a failed ping must never fail a CMS save. */
export async function pingIndexNow(urls: string[], log?: (msg: string) => void) {
  const key = indexNowKey()
  if (!key || process.env.NODE_ENV !== 'production' || urls.length === 0) return
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: new URL(SITE_URL).host,
        key,
        keyLocation: `${SITE_URL}/${key}.txt`,
        urlList: [...new Set(urls)].slice(0, 10000),
      }),
    })
    // 200/202 accepted. 422/429 are worth a log line, nothing more.
    if (!res.ok && res.status !== 202) log?.(`IndexNow ${res.status} for ${urls.length} url(s)`)
  } catch (err) {
    log?.(`IndexNow failed: ${String(err)}`)
  }
}

async function citySlugOf(
  req: Parameters<CollectionAfterChangeHook>[0]['req'],
  city: unknown,
): Promise<string | null> {
  if (city && typeof city === 'object' && 'slug' in city) return (city as { slug: string }).slug
  if (typeof city === 'number' || typeof city === 'string') {
    const c = await req.payload.findByID({ collection: 'cities', id: city, depth: 0, req })
    return c?.slug ?? null
  }
  return null
}

/** `afterChange` and `afterDelete` hooks for a collection. */
export function indexNowHooks(collection: 'listings' | 'events' | 'stories' | 'cities') {
  const run = async (
    req: Parameters<CollectionAfterChangeHook>[0]['req'],
    doc: Record<string, any>,
  ) => {
    if (!indexNowKey() || process.env.NODE_ENV !== 'production') return
    const citySlug = collection === 'listings' ? await citySlugOf(req, doc.city) : null
    void pingIndexNow(urlsFor(collection, doc, citySlug), (m) => req.payload.logger.warn(m))
  }
  const afterChange: CollectionAfterChangeHook = async ({ doc, req }) => {
    // Listings, events and stories have drafts: a draft save changes nothing a
    // crawler can see, and a never-published draft's URL is a 404. Ping only
    // when the saved version is the live one.
    if ((doc as { _status?: string })._status === 'draft') return doc
    await run(req, doc)
    return doc
  }
  const afterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
    await run(req, doc)
    return doc
  }
  return { afterChange: [afterChange], afterDelete: [afterDelete] }
}
