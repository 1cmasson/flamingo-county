import type { Lang } from '../i18n'

/**
 * Path-segment URLs, replacing the query-string state the static site used
 * (`?city=`, `?biz=`, `?s=`, `?e=`). This is the shape ROUTES.md sketched.
 *
 * The old URLs are advertised in the README as shareable and exist in the wild,
 * so they are not dropped — see src/app/(frontend)/(legacy), which resolves them
 * and redirects. Those need a data lookup (`?biz=el-gallo` has to become
 * `/en/havana/el-gallo`, which requires knowing the city), so they cannot be
 * static rewrites in next.config.
 *
 * Route slugs stay English in both locales. ROUTES.md floats translated slugs
 * (`/es/eventos`); that is a separate decision with its own redirect burden.
 */
export const routes = {
  home: (lang: Lang) => `/${lang}`,
  city: (lang: Lang, city: string) => `/${lang}/${city}`,
  business: (lang: Lang, city: string, biz: string) => `/${lang}/${city}/${biz}`,
  events: (lang: Lang) => `/${lang}/events`,
  event: (lang: Lang, slug: string) => `/${lang}/events/${slug}`,
  eventIcs: (lang: Lang, slug: string) => `/${lang}/events/${slug}/ics`,
  stories: (lang: Lang) => `/${lang}/stories`,
  story: (lang: Lang, slug: string) => `/${lang}/stories/${slug}`,
  myWeek: (lang: Lang) => `/${lang}/my-week`,
  listYourSpot: (lang: Lang) => `/${lang}/list-your-spot`,
  about: (lang: Lang) => `/${lang}/about`,
} as const

/** Append query params, skipping empties — filters keep living in the query. */
export function withQuery(path: string, params: Record<string, string | undefined | null>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v)
  }
  const s = q.toString()
  return s ? `${path}?${s}` : path
}
