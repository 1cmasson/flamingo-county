import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Event } from '../payload-types'
import { ARCHIVO_800, LUCKIEST_GUY } from './cardMetrics'
import { addDays, parseISO } from './dates'
import { cardFonts } from './eventCard'
import { EVENT_CARD_SIZES } from './eventCardUrl'
import { renderOgPng } from './ogImage'
import { coverScene, eventsPerDay, isAnnounceable, unshout, weekCities, weekEvents, weekRange, type CoverScene } from './week'

/**
 * The cover of the Monday roundup (lib/weeklyRoundup.ts): the first picture
 * of the carousel and the one the profile grid shows, so it is drawn as a
 * recurring series. Every week the same layout in the brand's shared colours
 * (ink, cream, yellow, the site's pink-to-yellow ground), never one city's
 * accent, and no mascot: each mascot stands for its city. What changes week
 * to week is the drawn scene behind it (`coverScene`) and the facts.
 *
 * Instagram's 4:5, the event cards' `social` size, so the carousel is one
 * shape. The headline and the dates sit inside the 1:1 square the old grid
 * cropped to (y 135–1215) and 50px clear of the sides the 3:4 grid trims.
 *
 * Only facts from the week's published events: how many, which cities, which
 * days. Satori draws no emoji (it would fetch them from a CDN).
 */

const INK = '#0c0f14'
const CREAM = '#fff6e5'
const YELLOW = '#ffd400'
const PINK = '#ff2e88'

const { width: W, height: H } = EVENT_CARD_SIZES.social

export type WeekCoverData = {
  monday: string
  scene: CoverScene
  /** Distinct events in the week. */
  count: number
  /** The cities of this week's events, as the site writes them, most events first. Never a fixed list. */
  cities: string[]
  /** How many events are on each of the seven days, Monday first: an exhibit lights every day it is open. */
  perDay: number[]
}

/** The cover's facts, from the week's published events (read at depth ≥ 2): the ones the roundup announces. */
export function weekCoverData(monday: string, events: Event[]): WeekCoverData {
  const days = weekEvents(events.filter(isAnnounceable), monday)
  const listed = days.flatMap((d) => d.items)
  const cities = weekCities(listed)
  return {
    monday,
    scene: coverScene(monday, cities.map((c) => c.slug)),
    count: listed.length,
    cities: cities.map((c) => unshout(c.name)),
    perDay: eventsPerDay(listed, monday),
  }
}

const ASSET_DIR = join(process.cwd(), 'src/assets/og')
const scenes = new Map<CoverScene, Promise<string>>()

function sceneSrc(scene: CoverScene): Promise<string> {
  let src = scenes.get(scene)
  if (!src) {
    src = readFile(join(ASSET_DIR, `settings/${scene}.jpg`)).then((b) => `data:image/jpeg;base64,${b.toString('base64')}`)
    src.catch(() => scenes.delete(scene))
    scenes.set(scene, src)
  }
  return src
}

function width(text: string, table: Record<string, number>, size: number, spacingEm = 0): number {
  let em = 0
  for (const ch of text) em += (table[ch] ?? 0.72) + spacingEm
  return em * size * 1.05
}

/** The largest size up to `max` at which `text` fits `maxW` on one line. */
function fit(text: string, maxW: number, max: number, table: Record<string, number>, spacingEm = 0): number {
  return Math.min(max, Math.floor(maxW / Math.max(width(text, table, 1, spacingEm), 0.01)))
}

/** The site's ground (PageShell): ink dots over pink running into yellow. */
function ground(w: number, h: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0.14" y2="1">` +
    `<stop offset="0" stop-color="#FF2E88"/><stop offset="0.34" stop-color="#FF4A97"/><stop offset="0.58" stop-color="#FF74AD"/>` +
    `<stop offset="0.82" stop-color="#FFB35C"/><stop offset="1" stop-color="#FFD400"/></linearGradient>` +
    `<pattern id="d" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="7.5" cy="7.5" r="1.7" fill="${INK}"/></pattern></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#d)"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const DAY_LETTERS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

/** Satori draws a space after Luckiest Guy's Y about twice as wide; a no-break space draws true. */
const nbsp = (s: string) => s.replace(/ /g, ' ')

const SIDE = 64
/** The ground band across the top, and where the scene starts under it. */
const BAND = 150
const PANEL = { left: SIDE, top: BAND + 44, pad: 40, border: 6, shadow: 12 }
const TITLE = 186

function Cover({ d, scene }: { d: WeekCoverData; scene: string }) {
  const range = weekRange(d.monday, 'es')
  const rangeSize = fit(range, 640, 120, LUCKIEST_GUY, 0.01)
  const count = `${d.count} ${d.count === 1 ? 'EVENTO' : 'EVENTOS'}`
  const countEn = `${d.count} ${d.count === 1 ? 'EVENT' : 'EVENTS'}`
  const cities = d.cities.length > 3 ? [...d.cities.slice(0, 3), `+${d.cities.length - 3}`] : d.cities
  const cityLine = cities.join(' · ').toUpperCase()
  const citySize = fit(cityLine, W - SIDE * 2 - 44, 34, ARCHIVO_800, 0.06)
  const tile = { w: 124, h: 132, gap: (W - SIDE * 2 - 124 * 7) / 6 }

  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', overflow: 'hidden', background: INK }}>
      {/* The scene, let down under the band so its landmark sits in the
          card's middle, clear of the headline. Its plain foreground is what
          falls off the bottom. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={scene} width={W} height={H} alt="" style={{ position: 'absolute', left: 0, top: BAND }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ground(W, BAND)} width={W} height={BAND} alt="" style={{ position: 'absolute', left: 0, top: 0 }} />
      <div style={{ position: 'absolute', left: 0, top: BAND - 6, width: W, height: 6, display: 'flex', background: INK }} />

      {/* The band: the series' name and the site. */}
      <div
        style={{
          position: 'absolute',
          left: SIDE,
          right: SIDE,
          top: 46,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            background: INK,
            color: YELLOW,
            fontFamily: 'Archivo',
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: '0.14em',
            padding: '13px 18px 10px',
          }}
        >
          AGENDA SEMANAL
        </div>
        <div
          style={{
            display: 'flex',
            background: CREAM,
            color: INK,
            border: `4px solid ${INK}`,
            fontFamily: 'Archivo',
            fontWeight: 800,
            fontSize: 24,
            letterSpacing: '0.12em',
            padding: '10px 14px 7px',
          }}
        >
          FLAMINGOCOUNTY.COM
        </div>
      </div>

      {/* The masthead, as the site's events page draws its own: ink, a
          cream offset shadow, the headline in cream. */}
      <div
        style={{
          position: 'absolute',
          left: PANEL.left,
          top: PANEL.top,
          display: 'flex',
          flexDirection: 'column',
          background: INK,
          border: `${PANEL.border}px solid ${INK}`,
          boxShadow: `${PANEL.shadow}px ${PANEL.shadow}px 0 ${CREAM}`,
          padding: `${PANEL.pad + 6}px ${PANEL.pad + 8}px ${PANEL.pad - 2}px`,
        }}
      >
        {['ESTA', 'SEMANA'].map((line) => (
          <div
            key={line}
            style={{
              display: 'flex',
              fontFamily: 'Luckiest Guy',
              fontSize: TITLE,
              lineHeight: 0.9,
              letterSpacing: '0.01em',
              color: CREAM,
              textShadow: `6px 6px 0 ${PINK}`,
            }}
          >
            {line}
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            marginTop: 16,
            fontFamily: 'Luckiest Guy',
            fontSize: 84,
            lineHeight: 0.95,
            letterSpacing: '0.01em',
            color: YELLOW,
          }}
        >
          {nbsp('THIS WEEK')}
        </div>
      </div>

      {/* The dates, on a ticket pinned over the masthead's corner. */}
      <div
        style={{
          position: 'absolute',
          right: SIDE - 6,
          top: 640,
          display: 'flex',
          transform: 'rotate(-4deg)',
          background: YELLOW,
          color: INK,
          border: `6px solid ${INK}`,
          boxShadow: `10px 10px 0 ${INK}`,
          fontFamily: 'Luckiest Guy',
          fontSize: rangeSize,
          lineHeight: 1,
          padding: `${Math.round(rangeSize * 0.22) + 4}px 30px ${Math.round(rangeSize * 0.12)}px`,
        }}
      >
        {nbsp(range)}
      </div>

      {/* The week: seven days, the ones with something on lit up. */}
      <div style={{ position: 'absolute', left: SIDE, top: 1000, display: 'flex', gap: tile.gap }}>
        {d.perDay.map((n, i) => {
          const on = n > 0
          return (
            <div
              key={i}
              style={{
                width: tile.w,
                height: tile.h,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: on ? YELLOW : CREAM,
                border: `5px solid ${INK}`,
                // Spread in only when it is there: `boxShadow: 'none'` makes
                // Satori draw an ink box in the card's top left corner.
                ...(on ? { boxShadow: `6px 6px 0 ${INK}` } : {}),
                color: on ? INK : '#a9a397',
              }}
            >
              <div style={{ display: 'flex', fontFamily: 'Archivo', fontWeight: 800, fontSize: 23, letterSpacing: '0.08em' }}>
                {DAY_LETTERS[i]}
              </div>
              <div style={{ display: 'flex', fontFamily: 'Luckiest Guy', fontSize: 60, lineHeight: 1, marginTop: 6 }}>
                {parseISO(addDays(d.monday, i)).getUTCDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* How many, and where. */}
      <div
        style={{
          position: 'absolute',
          left: SIDE,
          top: 1170,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            background: INK,
            fontFamily: 'Luckiest Guy',
            lineHeight: 1,
            padding: '15px 22px 7px',
          }}
        >
          <div style={{ display: 'flex', fontSize: 52, color: CREAM }}>{nbsp(count)}</div>
          <div style={{ display: 'flex', fontSize: 34, color: YELLOW, marginLeft: 16 }}>{nbsp(countEn)}</div>
        </div>
        {cityLine ? (
          <div
            style={{
              display: 'flex',
              background: CREAM,
              color: INK,
              border: `4px solid ${INK}`,
              borderTop: 'none',
              fontFamily: 'Archivo',
              fontWeight: 800,
              fontSize: citySize,
              letterSpacing: '0.06em',
              padding: '9px 18px 6px',
            }}
          >
            {cityLine}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The cover as PNG bytes. */
export async function renderWeekCover(d: WeekCoverData): Promise<ArrayBuffer> {
  const [scene, fonts] = await Promise.all([sceneSrc(d.scene), cardFonts()])
  return renderOgPng(<Cover d={d} scene={scene} />, { width: W, height: H, fonts })
}
