import type { Lang } from '../i18n'
import { dateOnly } from './dates'
import { isSourceSlug } from './tracking'

/**
 * The link page (/es/links, /en/links): what the Instagram, TikTok and Facebook
 * bios point to. Its content is the `link-page` global (globals/LinkPage.ts);
 * this file turns it into what the page shows.
 *
 * Every button goes through /go/ so the tap is counted in hq-clicks, with the
 * platform the bio named (`/links?from=ig`) as the source, or `bio` when it
 * named none. Nothing is stored on the visitor: `from` travels in the button
 * links only, never in a cookie.
 */

/** Internal links are stored without a language and get one when shown. */
const LANG_PREFIX = /^\/(es|en)(\/|\?|#|$)/

/** Why a button's URL is refused, or null when it's fine. */
export function checkLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'Give a path on the site (/events) or a full https:// address.'
  const url = value.trim()
  if (/^https:\/\//i.test(url)) {
    try {
      new URL(url)
      return null
    } catch {
      return 'That is not a valid address.'
    }
  }
  // `//evil.com` and `/\evil.com` are other sites to a browser.
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) {
    return 'Start with / for a page on the site, or https:// for another site.'
  }
  if (LANG_PREFIX.test(url)) return 'Leave out /es or /en: the page adds the visitor’s language.'
  return null
}

export const isExternal = (url: string) => /^https:\/\//i.test(url)

/** `/events` → `/es/events`; `/` → `/es`; an https:// address stays as it is. */
export function localizeUrl(url: string, lang: Lang): string {
  if (isExternal(url)) return url
  return url === '/' ? `/${lang}` : `/${lang}${url.startsWith('/?') || url.startsWith('/#') ? url.slice(1) : url}`
}

/** The bio's `?from=`, if it is a usable source name; `bio` otherwise. */
export function sourceFromParam(from: string | string[] | undefined): string {
  const v = (Array.isArray(from) ? from[0] : from)?.toLowerCase()
  return v && isSourceSlug(v) ? v : 'bio'
}

/** The counted link for a button: `/go/ig?to=%2Fes%2Fevents`. */
export function trackedHref(url: string, lang: Lang, from: string): string {
  return `/go/${from}?to=${encodeURIComponent(localizeUrl(url, lang))}`
}

/** Shown today? Both ends are Miami days and both are included. */
export function isShownOn(b: { startsOn?: string | null; endsOn?: string | null }, today: string): boolean {
  const from = dateOnly(b.startsOn)
  const to = dateOnly(b.endsOn)
  return (!from || from <= today) && (!to || today <= to)
}

/* ------------------------------------------------------------------------ */

export type LinkPageButton = {
  id?: string | null
  emoji?: string | null
  labelEs: string
  labelEn: string
  kind?: 'link' | 'newestStory' | null
  url?: string | null
  featured?: boolean | null
  startsOn?: string | null
  endsOn?: string | null
}
export type LinkPageDoc = {
  taglineEs?: string | null
  taglineEn?: string | null
  sections?:
    | { id?: string | null; emoji?: string | null; titleEs: string; titleEn: string; buttons?: LinkPageButton[] | null }[]
    | null
}

/** The visitor's language, or the other one when that is empty. */
const pick = (lang: Lang, es?: string | null, en?: string | null) => ((lang === 'es' ? es || en : en || es) ?? '').trim()

export type LinkButtonView = {
  key: string
  emoji: string
  label: string
  /** A second line: the newest story's title. */
  sub?: string
  href: string
  external: boolean
}
export type LinkSectionView = { key: string; emoji: string; title: string; buttons: LinkButtonView[] }

/**
 * What the page shows today: featured buttons first, then each section with
 * what is left. A button outside its dates is dropped, and so is a section
 * left with nothing. A "newest story" button with no story published yet is
 * dropped too.
 */
export function buildLinkPage(
  doc: LinkPageDoc,
  o: { lang: Lang; today: string; from: string; newestStory: { slug: string; title: string } | null },
): { tagline: string; featured: LinkButtonView[]; sections: LinkSectionView[] } {
  const featured: LinkButtonView[] = []
  const sections: LinkSectionView[] = []
  ;(doc.sections ?? []).forEach((section, si) => {
    const buttons: LinkButtonView[] = []
    ;(section.buttons ?? []).forEach((b, bi) => {
      const label = pick(o.lang, b.labelEs, b.labelEn)
      if (!label || !isShownOn(b, o.today)) return
      let view: LinkButtonView
      if (b.kind === 'newestStory') {
        if (!o.newestStory) return
        view = {
          key: b.id ?? `${si}-${bi}`,
          emoji: b.emoji ?? '',
          label,
          sub: o.newestStory.title,
          href: trackedHref(`/stories/${o.newestStory.slug}`, o.lang, o.from),
          external: false,
        }
      } else {
        const url = b.url?.trim()
        if (!url || checkLinkUrl(url)) return
        view = {
          key: b.id ?? `${si}-${bi}`,
          emoji: b.emoji ?? '',
          label,
          href: trackedHref(url, o.lang, o.from),
          external: isExternal(url),
        }
      }
      ;(b.featured ? featured : buttons).push(view)
    })
    if (buttons.length) {
      sections.push({ key: section.id ?? String(si), emoji: section.emoji ?? '', title: pick(o.lang, section.titleEs, section.titleEn), buttons })
    }
  })
  return { tagline: pick(o.lang, doc.taglineEs, doc.taglineEn), featured, sections }
}

/**
 * Every outside address on the page. /go/ sends a visitor off-site only to one
 * of these, so it can't be used as an open redirect to anywhere else.
 */
export function externalUrls(doc: LinkPageDoc): Set<string> {
  const out = new Set<string>()
  for (const s of doc.sections ?? []) {
    for (const b of s.buttons ?? []) if (b.url && isExternal(b.url) && !checkLinkUrl(b.url)) out.add(b.url.trim())
  }
  return out
}
