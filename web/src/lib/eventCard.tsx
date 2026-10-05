import { access, readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'

import { noPrice } from '../fields/shared'
import { translator, type Lang } from '../i18n'
import type { City, Event, EventKind, Media } from '../payload-types'
import { photoCredit, photoCreditText } from './photoLicense'
import { ARCHIVO_800, LUCKIEST_GUY } from './cardMetrics'
import { EVENT_CARD_SIZES, type EventCardSize } from './eventCardUrl'
import { eventDateLine, todayISO } from './dates'
import { EVENT_SETTINGS, eventSetting, type EventSetting } from './eventSetting'
import { eventVenue } from './eventVenue'
import { getSeason, sceneCreditText, type Season, type SeasonCardTheme } from './seasons'

/**
 * The event card: the picture an event with no photo gets, drawn from its own
 * fields. The design is the one the owner picked ("C"): the city's colour with
 * a white halftone, the city and kind as chips, the title huge in Luckiest Guy
 * with a cream offset shadow, the date on an ink ticket, then time · place,
 * and the city's mascot standing in a cream arch on the right.
 *
 * An event with no photo can instead stand on a drawn scene (`eventSetting`):
 *
 * - The social poster draws the portrait scene in place of the colour and
 *   halftone. The mascot stands in it without the arch, and the small text
 *   sits on cream strips so it reads over the drawing.
 * - The wide sizes (`link`, `page`, `card`) draw the wide version of the same
 *   scene (`settings-wide/`) across the whole card. The city's colour and its
 *   dots stay under the text on the left and end in a halftone fade into the
 *   drawing, so the type is design C's exactly, on its own ground
 *   (`WIDE_LAYOUTS`).
 *
 * The seasonal guides (lib/seasons.ts, /es/halloween) reuse the same layout
 * with their own copy and palette: `renderSeasonCard`, `SEASON_THEMES`.
 *
 * Only facts the event states are drawn, and a field that names a price is
 * dropped, as in the social captions. Callers pass published events only; the
 * route reads through `getEvent`, which never returns a draft.
 *
 * Satori (behind `ImageResponse`) reads TTF/OTF/WOFF fonts and PNG/JPEG
 * images, not WOFF2 or WebP, which is why the fonts and mascots are bundled
 * under `src/assets/og` rather than read from Payload's media (stored as WebP).
 * `src/` is in the production image, and next.config.ts adds the folder to the
 * standalone trace as well.
 */

const INK = '#0c0f14'
const CREAM = '#fff6e5'
const PINK = '#ff2e88'
const CYAN = '#16e0f2'
const YELLOW = '#ffd400'
const ORANGE = '#ff7a1a'
/** Halloween's purple: the Hialeah Park scene's sky (`SCENE_SKY`). */
const PURPLE = '#390a75'

/**
 * The colours the card is drawn in, apart from the background. Design C is
 * the event card's; the seasonal guides' cards (lib/seasons.ts) swap the
 * palette and keep the layout.
 */
export type CardTheme = {
  /** The background, when it is not the city's colour. */
  bg?: string
  dot: string
  dotOpacity: number
  title: string
  titleShadow: string
  /** Time · place, the brand, and the outlined chip. */
  text: string
  chipBg: string
  /** The solid chips' text, when it is not the city's own pick. */
  chipText?: string
  ticketBg: string
  ticketText: string
  archBg: string
  archBorder: string
  /** A tint over a drawn scene, under the text's ground: Halloween's dusk. */
  sceneWash?: string
  /** Over the poster's portrait scene: a shade from the top, so the title sits on the palette's ground. */
  backdropShade?: string
}

const DESIGN_C: CardTheme = {
  dot: '#fff',
  dotOpacity: 0.35,
  title: INK,
  titleShadow: CREAM,
  text: INK,
  chipBg: INK,
  ticketBg: INK,
  ticketText: CREAM,
  archBg: CREAM,
  archBorder: INK,
}

/**
 * The seasonal palettes. Halloween was drawn both ways and `night` picked:
 * the ink ground with orange dots reads as Halloween at thumbnail size,
 * where `pumpkin` (Hialeah pink, orange ticket) reads as any Hialeah event.
 */
export const SEASON_THEMES: Record<SeasonCardTheme, CardTheme> = {
  night: {
    bg: INK,
    dot: ORANGE,
    dotOpacity: 0.5,
    title: ORANGE,
    titleShadow: CREAM,
    text: CREAM,
    chipBg: ORANGE,
    chipText: INK,
    ticketBg: YELLOW,
    ticketText: INK,
    archBg: CREAM,
    archBorder: ORANGE,
  },
  pumpkin: {
    ...DESIGN_C,
    bg: PINK,
    ticketBg: ORANGE,
    ticketText: INK,
  },
  /**
   * A Halloween event's card: the Hialeah Park scene's night purple in place
   * of the city's colour, orange dots and title, and the scene behind tinted
   * towards dusk. The city keeps its own colour on its chip.
   */
  dusk: {
    bg: PURPLE,
    dot: ORANGE,
    dotOpacity: 0.45,
    title: ORANGE,
    titleShadow: CREAM,
    text: CREAM,
    chipBg: INK,
    ticketBg: CREAM,
    ticketText: PURPLE,
    archBg: CREAM,
    archBorder: ORANGE,
    sceneWash: 'rgba(57,10,117,0.3)',
    // The title sits in the poster's top 45%; the mascot and the place below stay clear.
    backdropShade: 'linear-gradient(180deg, rgba(57,10,117,0.94) 0%, rgba(57,10,117,0.85) 36%, rgba(57,10,117,0) 58%)',
  },
}

/** The city's colour, by slug; a city added later uses its own `accent`. */
const CITY_BG: Record<string, string> = { hialeah: PINK, lakes: CYAN, havana: YELLOW }

export type EventCardData = {
  title: string
  city: string
  citySlug: string
  bg: string
  kind: string
  status: string
  dateLine: string
  meta: string
  /** A season's chip after the kind ("HALLOWEEN"): every size but the board's tile. */
  season?: string
}

/** A field's text, or nothing if it names a price. Emoji are dropped: Satori would fetch them from a CDN. */
function fact(value: string | null | undefined): string {
  const text = (value ?? '').replace(/\p{Extended_Pictographic}|️/gu, '').replace(/\s+/g, ' ').trim()
  return text && noPrice(text) === true ? text : ''
}

/** Everything the card draws, from a published event read at depth ≥ 2. */
export function eventCardData(ev: Event, lang: Lang, today: string = todayISO()): EventCardData {
  const t = translator(lang)
  const { city, name, hood } = eventVenue(ev)
  const kind = ev.kind && typeof ev.kind === 'object' ? (ev.kind as EventKind) : null
  const c = city as City | null
  const status =
    ev.eventStatus === 'cancelled'
      ? t('CANCELLED')
      : ev.eventStatus === 'postponed'
        ? t('POSTPONED')
        : ev.eventStatus === 'rescheduled'
          ? t('NEW DATE')
          : ''
  return {
    title: fact(ev.title),
    city: fact(c?.name),
    citySlug: c?.slug ?? '',
    bg: (c?.slug && CITY_BG[c.slug]) || (c?.accent && /^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent : PINK),
    kind: fact(kind?.label),
    status,
    dateLine: eventDateLine(ev, lang, today),
    meta: [fact(ev.timeLabel), fact(name), fact(hood)].filter(Boolean).join(' · '),
  }
}

/* ------------------------------------------------------------------------ */
/* Assets                                                                    */
/* ------------------------------------------------------------------------ */

type Mascot = { src: string; width: number; height: number }
type Assets = {
  luckiest: Buffer
  archivo: Buffer
  mascots: Record<string, Mascot>
  /** Scene art as data URIs; a missing file is left out and the card is drawn flat. */
  settings: Partial<Record<EventSetting, string>>
  /** The wide scenes' files, cropped per size when drawn; a missing one is left out. */
  wide: Partial<Record<EventSetting, string>>
}

const ASSET_DIR = join(process.cwd(), 'src/assets/og')
let assets: Promise<Assets> | null = null

/** Read once per process. A failed read is retried on the next card. */
function loadAssets(): Promise<Assets> {
  if (!assets) {
    assets = (async () => {
      const [luckiest, archivo] = await Promise.all([
        readFile(join(ASSET_DIR, 'fonts/LuckiestGuy-Regular.ttf')),
        readFile(join(ASSET_DIR, 'fonts/Archivo-ExtraBold.ttf')),
      ])
      const mascots: Record<string, Mascot> = {}
      for (const slug of ['hialeah', 'lakes', 'havana']) {
        const png = await readFile(join(ASSET_DIR, `mascots/${slug}.png`))
        // The PNG header carries the size: width and height are the two
        // big-endian words after the IHDR tag.
        mascots[slug] = {
          src: `data:image/png;base64,${png.toString('base64')}`,
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
        }
      }
      const settings: Partial<Record<EventSetting, string>> = {}
      for (const slug of EVENT_SETTINGS) {
        try {
          const jpg = await readFile(join(ASSET_DIR, `settings/${slug}.jpg`))
          settings[slug] = `data:image/jpeg;base64,${jpg.toString('base64')}`
        } catch (err) {
          console.error(`[og] no scene art for ${slug}:`, err instanceof Error ? err.message : err)
        }
      }
      const wide: Partial<Record<EventSetting, string>> = {}
      for (const slug of EVENT_SETTINGS) {
        const file = join(ASSET_DIR, `settings-wide/${slug}.jpg`)
        try {
          await access(file)
          wide[slug] = file
        } catch (err) {
          console.error(`[og] no wide scene art for ${slug}:`, err instanceof Error ? err.message : err)
        }
      }
      return { luckiest, archivo, mascots, settings, wide }
    })().catch((err) => {
      assets = null
      throw err
    })
  }
  return assets
}

/* ------------------------------------------------------------------------ */
/* Fitting text                                                              */
/* ------------------------------------------------------------------------ */

/** Measured widths run a little narrow against Satori's own layout; this keeps the estimate on the safe side. */
const SAFETY = 1.05
const TITLE_LH = 0.95

function width(text: string, table: Record<string, number>, size: number, spacingEm = 0): number {
  let em = 0
  for (const ch of text) em += (table[ch] ?? 0.72) + spacingEm
  return em * size * SAFETY
}

/**
 * `text` broken into lines of at most `maxW` at `size`, greedily at spaces, or
 * null if one word alone is wider than the line. The title is drawn from these
 * lines, one unwrapping row each, so the number of lines is the one chosen
 * here and not whatever Satori's own wrapping makes of it.
 */
function wrapLines(
  text: string,
  maxW: number,
  size: number,
  table: Record<string, number>,
  spacingEm = 0,
): string[] | null {
  const space = width(' ', table, size, spacingEm)
  const lines: string[] = []
  let line = ''
  let used = 0
  for (const word of text.split(' ')) {
    const w = width(word, table, size, spacingEm)
    if (w > maxW) return null
    if (!line) {
      line = word
      used = w
    } else if (used + space + w <= maxW) {
      line += ` ${word}`
      used += space + w
    } else {
      lines.push(line)
      line = word
      used = w
    }
  }
  if (line) lines.push(line)
  return lines
}


/**
 * The largest title size that wraps into `maxLines` within `maxH`. A long
 * title shrinks to stay within its lines rather than being cut; only one too
 * long to fit them even at the floor gets more lines.
 */
function fitTitle(text: string, maxW: number, maxH: number, max: number, maxLines: number) {
  const FLOOR = 28
  const at = (size: number) => wrapLines(text, maxW, size, LUCKIEST_GUY, 0.01)
  for (let size = max; size >= FLOOR; size -= 2) {
    const lines = at(size)
    if (lines && lines.length <= maxLines && lines.length * size * TITLE_LH <= maxH) return { size, lines }
  }
  for (let size = FLOOR; size > 12; size -= 2) {
    const lines = at(size)
    if (lines && lines.length * size * TITLE_LH <= maxH) return { size, lines }
  }
  return { size: 12, lines: at(12) ?? [text] }
}

/**
 * "4–9 PM · Milander Center · Palm Ave" as rows of whole parts, each row as
 * wide as `maxW` allows. A part too long for a row on its own gets one, and
 * the row wraps inside it.
 */
function breakAtSeparators(parts: string[], maxW: number, size: number): string[] {
  const rows: string[] = []
  for (const part of parts) {
    const last = rows[rows.length - 1]
    if (last !== undefined && width(`${last} · ${part}`, ARCHIVO_800, size) <= maxW) rows[rows.length - 1] = `${last} · ${part}`
    else rows.push(part)
  }
  return rows
}

/** The largest size, up to `max`, at which `text` sits on one line of `maxW`. */
function fitLine(text: string, maxW: number, max: number, min: number, table: Record<string, number>, spacingEm = 0) {
  const at1 = width(text, table, 1, spacingEm)
  return Math.max(min, Math.min(max, Math.floor(maxW / Math.max(at1, 0.01))))
}

/** The space between chips, across and between rows. */
const CHIP_GAP = 10

/**
 * How many rows the chips wrap into across `maxW`, measured as `Chip` draws
 * them: upper case, tracked 0.08em, padded, and the outlined kind chip's
 * border on both sides.
 */
function chipRows(d: EventCardData, size: number, maxW: number): number {
  const chips = [
    [d.city, 0],
    [d.kind, 6],
    [d.status, 0],
    [d.season, 0],
  ] as const
  let rows = 0
  let x = 0
  for (const [text, border] of chips) {
    if (!text) continue
    const w = width(text.toLocaleUpperCase(), ARCHIVO_800, size, 0.08) + Math.round(size * 0.64) * 2 + border
    if (!rows || x + CHIP_GAP + w > maxW) {
      rows++
      x = w
    } else x += CHIP_GAP + w
  }
  return Math.max(1, rows)
}

/* ------------------------------------------------------------------------ */
/* Layout                                                                    */
/* ------------------------------------------------------------------------ */

type Layout = {
  /** The text column: vertically centred in this box, or from its top when `top` is set. */
  col: { left: number; top: number; bottom: number; width: number }
  top?: boolean
  /** The y the title must end above, when something other than the column's height limits it. */
  titleBottom?: number
  title: { max: number; lines: number }
  chip: number
  ticket: { max: number; maxW: number }
  meta: { size: number; maxW: number }
  gap: { chips: number; title: number; meta: number }
  arch?: { right: number; bottom: number; width: number; height: number; border: number }
  mascotH?: number
  brand?: { left?: number; right?: number; top?: number; bottom?: number; size: number }
}

const LAYOUTS: Record<EventCardSize, Layout> = {
  link: {
    col: { left: 60, top: 36, bottom: 84, width: 790 },
    title: { max: 124, lines: 3 },
    chip: 22,
    ticket: { max: 44, maxW: 790 },
    meta: { size: 30, maxW: 790 },
    gap: { chips: 20, title: 26, meta: 16 },
    arch: { right: 20, bottom: -120, width: 300, height: 560, border: 6 },
    mascotH: 560,
    brand: { left: 60, bottom: 44, size: 22 },
  },
  page: {
    // No arch, mascot or brand: the page draws its mascot over the right
    // side, so the column stops short of it (860 of 1200).
    col: { left: 60, top: 40, bottom: 40, width: 800 },
    title: { max: 124, lines: 3 },
    chip: 22,
    ticket: { max: 44, maxW: 800 },
    meta: { size: 30, maxW: 800 },
    gap: { chips: 20, title: 26, meta: 16 },
  },
  card: {
    col: { left: 44, top: 34, bottom: 34, width: 590 },
    title: { max: 108, lines: 3 },
    chip: 22,
    ticket: { max: 42, maxW: 590 },
    meta: { size: 28, maxW: 590 },
    gap: { chips: 18, title: 22, meta: 14 },
    arch: { right: 18, bottom: -110, width: 280, height: 540, border: 6 },
    mascotH: 540,
  },
  social: {
    // A poster: the chips and a big title across the top, the mascot's arch
    // bottom right, the date and place under the title on the left, clear of
    // the mascot. The title stops above the mascot's head (y 600).
    col: { left: 72, top: 110, bottom: 420, width: 936 },
    top: true,
    titleBottom: 600,
    title: { max: 230, lines: 3 },
    chip: 28,
    ticket: { max: 56, maxW: 500 },
    meta: { size: 34, maxW: 500 },
    gap: { chips: 28, title: 30, meta: 20 },
    arch: { right: 44, bottom: -200, width: 440, height: 860, border: 6 },
    mascotH: 740,
    brand: { left: 72, bottom: 72, size: 26 },
  },
}

/* ------------------------------------------------------------------------ */
/* Pictures: a venue photo in a frame, or a season's scene behind it all     */
/* ------------------------------------------------------------------------ */

/**
 * A picture drawn into the card, read from disk and cropped by sharp to the
 * exact box it fills (Satori reads JPEG, not the WebP Payload stores).
 *
 * - `frame`: an event's own photo (a licensed venue photo). It takes the
 *   mascot arch's place, inside an ink-bordered frame with the site's hard
 *   shadow, and the text stays on the city's halftone exactly as design C
 *   draws it. The credit sits on a solid ink strip along the frame's bottom.
 * - `scene`: a season's drawn scene (lib/seasons.ts) filling the whole card,
 *   with a dark gradient where the text sits, and no mascot.
 *
 * `credit` is the line printed on the card (lib/photoLicense.ts makes it for
 * a photo); `key` names the picture in the draw cache, so the bytes are never
 * hashed.
 */
export type CardPicture = {
  mode: 'frame' | 'scene'
  file: string
  /** Where the crop centres, 0–100 across and down (Payload's focal point). */
  focalX?: number | null
  focalY?: number | null
  credit: string
  key: string
}

type DrawnPhoto = { src: string; credit: string }

type PhotoLayout = Layout & {
  frame: { left: number; top: number; width: number; height: number; border: number; shadow: number }
  /** The credit strip's type size. */
  credit: number
}

/** Photo sizes. `page` is the event page's hero, which shows the photo itself. */
type PhotoSize = 'link' | 'card' | 'social'
const isPhotoSize = (s: EventCardSize): s is PhotoSize => s === 'link' || s === 'card' || s === 'social'

const PHOTO_LAYOUTS: Record<PhotoSize, PhotoLayout> = {
  link: {
    // Text on the left as in design C, the photo framed on the right where
    // the arch stood.
    col: { left: 56, top: 36, bottom: 84, width: 580 },
    title: { max: 112, lines: 3 },
    chip: 22,
    ticket: { max: 42, maxW: 580 },
    meta: { size: 28, maxW: 580 },
    gap: { chips: 20, title: 24, meta: 14 },
    brand: { left: 56, bottom: 44, size: 22 },
    frame: { left: 668, top: 38, width: 492, height: 532, border: 6, shadow: 12 },
    credit: 15,
  },
  card: {
    // The board's 4:3 slot: the photo across the top, the text under it.
    col: { left: 40, top: 334, bottom: 22, width: 880 },
    title: { max: 84, lines: 2 },
    chip: 20,
    ticket: { max: 36, maxW: 880 },
    meta: { size: 26, maxW: 880 },
    gap: { chips: 14, title: 16, meta: 10 },
    frame: { left: 28, top: 24, width: 892, height: 282, border: 6, shadow: 12 },
    credit: 17,
  },
  social: {
    // Instagram's 4:5: the photo large on top, the poster's type below it.
    col: { left: 72, top: 712, bottom: 120, width: 936 },
    title: { max: 150, lines: 3 },
    chip: 28,
    ticket: { max: 54, maxW: 936 },
    meta: { size: 34, maxW: 936 },
    gap: { chips: 24, title: 26, meta: 18 },
    brand: { left: 72, bottom: 64, size: 26 },
    frame: { left: 56, top: 56, width: 956, height: 610, border: 6, shadow: 14 },
    credit: 20,
  },
}

type SceneLayout = Layout & {
  /** The dark wash under the text, as a CSS gradient. */
  wash: string
  credit: number
  /** Where the scene is anchored for this shape, overriding the season's own focal point. */
  focalX?: number
  focalY?: number
  /**
   * For a shape the scene cannot fill without losing most of it (the 4:5
   * poster): where it sits instead, on its own sky colour, which it fades
   * into at its top edge.
   */
  box?: { left: number; top: number; width: number; height: number; fade: number }
  /** A tight tag behind each line of the time · place text, instead of washing over the art. */
  panel?: string
}

/** The Halloween scene's sky at its top edge, sampled from the art. */
const SCENE_SKY = PURPLE

/** Deep night purple, the scene's own sky, darkened. */
const WASH = '24,10,48'

/**
 * A dark pool in the lower left, under the text, fading out before it reaches
 * the moon at the top left or the clubhouse on the right.
 */
const SCENE_POOL = `radial-gradient(ellipse 760px 430px at 0px 100%, rgba(${WASH},0.9) 0%, rgba(${WASH},0.78) 55%, rgba(${WASH},0) 100%)`

const SCENE_LAYOUTS: Record<EventCardSize, SceneLayout> = {
  link: {
    // The moon and bats stay clear: the text starts under the moon, on a
    // soft dark pool in the lower left; the brand goes up into the sky.
    col: { left: 56, top: 248, bottom: 34, width: 600 },
    top: true,
    title: { max: 92, lines: 2 },
    chip: 20,
    ticket: { max: 36, maxW: 600 },
    meta: { size: 24, maxW: 600 },
    gap: { chips: 12, title: 14, meta: 10 },
    brand: { right: 36, top: 30, size: 18 },
    wash: SCENE_POOL,
    panel: `rgba(${WASH},0.82)`,
    credit: 14,
  },
  page: {
    // As `link`, without the brand: the page is the site.
    col: { left: 56, top: 248, bottom: 34, width: 600 },
    top: true,
    title: { max: 92, lines: 2 },
    chip: 20,
    ticket: { max: 36, maxW: 600 },
    meta: { size: 24, maxW: 600 },
    gap: { chips: 12, title: 14, meta: 10 },
    wash: SCENE_POOL,
    panel: `rgba(${WASH},0.82)`,
    credit: 14,
  },
  card: {
    col: { left: 36, top: 300, bottom: 40, width: 560 },
    top: true,
    title: { max: 76, lines: 2 },
    chip: 18,
    ticket: { max: 34, maxW: 560 },
    meta: { size: 22, maxW: 560 },
    gap: { chips: 12, title: 12, meta: 8 },
    wash: SCENE_POOL,
    panel: `rgba(${WASH},0.82)`,
    credit: 14,
    // 4:3 loses the sides: keep the whole moon, give up some clubhouse.
    focalX: 37,
  },
  social: {
    // The text over the sky at the top; the scene, moon and clubhouse both,
    // across the lower half, fading up into its own sky.
    col: { left: 72, top: 80, bottom: 640, width: 936 },
    top: true,
    title: { max: 136, lines: 3 },
    chip: 28,
    ticket: { max: 52, maxW: 936 },
    meta: { size: 34, maxW: 936 },
    gap: { chips: 24, title: 24, meta: 16 },
    brand: { left: 72, bottom: 60, size: 26 },
    wash: `linear-gradient(180deg, rgba(${WASH},0.55) 0%, rgba(${WASH},0.2) 40%, rgba(${WASH},0) 50%, rgba(${WASH},0) 86%, rgba(${WASH},0.75) 100%)`,
    panel: `rgba(${WASH},0.82)`,
    credit: 18,
    box: { left: 0, top: 624, width: 1080, height: 726, fade: 150 },
    // Left of centre, so the whole moon is in.
    focalX: 45,
  },
}

/** The sizes that draw a wide scene; `social` draws the portrait one. */
export type WideSize = 'link' | 'page' | 'card'
export const isWideSize = (s: EventCardSize): s is WideSize => s === 'link' || s === 'page' || s === 'card'

type WideLayout = Layout & {
  /**
   * The city's colour under the text: solid (with its dots) to `solid` px
   * from the left edge, then a halftone ramp gone by `clear`. The text column ends inside the
   * solid part, so the type is on design C's own ground, never on the drawing.
   * `opacity` below 1 lets the drawing show faintly through the colour.
   */
  fade: { solid: number; clear: number; opacity?: number }
  /** Where the 16:9 art is anchored across, 0–100, for this shape. */
  focalX: number
  /** The mascot standing in the scene, without its arch: its centre and height. */
  mascot?: { center: number; height: number }
}

const WIDE_LAYOUTS: Record<WideSize, WideLayout> = {
  link: {
    // The text on the left as with a photo; the scene owns the right half.
    col: { left: 56, top: 36, bottom: 84, width: 560 },
    title: { max: 112, lines: 3 },
    chip: 22,
    ticket: { max: 42, maxW: 560 },
    meta: { size: 28, maxW: 560 },
    gap: { chips: 20, title: 24, meta: 14 },
    brand: { left: 56, bottom: 44, size: 22 },
    fade: { solid: 640, clear: 840 },
    focalX: 50,
    mascot: { center: 1040, height: 470 },
  },
  page: {
    // No mascot or brand: the page stands its own mascot in the right 28%.
    col: { left: 60, top: 40, bottom: 40, width: 580 },
    title: { max: 120, lines: 3 },
    chip: 22,
    ticket: { max: 44, maxW: 580 },
    meta: { size: 30, maxW: 580 },
    gap: { chips: 20, title: 26, meta: 16 },
    // The owner's call: on the event page's hero the scene shows faintly
    // through the colour, so the text panel reads as part of the place. The
    // type is all heavy and shadowed, and still reads at this strength.
    fade: { solid: 660, clear: 860, opacity: 0.8 },
    focalX: 50,
  },
  card: {
    col: { left: 40, top: 34, bottom: 34, width: 480 },
    title: { max: 100, lines: 3 },
    chip: 22,
    ticket: { max: 40, maxW: 480 },
    meta: { size: 26, maxW: 480 },
    gap: { chips: 18, title: 22, meta: 14 },
    fade: { solid: 540, clear: 690 },
    // 4:3 loses a quarter of the width: give up the calm left, which the
    // colour covers anyway.
    focalX: 70,
    mascot: { center: 848, height: 420 },
  },
}

/**
 * The city's colour with its white dots, ending in a halftone ramp: dots of
 * the colour, shrinking to nothing across the fade, as a comic prints a
 * fade. A smooth gradient would mix the colour into the drawing (yellow over
 * a blue sky turns green); dots never do. One SVG.
 *
 * The colour and its ramp are one group, so a see-through `opacity` thins
 * them as a whole: the ramp's overlapping dots do not darken where they meet.
 */
function wideGround(w: number, h: number, bg: string, theme: CardTheme, fade: WideLayout['fade']): string {
  const STEP = 16
  const span = fade.clear - fade.solid
  let dots = ''
  for (let y = 0, row = 0; y <= h + STEP; y += STEP * 0.866, row++) {
    for (let x = fade.solid + (row % 2 ? STEP / 2 : 0); x < fade.clear; x += STEP) {
      // Overlapping at the solid edge (r > STEP / 1.7 covers the gaps), then
      // shrinking as the square root, so the colour thins evenly to the eye.
      const r = STEP * 0.78 * Math.sqrt(Math.max(0, 1 - (x - fade.solid) / span))
      if (r > 0.6) dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}"/>`
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<defs><pattern id="d" width="22" height="22" patternUnits="userSpaceOnUse">` +
    `<circle cx="11" cy="11" r="3.2" fill="${theme.dot}" fill-opacity="${theme.dotOpacity}"/></pattern></defs>` +
    `<g opacity="${fade.opacity ?? 1}">` +
    `<rect width="${fade.solid}" height="${h}" fill="${bg}"/>` +
    `<g fill="${bg}">${dots}</g></g>` +
    `<rect width="${fade.solid}" height="${h}" fill="url(#d)"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/** Wide scenes cropped to a size, by `setting|size`: twelve scenes, three sizes. */
const wideCrops = new Map<string, Promise<string>>()

function wideScene(file: string, setting: EventSetting, size: WideSize): Promise<string> {
  const key = `${setting}|${size}`
  let crop = wideCrops.get(key)
  if (!crop) {
    const { width, height } = EVENT_CARD_SIZES[size]
    crop = cropToBox(file, width, height, WIDE_LAYOUTS[size].focalX, 50)
    crop.catch(() => wideCrops.delete(key))
    wideCrops.set(key, crop)
  }
  return crop
}

/**
 * `file` cropped to exactly `w`×`h` around its focal point, as a JPEG data
 * URI: scaled to cover the box, then cut so the focal point is as near the
 * middle as the edges allow.
 */
async function cropToBox(file: string, w: number, h: number, focalX = 50, focalY = 50): Promise<string> {
  const img = sharp(file).rotate()
  const meta = await img.metadata()
  const upright = (meta.orientation ?? 1) >= 5
  const iw = (upright ? meta.height : meta.width) ?? w
  const ih = (upright ? meta.width : meta.height) ?? h
  const scale = Math.max(w / iw, h / ih)
  const rw = Math.max(w, Math.round(iw * scale))
  const rh = Math.max(h, Math.round(ih * scale))
  const clamp = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), max)
  const left = clamp((focalX / 100) * rw - w / 2, rw - w)
  const top = clamp((focalY / 100) * rh - h / 2, rh - h)
  const jpeg = await img.resize(rw, rh).extract({ left, top, width: w, height: h }).jpeg({ quality: 84 }).toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

/** The box a picture fills on this card, or null when this size has no place for one. */
function pictureBox(picture: CardPicture, size: EventCardSize): { w: number; h: number; fx?: number; fy?: number } | null {
  if (picture.mode === 'frame') {
    if (!isPhotoSize(size)) return null
    const f = PHOTO_LAYOUTS[size].frame
    return { w: f.width - f.border * 2, h: f.height - f.border * 2 }
  }
  const S = SCENE_LAYOUTS[size]
  const { width, height } = S.box ?? EVENT_CARD_SIZES[size]
  return { w: width, h: height, fx: S.focalX, fy: S.focalY }
}

/** The media file of an event's photo, for the card: the 1920 `hero` size where there is one. */
export function mediaFilePath(m: Media, dir: string = process.env.MEDIA_DIR || resolve('media')): string | null {
  const name = m.sizes?.hero?.filename ?? m.filename
  return name ? join(dir, basename(name)) : null
}

/**
 * An event's photo as a card picture, with its credit line, or null when the
 * event has no photo. A photo with no credit on file (the site's own) is drawn
 * without a credit strip.
 */
export function eventCardPicture(ev: Event, lang: Lang): CardPicture | null {
  const m = ev.image && typeof ev.image === 'object' ? (ev.image as Media) : null
  if (!m?.mimeType?.startsWith('image/')) return null
  const file = mediaFilePath(m)
  if (!file) return null
  const c = photoCredit(m, lang, { cropped: true, card: true })
  return {
    mode: 'frame',
    file,
    focalX: m.focalX,
    focalY: m.focalY,
    credit: c ? photoCreditText(c) : '',
    key: `media:${m.id}:${m.updatedAt}`,
  }
}

/**
 * The white dot grid over the city's colour, 22px apart. An SVG pattern drawn
 * as one image: Satori does not tile a repeating radial-gradient.
 */
function halftone(w: number, h: number, theme: CardTheme): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<defs><pattern id="d" width="22" height="22" patternUnits="userSpaceOnUse">` +
    `<circle cx="11" cy="11" r="3.2" fill="${theme.dot}" fill-opacity="${theme.dotOpacity}"/></pattern></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#d)"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function Chip({
  text,
  size,
  solid,
  color,
  bg,
  theme,
}: {
  text: string
  size: number
  solid: boolean
  color?: string
  /** A solid chip's own ground, in place of the theme's. */
  bg?: string
  theme: CardTheme
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'Archivo',
        fontWeight: 800,
        fontSize: size,
        letterSpacing: '0.08em',
        // A little more above than below: Archivo's caps sit high in the line box.
        padding: `${Math.round(size * 0.32) + 2}px ${Math.round(size * 0.64)}px ${Math.round(size * 0.32) - 2}px`,
        background: solid ? (bg ?? theme.chipBg) : 'transparent',
        color: solid ? (theme.chipText ?? color ?? YELLOW) : theme.text,
        border: solid ? 'none' : `3px solid ${theme.text}`,
      }}
    >
      {text.toLocaleUpperCase()}
    </div>
  )
}

/**
 * The photo's frame and its credit strip: an ink border with the site's hard
 * ink shadow, the photo cropped to fill it, and the credit on a solid ink strip
 * along its bottom edge (never bare type on a busy photo).
 */
function PhotoFrame({ photo, L, mascotW = 0 }: { photo: DrawnPhoto; L: PhotoLayout; mascotW?: number }) {
  const f = L.frame
  const innerW = f.width - f.border * 2
  const padX = Math.round(L.credit * 0.6)
  // Clear of a small mascot standing on the frame's bottom right.
  const stripW = innerW - (mascotW ? Math.round(mascotW * 0.85) : 0)
  const room = stripW - padX * 2
  const creditSize = photo.credit
    ? fitLine(photo.credit, room, L.credit, Math.max(11, Math.round(L.credit * 0.7)), ARCHIVO_800, 0.02)
    : 0
  const rows = photo.credit ? breakAtSeparators(photo.credit.split(' · '), room, creditSize) : []
  return (
    <div
      style={{
        position: 'absolute',
        left: f.left,
        top: f.top,
        width: f.width,
        height: f.height,
        display: 'flex',
        border: `${f.border}px solid ${INK}`,
        background: INK,
        boxShadow: `${f.shadow}px ${f.shadow}px 0 ${INK}`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.src} width={innerW} height={f.height - f.border * 2} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
      {rows.length ? (
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          maxWidth: stripW,
          background: INK,
          padding: `${Math.round(L.credit * 0.42)}px ${padX}px ${Math.round(L.credit * 0.32)}px`,
        }}
      >
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              fontFamily: 'Archivo',
              fontWeight: 800,
              fontSize: creditSize,
              lineHeight: 1.25,
              letterSpacing: '0.02em',
              color: CREAM,
            }}
          >
            {row}
          </div>
        ))}
      </div>
      ) : null}
    </div>
  )
}

/** A scene's credit: one small line on an ink tab in the card's bottom right corner. */
function SceneCredit({ credit, size, W }: { credit: string; size: number; W: number }) {
  const padX = Math.round(size * 0.6)
  const maxW = Math.round(W * 0.62)
  const fontSize = fitLine(credit, maxW - padX * 2, size, 10, ARCHIVO_800, 0.02)
  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        bottom: 0,
        display: 'flex',
        maxWidth: maxW,
        background: `rgba(12,15,20,0.82)`,
        padding: `${Math.round(size * 0.42)}px ${padX}px ${Math.round(size * 0.32)}px`,
        fontFamily: 'Archivo',
        fontWeight: 800,
        fontSize,
        lineHeight: 1.25,
        letterSpacing: '0.02em',
        color: CREAM,
      }}
    >
      {credit}
    </div>
  )
}

function Card({
  d,
  size,
  mascot,
  theme,
  backdrop: backdropIn,
  wide: wideIn,
  photo,
  scene,
  photoMascot = false,
}: {
  d: EventCardData
  size: EventCardSize
  mascot?: Mascot
  theme: CardTheme
  /** A drawn scene (data URI) in place of the colour and halftone. */
  backdrop?: string
  /** A wide scene cropped to this size (data URI), under the city colour's fade (`WIDE_LAYOUTS`). */
  wide?: string
  /** The event's photo in a frame where the arch stood (`PHOTO_LAYOUTS`). */
  photo?: DrawnPhoto
  /** A season's scene behind everything (`SCENE_LAYOUTS`). */
  scene?: DrawnPhoto
  /** With a photo, keep the mascot, small and without its arch. Drawn for comparison only. */
  photoMascot?: boolean
}) {
  const { width: W, height: H } = EVENT_CARD_SIZES[size]
  const P = photo && isPhotoSize(size) ? PHOTO_LAYOUTS[size] : undefined
  const S = scene && !P ? SCENE_LAYOUTS[size] : undefined
  // The event's own photo wins over a generic drawn setting.
  const backdrop = P || S ? undefined : backdropIn
  const Wd = wideIn && !P && !S && !backdrop && isWideSize(size) ? WIDE_LAYOUTS[size] : undefined
  const L: Layout = P ?? S ?? Wd ?? LAYOUTS[size]
  const colH = H - L.col.top - L.col.bottom
  const smallMascot = P && photoMascot && mascot ? mascot : undefined
  const smallMascotH = P ? Math.round(P.frame.height * 0.55) : 0
  const smallMascotW = smallMascot ? Math.round((smallMascot.width / smallMascot.height) * smallMascotH) : 0

  const ticketText = d.dateLine
  const ticketPadX = Math.round(L.ticket.max * 0.55)
  const ticketSize = fitLine(ticketText, L.ticket.maxW - ticketPadX * 2, L.ticket.max, 24, LUCKIEST_GUY, 0.01)
  const ticketH = ticketSize + Math.round(L.ticket.max * 0.32) * 2 + 6

  // Time · place on one line where it fits; a long one shrinks a little, then
  // breaks between its parts rather than inside a name.
  // Over a scene each row sits on a cream strip, whose padding takes width.
  const metaW = backdrop ? L.meta.maxW - 24 : L.meta.maxW
  const metaSize = d.meta ? fitLine(d.meta, metaW, L.meta.size, Math.round(L.meta.size * 0.8), ARCHIVO_800) : 0
  const metaRows = d.meta ? breakAtSeparators(d.meta.split(' · '), metaW, metaSize) : []
  const metaH = d.meta ? L.gap.meta + metaRows.length * metaSize * 1.2 : 0

  // A season's chip can push the row past the column and wrap it, so the title gets the rows' real height.
  const chipRowH = L.chip * 1.2 + Math.round(L.chip * 0.32) * 2 + 6
  const rows = chipRows(d, L.chip, L.col.width)
  const chipsH = rows * chipRowH + (rows - 1) * CHIP_GAP
  const titleRoom = L.titleBottom
    ? L.titleBottom - L.col.top - chipsH - L.gap.chips
    : colH - chipsH - L.gap.chips - L.gap.title - ticketH - metaH - 8
  const title = d.title ? fitTitle(d.title, L.col.width - 8, titleRoom, L.title.max, L.title.lines) : null

  // A photo or a season's scene takes the arch's place, mascot and all.
  const arch = mascot && !P && !S ? L.arch : undefined
  // Over a drawn setting the mascot stands in it, so only the arch goes.
  const showArch = !!arch && !backdrop
  const mascotH = L.mascotH ?? 0
  const mascotW = mascot ? Math.round((mascot.width / mascot.height) * mascotH) : 0
  const archCenter = arch ? W - arch.right - arch.width / 2 : 0
  // Over a wide scene the mascot stands in the drawing, without an arch.
  const wideMascotH = Wd?.mascot && mascot ? Wd.mascot.height : 0
  const wideMascotW = wideMascotH && mascot ? Math.round((mascot.width / mascot.height) * wideMascotH) : 0

  const ticket = (
    <div
      style={{
        display: 'flex',
        whiteSpace: 'nowrap',
        background: theme.ticketBg,
        color: theme.ticketText,
        fontFamily: 'Luckiest Guy',
        fontSize: ticketSize,
        lineHeight: 1,
        letterSpacing: '0.01em',
        padding: `${Math.round(L.ticket.max * 0.32) + 3}px ${ticketPadX}px ${Math.round(L.ticket.max * 0.32) - 1}px`,
      }}
    >
      {ticketText}
    </div>
  )
  const meta = d.meta ? (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: L.gap.meta }}>
      {metaRows.map((row, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            maxWidth: L.meta.maxW,
            fontFamily: 'Archivo',
            fontWeight: 800,
            fontSize: metaSize,
            lineHeight: 1.2,
            color: theme.text,
            // On its cream strip the line is ink, whatever the palette's own text colour.
            ...(backdrop ? { background: CREAM, color: INK, padding: '4px 12px', marginTop: i ? 6 : 0 } : {}),
            // Over a season's scene: each line on its own tight dark tag, not a wash over the art.
            ...(S?.panel ? { background: S.panel, padding: `2px ${Math.round(metaSize * 0.35)}px`, alignSelf: 'flex-start' } : {}),
          }}
        >
          {row}
        </div>
      ))}
    </div>
  ) : null

  return (
    <div
      style={{
        width: W,
        height: H,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: theme.bg ?? d.bg,
        fontFamily: 'Archivo',
        color: theme.text,
      }}
    >
      {backdrop ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backdrop} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} />
          {theme.sceneWash ? (
            <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', background: theme.sceneWash }} />
          ) : null}
          {theme.backdropShade ? (
            <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', backgroundImage: theme.backdropShade }} />
          ) : null}
        </>
      ) : Wd && wideIn ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wideIn} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
          {theme.sceneWash ? (
            <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', background: theme.sceneWash }} />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={wideGround(W, H, theme.bg ?? d.bg, theme, Wd.fade)}
            width={W}
            height={H}
            alt=""
            style={{ position: 'absolute', left: 0, top: 0 }}
          />
        </>
      ) : S && scene ? (
        <>
          {S.box ? (
            <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', background: SCENE_SKY }} />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scene.src}
            width={S.box?.width ?? W}
            height={S.box?.height ?? H}
            alt=""
            style={{ position: 'absolute', left: S.box?.left ?? 0, top: S.box?.top ?? 0 }}
          />
          {S.box ? (
            <div
              style={{
                position: 'absolute',
                left: S.box.left,
                top: S.box.top - 1,
                width: S.box.width,
                height: S.box.fade,
                display: 'flex',
                backgroundImage: `linear-gradient(180deg, ${SCENE_SKY} 0%, ${SCENE_SKY}00 100%)`,
              }}
            />
          ) : null}
          <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', backgroundImage: S.wash }} />
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={halftone(W, H, theme)} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
      )}
      {P && photo ? <PhotoFrame photo={photo} L={P} mascotW={smallMascotW} /> : null}
      {P && smallMascot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={smallMascot.src}
          width={smallMascotW}
          height={smallMascotH}
          alt=""
          style={{
            position: 'absolute',
            left: P.frame.left + P.frame.width - smallMascotW + Math.round(smallMascotW * 0.18),
            top: P.frame.top + P.frame.height - smallMascotH + Math.round(smallMascotH * 0.1),
          }}
        />
      ) : null}
      {/* The page hero's credit is the page's own linked caption under it, so it is not printed twice. */}
      {S && scene?.credit && size !== 'page' ? <SceneCredit credit={scene.credit} size={S.credit} W={W} /> : null}
      <div
        style={{
          position: 'absolute',
          left: L.col.left,
          top: L.col.top,
          width: L.col.width,
          height: colH,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: L.top ? 'flex-start' : 'center',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ display: 'flex', gap: CHIP_GAP, flexWrap: 'wrap', marginBottom: L.gap.chips }}>
          {d.city ? (
            <Chip text={d.city} size={L.chip} solid color={d.citySlug === 'lakes' ? CYAN : YELLOW} theme={theme} />
          ) : null}
          {d.kind ? <Chip text={d.kind} size={L.chip} solid={false} theme={theme} /> : null}
          {d.season ? <Chip text={d.season} size={L.chip} solid bg={ORANGE} color={INK} theme={theme} /> : null}
          {d.status ? <Chip text={d.status} size={L.chip} solid color={CREAM} theme={theme} /> : null}
        </div>
        {title ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: L.gap.title }}>
            {title.lines.map((line, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Luckiest Guy',
                  fontSize: title.size,
                  lineHeight: TITLE_LH,
                  letterSpacing: '0.01em',
                  color: theme.title,
                  textShadow: `5px 5px 0 ${theme.titleShadow}`,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        ) : null}
        {ticket}
        {meta}
      </div>

      {showArch && arch && mascot ? (
        <div
          style={{
            position: 'absolute',
            right: arch.right,
            bottom: arch.bottom,
            width: arch.width,
            height: arch.height,
            borderRadius: `${arch.width / 2}px ${arch.width / 2}px 0 0`,
            background: theme.archBg,
            border: `${arch.border}px solid ${theme.archBorder}`,
          }}
        />
      ) : null}
      {arch && mascot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mascot.src}
          width={mascotW}
          height={mascotH}
          alt=""
          style={{ position: 'absolute', left: Math.round(archCenter - mascotW / 2), bottom: -4 }}
        />
      ) : null}
      {Wd?.mascot && mascot && wideMascotH ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mascot.src}
          width={wideMascotW}
          height={wideMascotH}
          alt=""
          style={{ position: 'absolute', left: Math.round(Wd.mascot.center - wideMascotW / 2), bottom: -4 }}
        />
      ) : null}

      {L.brand ? (
        <div
          style={{
            position: 'absolute',
            // Only the sides it is anchored to: Satori chokes on an undefined offset.
            ...Object.fromEntries(
              (['left', 'right', 'top', 'bottom'] as const).filter((k) => L.brand?.[k] !== undefined).map((k) => [k, L.brand![k]]),
            ),
            display: 'flex',
            fontFamily: 'Archivo',
            fontWeight: 800,
            fontSize: L.brand.size,
            letterSpacing: '0.12em',
            color: theme.text,
            ...(backdrop ? { background: CREAM, color: INK, padding: '8px 14px 6px', marginLeft: -14 } : {}),
          }}
        >
          FLAMINGOCOUNTY.COM
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* Rendering                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Recently drawn cards, keyed by exactly what they draw. Crawlers and the
 * board ask for the same few often, and a draw takes 100–300 ms.
 */
const cache = new Map<string, ArrayBuffer>()
const CACHE_MAX = 48

/**
 * Any card as PNG bytes: its data, size and palette, whose mascot stands in
 * the arch, and the picture it draws, if any (`CardPicture`).
 */
async function drawCard(
  d: EventCardData,
  size: EventCardSize,
  theme: CardTheme,
  themeName: string,
  mascotSlug: string,
  setting: EventSetting | null = null,
  opts: { picture?: CardPicture | null; photoMascot?: boolean } = {},
): Promise<ArrayBuffer> {
  const pic = opts.picture ?? null
  const box = pic ? pictureBox(pic, size) : null
  const picKey = pic && box ? `${pic.mode}|${pic.key}|${pic.focalX ?? ''},${pic.focalY ?? ''}|${pic.credit}|${opts.photoMascot ? 'm' : ''}` : ''
  const key = `${size}|${themeName}|${mascotSlug}|${setting ?? ''}|${picKey}|${JSON.stringify(d)}`
  const hit = cache.get(key)
  if (hit) return hit

  const a = await loadAssets()
  // The page card has no mascot: the page draws its own over the right side.
  const mascot = size === 'page' ? undefined : a.mascots[mascotSlug]
  // The poster draws the portrait scene, the wide sizes its wide version.
  const backdrop = setting && size === 'social' ? a.settings[setting] : undefined
  const wideFile = setting && isWideSize(size) ? a.wide[setting] : undefined
  const wide = wideFile && setting && isWideSize(size) ? await wideScene(wideFile, setting, size) : undefined
  const drawn =
    pic && box
      ? { src: await cropToBox(pic.file, box.w, box.h, box.fx ?? pic.focalX ?? 50, box.fy ?? pic.focalY ?? 50), credit: pic.credit }
      : undefined
  const { width, height } = EVENT_CARD_SIZES[size]
  const card = (
    <Card
      d={d}
      size={size}
      mascot={mascot}
      theme={theme}
      backdrop={backdrop}
      wide={wide}
      photo={pic?.mode === 'frame' ? drawn : undefined}
      scene={pic?.mode === 'scene' ? drawn : undefined}
      photoMascot={opts.photoMascot}
    />
  )
  const res = new ImageResponse(card, {
    width,
    height,
    fonts: [
      { name: 'Luckiest Guy', data: a.luckiest, weight: 400, style: 'normal' },
      { name: 'Archivo', data: a.archivo, weight: 800, style: 'normal' },
    ],
  })
  const png = await res.arrayBuffer()
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, png)
  return png
}

/**
 * The card as PNG bytes. `today` matters to the date line only: a run that
 * has started reads "Hasta el …" rather than "Del … al …".
 */
export async function renderEventCard(
  ev: Event,
  lang: Lang,
  size: EventCardSize,
  today: string = todayISO(),
  /** With a photo, keep a small mascot. Only to draw the other option for comparison; the route never passes it. */
  opts: { photoMascot?: boolean } = {},
): Promise<ArrayBuffer> {
  const bg = eventCardBackground(ev, lang, size)
  // The page hero shows an event's photo itself, so its `page` card (never
  // asked for by the site) stays the plain one.
  const picture = bg.kind === 'photo' && isPhotoSize(size) ? bg.picture : null
  const setting = bg.kind === 'scene' ? bg.setting : null
  // A seasonal event wears its season's palette and chip (lib/seasons.ts) on
  // its hero, its link preview and its social poster; the board's tile stays
  // in the city's colour among the others.
  const look = size === 'card' ? undefined : getSeason(ev.season)?.card.event
  const d = { ...eventCardData(ev, lang, today), ...(look ? { season: look.chip[lang] } : {}) }
  const theme = look ? SEASON_THEMES[look.theme] : DESIGN_C
  return drawCard(d, size, theme, look?.theme ?? 'c', d.citySlug, setting, { picture, photoMascot: opts.photoMascot })
}

/** What an event's card is drawn on, at a size. */
export type CardBackground =
  | { kind: 'photo'; picture: CardPicture }
  | { kind: 'scene'; setting: EventSetting; art: 'portrait' | 'wide' }
  | { kind: 'flat' }

/**
 * The event's own photo wins at every size; without one, the scene
 * `eventSetting` picks (the poster's portrait art, the wide art at `link`,
 * `page` and `card`); without a scene, the city's flat colour.
 */
export function eventCardBackground(ev: Event, lang: Lang, size: EventCardSize): CardBackground {
  const picture = eventCardPicture(ev, lang)
  if (picture) return { kind: 'photo', picture }
  const setting = eventSetting(ev)
  if (!setting) return { kind: 'flat' }
  return { kind: 'scene', setting, art: size === 'social' ? 'portrait' : 'wide' }
}

/**
 * What a seasonal guide's card draws: the guide's title, its city and a
 * "guide" chip, the year on the ticket and the one-line pitch. All of it is
 * the guide's own copy from lib/seasons.ts, nothing about any one event.
 */
export function seasonCardData(season: Season, lang: Lang, year: number): EventCardData {
  return {
    title: season.card.title[lang],
    city: season.card.city.name,
    citySlug: season.card.city.slug,
    bg: CITY_BG[season.card.city.slug] ?? PINK,
    kind: season.card.chip[lang],
    status: '',
    dateLine: String(year),
    meta: season.card.line[lang],
  }
}

/** A season's drawn scene as a card picture, or null when the season has none. */
export function seasonCardPicture(season: Season, lang: Lang): CardPicture | null {
  const s = season.card.scene
  if (!s) return null
  return {
    mode: 'scene',
    file: join(ASSET_DIR, s.file),
    focalX: s.focalX,
    focalY: s.focalY,
    credit: sceneCreditText(s, lang),
    key: `scene:${s.file}`,
  }
}

/**
 * A seasonal guide's card: the guide's hero and its og:image, over the
 * season's scene when it has one. `theme` and `scene: false` override the
 * season's own, only so the other option can be drawn for comparison; the
 * route never passes them.
 */
export async function renderSeasonCard(
  season: Season,
  lang: Lang,
  size: EventCardSize,
  year: number,
  theme: SeasonCardTheme = season.card.theme,
  opts: { scene?: boolean } = {},
): Promise<ArrayBuffer> {
  const picture = opts.scene === false ? null : seasonCardPicture(season, lang)
  return drawCard(seasonCardData(season, lang, year), size, SEASON_THEMES[theme], theme, season.card.mascot, null, { picture })
}
