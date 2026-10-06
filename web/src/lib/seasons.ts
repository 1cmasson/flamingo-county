import type { Lang } from '../i18n'
import { addDays, dateOnly, isStillOn, weekday, type EventDates } from './dates'

/**
 * Seasonal guides: one page per season (/es/halloween, /en/halloween) listing
 * every published event an editor has tagged with that season.
 *
 * Adding a season (Navidad next):
 *   1. its key is already an option of the events' `season` field
 *      (SEASON_OPTIONS below); a new key needs a migration, an existing one
 *      does not;
 *   2. add its entry to SEASONS;
 *   3. add `app/(frontend)/[lang]/<path>/page.tsx`, a copy of the Halloween
 *      one with the key changed. A static folder is needed because `[city]`
 *      owns every other one-segment path.
 * The sitemap, llms.txt, the card route and the events board's link read
 * SEASONS, so nothing else changes.
 *
 * This file is light on purpose (no Payload, no renderer): the Events
 * collection imports its options and pages import its helpers.
 */

export type SeasonKey = 'halloween' | 'navidad'

/** The events' `season` select. Not localized: an event is a Halloween event in both languages. */
export const SEASON_OPTIONS: { label: string; value: SeasonKey }[] = [
  { label: 'Halloween', value: 'halloween' },
  { label: 'Navidad / Holidays', value: 'navidad' },
]

/** The season card's palette, drawn by lib/eventCard.tsx. */
export type SeasonCardTheme = 'night' | 'pumpkin' | 'dusk'

type Copy = Record<Lang, string>

export type Season = {
  key: SeasonKey
  /** The page's path segment: /<lang>/<path>. Route slugs stay English in both languages. */
  path: string
  /** The page's H1 and the base of its <title>, for a given year. */
  title: (lang: Lang, year: number) => string
  /** The <title> and og:title, which carry the search terms the H1 leaves out. */
  metaTitle: (lang: Lang, year: number) => string
  description: (lang: Lang, year: number) => string
  /** Evergreen: true whether or not any event has been announced yet. No prices, no invented facts. */
  intro: Copy
  /** Shown instead of the list when nothing tagged is still on. */
  empty: Copy
  /**
   * When the season runs, as MM-DD in Miami time, both ends inclusive. A `to`
   * earlier than `from` wraps into the next year (Navidad: 11-20 to 01-06).
   * It decides the year in the title and when the events board links here; it
   * does not filter the list, which is every tagged event still on.
   */
  window: { from: string; to: string }
  card: {
    theme: SeasonCardTheme
    /** The mascot in the arch, by city slug (src/assets/og/mascots). */
    mascot: string
    /** The city chip, and the hero's mascot overlay on the page. */
    city: { slug: string; name: string }
    title: Copy
    chip: Copy
    line: Copy
    /**
     * A drawn scene behind the card (link, social, page and card sizes), in
     * place of the halftone and the mascot's arch. A JPEG under
     * src/assets/og/ (Satori reads no WebP). Art adapted from a licensed photo
     * carries that licence's credit wherever it is shown: on the cards and
     * under the page's hero.
     */
    scene?: {
      file: string
      /** Where the crop centres, 0–100 across and down. */
      focalX: number
      focalY: number
      /** In parts, so the page can link the photo and the licence: `sceneCreditText` joins them. */
      credit: { lead: Copy; photo: Copy; license: string }
      sourceUrl: string
      licenseUrl: string
    }
    /**
     * How each event tagged with the season dresses its cards: the palette
     * in place of the city's colour, and a chip naming the season, at every
     * size (the board's and the guide's tiles, the event page's hero, the
     * link preview and the social poster).
     */
    event?: {
      theme: SeasonCardTheme
      chip: Copy
      /** The palette's ground, for the page's hero box while the card loads. */
      ground: string
    }
  }
  /** The events board's link while the window is open, and its colour. */
  boardLink: (lang: Lang, year: number) => string
  accent: string
}

export const SEASONS: Partial<Record<SeasonKey, Season>> = {
  halloween: {
    key: 'halloween',
    path: 'halloween',
    title: (lang, year) => (lang === 'es' ? `Halloween en Hialeah ${year}` : `Halloween in Hialeah ${year}`),
    metaTitle: (lang, year) =>
      lang === 'es'
        ? `Halloween en Hialeah ${year}: fiestas, trunk-or-treat y eventos`
        : `Halloween in Hialeah ${year}: parties, trunk-or-treats and events`,
    description: (lang, year) =>
      lang === 'es'
        ? `Los eventos de Halloween ${year} en Hialeah, Hialeah Gardens, Miami Lakes y alrededores: fiestas, trunk-or-treat y más, cada uno con su enlace oficial.`
        : `Halloween ${year} events in Hialeah, Hialeah Gardens, Miami Lakes and nearby: parties, trunk-or-treats and more, each with its official link.`,
    intro: {
      es: 'Esta es la guía de los eventos de Halloween de este año en Hialeah, Hialeah Gardens, Miami Lakes y alrededores: fiestas, trunk-or-treat y más. Cada evento lleva el enlace oficial de quien lo organiza, para que confirmes allí la hora y los detalles. La vamos actualizando a medida que se anuncian.',
      en: 'This is the guide to this year’s Halloween events in Hialeah, Hialeah Gardens, Miami Lakes and nearby: parties, trunk-or-treats and more. Every event carries the official link of whoever puts it on, so you can check the time and details with them. We update it as events are announced.',
    },
    empty: {
      es: 'Todavía no hay eventos de Halloween anunciados. Vuelve pronto: los añadimos en cuanto salen.',
      en: 'No Halloween events have been announced yet. Check back soon: we add them as they come out.',
    },
    window: { from: '10-01', to: '11-02' },
    card: {
      theme: 'night',
      mascot: 'hialeah',
      city: { slug: 'hialeah', name: 'HIALEAH' },
      title: { es: 'HALLOWEEN EN HIALEAH', en: 'HALLOWEEN IN HIALEAH' },
      chip: { es: 'GUÍA', en: 'GUIDE' },
      line: {
        es: 'Fiestas, trunk-or-treat y eventos · con su enlace oficial',
        en: 'Parties, trunk-or-treats and events · each with its official link',
      },
      // Hialeah Park's clubhouse on Halloween night, drawn for the brand kit
      // from Phillip Pessar's photo (CC BY 2.0), so the credit goes wherever
      // it is shown. The building sits right of centre, the moon at left.
      scene: {
        file: 'seasons/halloween-hialeah-park.jpg',
        focalX: 50,
        focalY: 50,
        // "Ilustración basada en una foto de Phillip Pessar (CC BY 2.0)"
        credit: {
          lead: { es: 'Ilustración basada en una ', en: 'Illustration adapted from a ' },
          photo: { es: 'foto de Phillip Pessar', en: 'photo by Phillip Pessar' },
          license: 'CC BY 2.0',
        },
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hialeah_Park_Race_Track_(28830740140).jpg',
        licenseUrl: 'https://creativecommons.org/licenses/by/2.0/',
      },
      // Orange and purple, friendly rather than scary: the Hialeah Park
      // scene's night purple as the ground, pumpkin orange for the type.
      event: {
        theme: 'dusk',
        chip: { es: 'HALLOWEEN', en: 'HALLOWEEN' },
        ground: '#390a75',
      },
    },
    boardLink: (lang, year) => (lang === 'es' ? `HALLOWEEN EN HIALEAH ${year} →` : `HALLOWEEN IN HIALEAH ${year} →`),
    // The card's orange.
    accent: '#ff7a1a',
  },
}

export type SeasonScene = NonNullable<Season['card']['scene']>

/** The scene's credit as one line: "Ilustración basada en una foto de Phillip Pessar (CC BY 2.0)". */
export function sceneCreditText(scene: SeasonScene, lang: Lang): string {
  return `${scene.credit.lead[lang]}${scene.credit.photo[lang]} (${scene.credit.license})`
}

export function getSeason(key: string | null | undefined): Season | null {
  return key && Object.prototype.hasOwnProperty.call(SEASONS, key) ? (SEASONS[key as SeasonKey] ?? null) : null
}

export function allSeasons(): Season[] {
  return Object.values(SEASONS).filter((s): s is Season => !!s)
}

/**
 * The season's window around `today` (YYYY-MM-DD, Miami): the one it is in,
 * or else the one this calendar year. A wrapping window that `today` sits in
 * the tail of (Jan 3, for one that runs into January) started last year.
 * `year` is the window's first year, which is the year the page names.
 */
export function seasonWindow(season: Pick<Season, 'window'>, today: string) {
  const y = Number(today.slice(0, 4))
  const md = today.slice(5, 10)
  const { from, to } = season.window
  const wraps = to < from
  const start = wraps && md <= to ? y - 1 : y
  return { year: start, from: `${start}-${from}`, to: `${wraps ? start + 1 : start}-${to}` }
}

export function isSeasonOpen(season: Pick<Season, 'window'>, today: string): boolean {
  const w = seasonWindow(season, today)
  return w.from <= today && today <= w.to
}

/**
 * The events a guide lists: tagged with its season and not finished yet, by
 * first day. Callers pass published events only (lib/data.ts does).
 */
export function seasonEvents<E extends EventDates & { season?: string | null; title?: string | null }>(
  events: E[],
  key: SeasonKey,
  today: string,
): E[] {
  return events
    .filter((ev) => ev.season === key && isStillOn(ev, today))
    .sort((a, b) => {
      const d = dateOnly(a.date).localeCompare(dateOnly(b.date))
      return d || (a.title ?? '').localeCompare(b.title ?? '')
    })
}

/**
 * The guide's weeks, Monday to Sunday: each event under the week of its first
 * day, or of today when its run has already started, so a haunted house that
 * opened last week is listed as on now rather than under a week that is over.
 *
 * Weeks, not days: a season's events bunch into its last week, and a heading
 * per day left one lonely card per row. Each card carries its own date line.
 * Not by city either: the site's cities are Hialeah, Miami Lakes and Little
 * Havana, so a Hialeah Gardens event would sit under the wrong name.
 */
export function groupByWeek<E extends EventDates>(
  events: E[],
  today: string,
): { from: string; to: string; current: boolean; items: E[] }[] {
  const weeks = new Map<string, E[]>()
  for (const ev of events) {
    const start = dateOnly(ev.date)
    const shown = start < today ? today : start
    const monday = addDays(shown, -((weekday(shown) + 6) % 7))
    weeks.set(monday, [...(weeks.get(monday) ?? []), ev])
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([from, items]) => {
      const to = addDays(from, 6)
      return { from, to, current: from <= today && today <= to, items }
    })
}
