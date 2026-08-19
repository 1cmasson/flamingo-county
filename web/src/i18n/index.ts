import { ES } from './dictionary.generated'

export const LOCALES = ['en', 'es'] as const
export type Lang = (typeof LOCALES)[number]

/**
 * The site's own default — Spanish. Note this is NOT Payload's `defaultLocale`,
 * which is 'en' because English is the authoring source and Spanish is the
 * translation. Two different defaults, deliberately.
 */
export const DEFAULT_LANG: Lang = 'es'

export function isLang(v: string | undefined): v is Lang {
  return v === 'en' || v === 'es'
}

/**
 * The chrome translator, matching `T()` in fc-data.js exactly: the keys are the
 * English strings, and a miss returns the key untouched.
 */
export function translator(lang: Lang) {
  return (s: string): string => (lang === 'es' ? (ES[s] ?? s) : s)
}

/**
 * Picks a language from `navigator.languages`-style tags — the Accept-Language
 * header, server-side. Matches `detectLang()` in fc-data.js: first entry whose
 * primary subtag is es or en, so es-419 / es-MX / es-US all resolve to Spanish
 * and ["fr-FR", "en-US"] resolves to English.
 *
 * The result of this MUST NOT be persisted. Writing a detected language to the
 * cookie would make it win on every later visit and the device setting would be
 * ignored forever. Only an explicit toggle writes. See middleware.ts.
 */
export function detectLang(acceptLanguage: string | null | undefined): Lang | undefined {
  if (!acceptLanguage) return undefined
  const tags = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase())
    .filter(Boolean) as string[]
  for (const tag of tags) {
    const primary = tag.split('-')[0]
    if (primary === 'es' || primary === 'en') return primary
  }
  return undefined
}

/** The other language — for the EN/ES toggle. */
export const otherLang = (lang: Lang): Lang => (lang === 'es' ? 'en' : 'es')
