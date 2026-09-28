/**
 * The shape My Week syncs, and the rules both ends agree on. Kept free of
 * Payload and browser APIs so it runs in the route handler, the client store
 * and the tests alike.
 */
export type Lists = { saved: string[]; going: string[] }

/** Far above any real week; only here so a bad client cannot grow a row forever. */
export const MAX_SLUGS = 500

/**
 * Coerces an untrusted list to unique strings, in order. Anything that is not
 * an array becomes empty rather than an error — a corrupt localStorage value
 * should cost the visitor that list, not the sync.
 */
export function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of value) {
    if (typeof v !== 'string' || !v || v.length > 200 || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= MAX_SLUGS) break
  }
  return out
}

/**
 * Drops slugs that no longer name an event. Events get renamed (CMS.md), and a
 * stale slug would otherwise sit in the list forever, counted by nothing and
 * shown nowhere.
 */
export function keepKnown(list: string[], known: ReadonlySet<string>): string[] {
  return list.filter((slug) => known.has(slug))
}

/** Union, keeping `a`'s order first. Used once per device, at first sign-in. */
export function union(a: string[], b: string[]): string[] {
  return cleanList([...a, ...b])
}
