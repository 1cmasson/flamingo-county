/**
 * Listing search — the matcher shared by the results grid and the suggestions
 * dropdown.
 *
 * This is deliberately a hand-written linear scan rather than Fuse/Lunr/an
 * inverted index. The corpus is 11 listings; scanning it costs microseconds,
 * and a fuzzy scorer at this size invents false positives without ever finding
 * something a prefix match misses.
 *
 * It is also deliberately *not* a database query. Three separate behaviours of
 * the SQLite adapter make a `where` clause the wrong tool here:
 *
 *   1. SQLite's `LIKE` case-folds ASCII only, so `%limon%` does not match
 *      "Limón" — on a site whose default language is Spanish.
 *   2. `parseParams` splits a multi-word `like` on spaces and ANDs the words
 *      *within one column*, so no query can ever match across fields.
 *   3. `getTableColumnFromPath` joins the locales table on `_locale` with no
 *      fallback branch, so a `tag` query on `/es` matches zero rows even though
 *      the page renders the English tag through `fallback: true`.
 *
 * `getListings` already caps at 200 rows, so filtering the fetched set costs
 * nothing and — the real point — the grid and the dropdown run the same
 * function over the same array and cannot disagree.
 *
 * This module must stay free of runtime imports so the client bundle can have
 * it: `import type` only. Reaching into `./data` would drag `getPayload` and
 * the Payload config into the browser.
 */

/** Lowercase and strip diacritics: "LIMÓN", "Limón" and "limon" all fold together. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Alphanumerics only — spaces and punctuation collapse away.
 *
 * This is what makes "sn" find "S&N Vegetables" and "molinas" find "Molina's
 * Ranch". Splitting those into words instead yields ["s","n"] and
 * ["molina","s"], whose parts match nearly every row in the corpus.
 */
export function squash(s: string): string {
  return fold(s).replace(/[^a-z0-9]+/g, '')
}

/** Word tokens, for the prefix tiers. */
export function words(s: string): string[] {
  return fold(s).split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * One row as it crosses to the client. Kept flat and small: a `Listing` at the
 * `depth: 2` the grid needs would drag the city, its mascot upload and the
 * whole detail/research group along with it. All 11 rows together are ~3 KB.
 */
export type Suggestion = {
  /** `String(listing.id)` — React key and the base for the ARIA option id. */
  id: string
  href: string
  /** Display, original casing. */
  name: string
  /** Display: "RESTAURANTES · Cypress Village". Empty parts already dropped. */
  meta: string
  /** Category label, hood, cuisine and signature dishes — matched and ranked. */
  terms: string[]
  /** The card pitch. Matched, never displayed here. */
  tag: string
}

/**
 * The "RESTAURANTES · Cypress Village" line under a business name.
 *
 * Joined over only the parts that exist. 7 of the 11 listings have no `hood`,
 * and interpolating the separator unconditionally leaves a dangling " · " on
 * every one of them. Shared by the card and the suggestion row so the two
 * cannot drift.
 */
export function metaLine(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ')
}

/** A suggestion with its normalised forms precomputed. */
export type Prepared = {
  item: Suggestion
  name: string
  nameSquash: string
  nameWords: string[]
  terms: string[]
  haySquash: string
}

export function prepare(items: Suggestion[]): Prepared[] {
  return items.map((item) => {
    const all = [item.name, item.tag, ...item.terms].filter(Boolean).join(' ')
    return {
      item,
      name: fold(item.name),
      nameSquash: squash(item.name),
      nameWords: words(item.name),
      terms: item.terms.map(fold),
      haySquash: squash(all),
    }
  })
}

/**
 * Does this row match at all?
 *
 * Two passes, unioned, because neither alone is right:
 *
 *   - The squashed pass ignores punctuation and spacing, which is what lets
 *     "sn" reach "S&N Vegetables" and "dr limon" reach "Dr. Limón Ceviche Bar".
 *   - The token pass ANDs each word across the *whole* haystack, which is what
 *     lets "morro fritas" match a name in one field and a word in another.
 *     Squashing alone cannot: it would need "morrofritas" contiguous.
 */
export function matches(p: Prepared, folded: string, squashed: string): boolean {
  if (!squashed) return false
  if (p.haySquash.includes(squashed)) return true
  const tokens = folded.split(' ').filter(Boolean).map(squash).filter(Boolean)
  // Each token is squashed too, or "molinas cuban" would fail on the apostrophe
  // in "Molina's" the same way the unsquashed single-word path would.
  return tokens.length > 1 && tokens.every((w) => p.haySquash.includes(w))
}

/**
 * Lower is better. Name matches outrank facet matches, because typing a name is
 * a stronger statement of intent than typing a cuisine.
 *
 * Tier 2 is the one that earns its keep: these names are multi-word and
 * front-loaded with noise ("Dr. Limón Ceviche Bar", "The Bend Liquor Lounge"),
 * and nobody types "Dr.". Without a word-start tier, "limon" and "bend" would
 * rank below unrelated cuisine hits.
 *
 * Scored against the whole query, not per token, so single-word typing — which
 * is nearly every keystroke — behaves the way a reader expects.
 */
function tier(p: Prepared, squashed: string): number {
  if (p.nameSquash === squashed) return 0
  if (p.nameSquash.startsWith(squashed)) return 1
  if (p.nameWords.some((w) => w.startsWith(squashed))) return 2
  if (p.nameSquash.includes(squashed)) return 3
  if (p.terms.some((t) => words(t).some((w) => w.startsWith(squashed)))) return 4
  if (p.terms.some((t) => squash(t).includes(squashed))) return 5
  return 6
}

/**
 * The ranked matches, best first.
 *
 * Ties break on input order, and the caller's order is load-bearing:
 * `getListings` returns research-tier-then-authored (see `byResearchThenAuthored`
 * in ./data), so sourced records lead the dropdown exactly as they lead the grid.
 *
 * The tiers also keep the list *stable* while typing — "l", "li", "lim" and
 * "limon" all hold Dr. Limón at the top — so the highlighted row never moves out
 * from under someone about to press Enter.
 */
export function rankMatches(prepared: Prepared[], query: string, limit = 8): Suggestion[] {
  const folded = fold(query)
  const squashed = squash(query)
  if (!squashed) return []

  const hits: { p: Prepared; i: number; t: number }[] = []
  prepared.forEach((p, i) => {
    if (matches(p, folded, squashed)) hits.push({ p, i, t: tier(p, squashed) })
  })
  hits.sort((a, b) => a.t - b.t || a.i - b.i)
  return hits.slice(0, limit).map((h) => h.p.item)
}
