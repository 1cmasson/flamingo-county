import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

import { noPrice } from '../fields/shared'
import { translator, type Lang } from '../i18n'
import type { City, Event, EventKind } from '../payload-types'
import { ARCHIVO_800, LUCKIEST_GUY } from './cardMetrics'
import { EVENT_CARD_SIZES, type EventCardSize } from './eventCardUrl'
import { eventDateLine, todayISO } from './dates'
import { EVENT_SETTINGS, eventSetting, type EventSetting } from './eventSetting'
import { eventVenue } from './eventVenue'
import type { Season, SeasonCardTheme } from './seasons'

/**
 * The event card: the picture an event with no photo gets, drawn from its own
 * fields. The design is the one the owner picked ("C"): the city's colour with
 * a white halftone, the city and kind as chips, the title huge in Luckiest Guy
 * with a cream offset shadow, the date on an ink ticket, then time · place,
 * and the city's mascot standing in a cream arch on the right.
 *
 * The social poster can instead stand on a drawn scene (`eventSetting`): the
 * scene replaces the colour and halftone, the mascot stands in it without the
 * arch, and the small text sits on cream strips so it reads over the drawing.
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
      return { luckiest, archivo, mascots, settings }
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
  brand?: { left: number; bottom: number; size: number }
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
  theme,
}: {
  text: string
  size: number
  solid: boolean
  color?: string
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
        background: solid ? theme.chipBg : 'transparent',
        color: solid ? (theme.chipText ?? color ?? YELLOW) : theme.text,
        border: solid ? 'none' : `3px solid ${theme.text}`,
      }}
    >
      {text.toLocaleUpperCase()}
    </div>
  )
}

function Card({
  d,
  size,
  mascot,
  theme,
  backdrop,
}: {
  d: EventCardData
  size: EventCardSize
  mascot?: Mascot
  theme: CardTheme
  /** A drawn scene (data URI) in place of the colour and halftone. */
  backdrop?: string
}) {
  const { width: W, height: H } = EVENT_CARD_SIZES[size]
  const L = LAYOUTS[size]
  const colH = H - L.col.top - L.col.bottom

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

  const chipsH = L.chip * 1.2 + Math.round(L.chip * 0.32) * 2 + 6
  const titleRoom = L.titleBottom
    ? L.titleBottom - L.col.top - chipsH - L.gap.chips
    : colH - chipsH - L.gap.chips - L.gap.title - ticketH - metaH - 8
  const title = d.title ? fitTitle(d.title, L.col.width - 8, titleRoom, L.title.max, L.title.lines) : null

  const arch = mascot ? L.arch : undefined
  // Over a scene the mascot stands in it, so the arch goes.
  const showArch = !!arch && !backdrop
  const mascotH = L.mascotH ?? 0
  const mascotW = mascot ? Math.round((mascot.width / mascot.height) * mascotH) : 0
  const archCenter = arch ? W - arch.right - arch.width / 2 : 0

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
            ...(backdrop ? { background: CREAM, padding: '4px 12px', marginTop: i ? 6 : 0 } : {}),
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={backdrop} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0, objectFit: 'cover' }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={halftone(W, H, theme)} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
      )}
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: L.gap.chips }}>
          {d.city ? (
            <Chip text={d.city} size={L.chip} solid color={d.citySlug === 'lakes' ? CYAN : YELLOW} theme={theme} />
          ) : null}
          {d.kind ? <Chip text={d.kind} size={L.chip} solid={false} theme={theme} /> : null}
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

      {L.brand ? (
        <div
          style={{
            position: 'absolute',
            left: L.brand.left,
            bottom: L.brand.bottom,
            display: 'flex',
            fontFamily: 'Archivo',
            fontWeight: 800,
            fontSize: L.brand.size,
            letterSpacing: '0.12em',
            color: theme.text,
            ...(backdrop ? { background: CREAM, padding: '8px 14px 6px', marginLeft: -14 } : {}),
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

/** Any card as PNG bytes: its data, size and palette, and whose mascot stands in the arch. */
async function drawCard(
  d: EventCardData,
  size: EventCardSize,
  theme: CardTheme,
  themeName: string,
  mascotSlug: string,
  setting: EventSetting | null = null,
): Promise<ArrayBuffer> {
  const key = `${size}|${themeName}|${mascotSlug}|${setting ?? ''}|${JSON.stringify(d)}`
  const hit = cache.get(key)
  if (hit) return hit

  const a = await loadAssets()
  // The page card has no mascot: the page draws its own over the right side.
  const mascot = size === 'page' ? undefined : a.mascots[mascotSlug]
  const backdrop = setting ? a.settings[setting] : undefined
  const { width, height } = EVENT_CARD_SIZES[size]
  const res = new ImageResponse(<Card d={d} size={size} mascot={mascot} theme={theme} backdrop={backdrop} />, {
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
): Promise<ArrayBuffer> {
  const d = eventCardData(ev, lang, today)
  // Only the social poster has room for a scene; the wide sizes stay flat.
  const setting = size === 'social' ? eventSetting(ev) : null
  return drawCard(d, size, DESIGN_C, 'c', d.citySlug, setting)
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

/**
 * A seasonal guide's card: the guide's hero and its og:image. `theme`
 * overrides the season's own palette, only so the other option can be drawn
 * for comparison; the route never passes it.
 */
export async function renderSeasonCard(
  season: Season,
  lang: Lang,
  size: EventCardSize,
  year: number,
  theme: SeasonCardTheme = season.card.theme,
): Promise<ArrayBuffer> {
  return drawCard(seasonCardData(season, lang, year), size, SEASON_THEMES[theme], theme, season.card.mascot)
}
