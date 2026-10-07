import { translator, type Lang } from '../i18n'
import { ARCHIVO_800, LUCKIEST_GUY } from './cardMetrics'
import { cityMap, type CityMapModel } from './citymap'
import { cardFonts } from './eventCard'
import { FREE_RIDES_CARD_SIZE } from './freeRidesCardUrl'
import { renderOgPng } from './ogImage'
import { TRANSIT, lineEnds, type TransitRoute } from './transit'

/**
 * The free-rides link cards, laid out like the pages' heroes: an ink panel on
 * the site's dotted pink-to-yellow ground, the words on the left, and the
 * drawn city map on the right in its offset-shadowed frame.
 *
 * - The hub (`/free-rides`): the hero's headline, both lines on the map with
 *   their buses, a yellow shadow.
 * - A line (`/free-rides/flamingo|marlin`): the line's name in its colour, its
 *   two ends and its stops. The map draws that line with its buses and the
 *   other one faded, and the frame's shadow is the line's colour.
 *
 * The map is the page's own model (lib/citymap.ts) with no spots, so a card
 * never reads Payload and the same URL always draws the same picture. Its
 * geometry goes in as SVG; everything with letters on it (the town names,
 * the bullets, the buses) is drawn by Satori over it, because text inside an
 * SVG image would not get the card's fonts.
 *
 * Nothing on it goes stale: no hours, no "live", no minutes between buses. The
 * buses are parked at evenly spaced stations to show a line with buses on it,
 * not where any bus is. The stop count comes from the line data, and the
 * card's URL changes when that is re-synced (freeRidesCardUrl).
 */

const INK = '#0c0f14'
const CREAM = '#fff6e5'
const PINK = '#ff2e88'
const CYAN = '#16e0f2'
const YELLOW = '#ffd400'
const MUTED = '#c9ced4'

type Slug = TransitRoute['slug']
const LINE_COLOR: Record<Slug, string> = { flamingo: PINK, marlin: CYAN }
const LINE_INK: Record<Slug, string> = { flamingo: CREAM, marlin: INK }

const { width: W, height: H } = FREE_RIDES_CARD_SIZE

/** The ink panel's inset from the card's edge: the page's dotted ground shows around it. */
const EDGE = 22
/** The map's frame: border-box, before the offset shadow. */
const FRAME = { x: 612, y: 52, w: 524, h: 520, border: 5, shadow: 12 }
/** The words' column. */
const TEXT = { x: 66, y: 62, w: 510, bottom: 58 }

/** The page's ground (PageShell): ink dots over pink running into yellow. */
function ground(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0.14" y2="1">` +
    `<stop offset="0" stop-color="#FF2E88"/><stop offset="0.34" stop-color="#FF4A97"/><stop offset="0.58" stop-color="#FF74AD"/>` +
    `<stop offset="0.82" stop-color="#FFB35C"/><stop offset="1" stop-color="#FFD400"/></linearGradient>` +
    `<pattern id="d" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="7.5" cy="7.5" r="1.7" fill="${INK}"/></pattern></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#d)"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

/**
 * The map in the page's colours, as two SVGs: the ground (towns, roads, rail)
 * and the lines over it, so the town names can sit between them as they do
 * on the page. With `focus`, the other line is a faint ink trace.
 */
function mapSvgs(m: CityMapModel, focus?: Slug): { ground: string; lines: string } {
  const places = m.places
    .map((p) =>
      p.home
        ? `<path d="${p.d}" fill="#fffaf0" stroke="${INK}" stroke-width="3" stroke-linejoin="round" fill-rule="evenodd"/>`
        : `<path d="${p.d}" fill="#f5e9d0" stroke="${INK}" stroke-width="1.5" stroke-dasharray="5 4" stroke-opacity="0.45" stroke-linejoin="round" fill-rule="evenodd"/>`,
    )
    .join('')
  const roads = (kind: 'primary' | 'secondary', opacity: number, width: number) =>
    m.roads
      .filter((r) => r.kind === kind)
      .map(
        (r) =>
          `<path d="${r.d}" fill="none" stroke="${INK}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round"/>`,
      )
      .join('')
  // Thicker than the page's 11/5.5: the card is mostly seen as a thumbnail.
  // The focused line goes last, so it crosses over the faded one.
  const lines = [...m.lines]
    .sort((a, b) => Number(a.slug === focus) - Number(b.slug === focus))
    .map((l) =>
      focus && l.slug !== focus
        ? `<path d="${l.d}" fill="none" stroke="${INK}" stroke-opacity="0.22" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>`
        : `<path d="${l.d}" fill="none" stroke="${INK}" stroke-width="15" stroke-linejoin="round" stroke-linecap="round"/>` +
          `<path d="${l.d}" fill="none" stroke="${LINE_COLOR[l.slug]}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>`,
    )
    .join('')
  const transfer = m.transfer
    ? `<circle cx="${m.transfer[0]}" cy="${m.transfer[1]}" r="12" fill="${CREAM}" stroke="${INK}" stroke-width="4"/>` +
      `<circle cx="${m.transfer[0]}" cy="${m.transfer[1]}" r="5" fill="${INK}"/>`
    : ''
  const svg = (body: string) =>
    `data:image/svg+xml;base64,${Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.w} ${m.h}" width="${m.w}" height="${m.h}">${body}</svg>`,
    ).toString('base64')}`
  return {
    ground: svg(
      `<rect width="${m.w}" height="${m.h}" fill="#eadbbd"/>` +
        places +
        roads('secondary', 0.16, 1.6) +
        roads('primary', 0.3, 3.2) +
        `<path d="${m.rail}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${m.rail}" fill="none" stroke="${CREAM}" stroke-width="1.8" stroke-dasharray="5 5"/>`,
    ),
    lines: svg(lines + transfer),
  }
}

/** Width of a line of text in px, from the bundled fonts' advance widths. */
function textWidth(s: string, size: number, widths: Record<string, number>): number {
  return [...s].reduce((n, c) => n + (widths[c] ?? 0.6), 0) * size
}

/** The largest size, up to `max`, at which `s` fits on one line `w` wide. */
function fitSize(s: string, w: number, max: number, widths: Record<string, number>): number {
  return Math.min(max, Math.floor(w / textWidth(s, 1, widths)))
}

/** A line's letter in its colour: the page's bullets and live buses. */
function Dot({
  at,
  r,
  slug,
  letter,
  size,
}: {
  at?: { x: number; y: number }
  r: number
  slug: Slug
  letter: string
  size: number
}) {
  return (
    <div
      style={{
        ...(at ? { position: 'absolute' as const, left: at.x - r, top: at.y - r } : {}),
        flex: '0 0 auto',
        width: r * 2,
        height: r * 2,
        borderRadius: r,
        background: LINE_COLOR[slug],
        border: `${Math.max(3, Math.round(r / 5))}px solid ${INK}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Luckiest Guy',
        fontSize: size,
        // Luckiest Guy's caps sit high in the line box.
        paddingTop: size * 0.14,
        color: LINE_INK[slug],
      }}
    >
      {letter}
    </div>
  )
}

function Chip({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignSelf: 'flex-start',
        background: bg,
        color: fg,
        fontFamily: 'Archivo',
        fontWeight: 800,
        fontSize: 20,
        letterSpacing: '0.1em',
        padding: '9px 14px 6px',
      }}
    >
      {text}
    </div>
  )
}

/** ⇄, drawn: Archivo has no arrows. */
function BothWays({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: '0 0 auto' }}>
      <path
        d="M3 8h17m-4-4 4 4-4 4M21 16H4m4-4-4 4 4 4"
        fill="none"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Brand() {
  return (
    <div
      style={{
        display: 'flex',
        marginTop: 'auto',
        fontFamily: 'Archivo',
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: '0.12em',
        color: CYAN,
      }}
    >
      FLAMINGOCOUNTY.COM
    </div>
  )
}

/** The hub's words: the hero's headline and both lines. */
function HubWords({ t }: { t: (s: string) => string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <Chip text={t('HIALEAH · FREE TRANSIT')} bg={YELLOW} fg={INK} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 26,
          fontFamily: 'Luckiest Guy',
          fontSize: 98,
          lineHeight: 0.92,
        }}
      >
        <div style={{ display: 'flex' }}>{t('RIDE THE CITY')}</div>
        <div style={{ display: 'flex', color: YELLOW }}>{t('FOR FREE.')}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 30, gap: 14 }}>
        {TRANSIT.routes.map((r) => (
          <div key={r.slug} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Dot r={22} slug={r.slug} letter={r.name[0]} size={26} />
            <div
              style={{
                display: 'flex',
                fontFamily: 'Archivo',
                fontWeight: 800,
                fontSize: 28,
                marginRight: 12,
              }}
            >
              {r.name}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 14,
          fontFamily: 'Archivo',
          fontWeight: 800,
          fontSize: 28,
          color: MUTED,
        }}
      >
        {t('No fare, no card.')}
      </div>
      <Brand />
    </div>
  )
}

/** A line's words: the masthead's bullet and name, its two ends, its stops. */
function LineWords({ t, route }: { t: (s: string) => string; route: TransitRoute }) {
  const name = route.name.toUpperCase()
  const bullet = 46
  const nameSize = fitSize(name, TEXT.w - bullet * 2 - 18, 112, LUCKIEST_GUY)
  const [from, to] = lineEnds(route).map(t)
  // Both ends on one line when they fit, the way the page's masthead has them.
  const endsSize = fitSize(`${from}  ${to}`, TEXT.w - 44, 34, ARCHIVO_800)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Fewer words than the hub's headline: centred in the column, over the brand. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
          paddingBottom: 24,
        }}
      >
        <Chip
          text={t('HIALEAH · FREE BUS LINE')}
          bg={LINE_COLOR[route.slug]}
          fg={LINE_INK[route.slug]}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 30 }}>
          <Dot r={bullet} slug={route.slug} letter={route.name[0]} size={54} />
          <div
            style={{
              display: 'flex',
              fontFamily: 'Luckiest Guy',
              fontSize: nameSize,
              lineHeight: 1,
              paddingTop: nameSize * 0.12,
              color: LINE_COLOR[route.slug],
            }}
          >
            {name}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 30,
            fontFamily: 'Archivo',
            fontWeight: 800,
            fontSize: endsSize,
          }}
        >
          <div style={{ display: 'flex' }}>{from}</div>
          <BothWays size={endsSize} color={LINE_COLOR[route.slug]} />
          <div style={{ display: 'flex' }}>{to}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22 }}>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Archivo',
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: '0.1em',
              padding: '7px 12px 4px',
              border: `3px solid ${CREAM}`,
            }}
          >
            {`${route.stations.length} ${t('STOPS')}`}
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Archivo',
              fontWeight: 800,
              fontSize: 26,
              color: MUTED,
            }}
          >
            {t('No fare, no card.')}
          </div>
        </div>
      </div>
      <Brand />
    </div>
  )
}

function FreeRidesCard({ lang, m, route }: { lang: Lang; m: CityMapModel; route?: TransitRoute }) {
  const t = translator(lang)
  const inner = { w: FRAME.w - FRAME.border * 2, h: FRAME.h - FRAME.border * 2 }
  // The map fills the frame's width; a little of its top and bottom is cropped.
  const s = inner.w / m.w
  const offY = (m.h * s - inner.h) / 2
  const at = ([x, y]: [number, number]) => ({ x: x * s, y: y * s - offY })
  const project = (lat: number, lng: number): [number, number] => {
    const p = m.proj
    return [p.pad + (lng * p.k - p.minX) * p.scale, p.pad + (-lat - p.minY) * p.scale]
  }

  const map = mapSvgs(m, route?.slug)
  // Three a line on the hub; four on a line's own card, which has only one.
  const perLine = route ? 4 : 3
  const buses = (route ? [route] : TRANSIT.routes).flatMap((r) =>
    Array.from({ length: perLine }, (_, i) => {
      const st = r.stations[Math.round(((i + 0.5) * (r.stations.length - 1)) / perLine)]
      const [lat, lng] = st.points[0]
      return { slug: r.slug, letter: r.name[0], ...at(project(lat, lng)) }
    }),
  )

  return (
    <div
      style={{
        width: W,
        height: H,
        display: 'flex',
        position: 'relative',
        background: PINK,
        color: CREAM,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ground()}
        width={W}
        height={H}
        alt=""
        style={{ position: 'absolute', left: 0, top: 0 }}
      />
      <div
        style={{
          position: 'absolute',
          left: EDGE,
          top: EDGE,
          right: EDGE,
          bottom: EDGE,
          display: 'flex',
          background: INK,
        }}
      />

      {/* --- the words --- */}
      <div
        style={{
          position: 'absolute',
          left: TEXT.x,
          top: TEXT.y,
          bottom: TEXT.bottom,
          width: TEXT.w,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {route ? <LineWords t={t} route={route} /> : <HubWords t={t} />}
      </div>

      {/* --- the map --- */}
      <div
        style={{
          position: 'absolute',
          left: FRAME.x,
          top: FRAME.y,
          width: FRAME.w,
          height: FRAME.h,
          display: 'flex',
          border: `${FRAME.border}px solid ${INK}`,
          boxShadow: `${FRAME.shadow}px ${FRAME.shadow}px 0 ${route ? LINE_COLOR[route.slug] : YELLOW}`,
          overflow: 'hidden',
          background: '#eadbbd',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={map.ground}
          width={m.w * s}
          height={m.h * s}
          alt=""
          style={{ position: 'absolute', left: 0, top: -offY }}
        />
        {m.places
          .filter((p) => p.label)
          .map((p) => {
            const { x, y } = at(p.label!)
            return p.home ? (
              <div
                key={p.name}
                style={{
                  position: 'absolute',
                  left: x - 150,
                  top: y - 44,
                  width: 300,
                  display: 'flex',
                  justifyContent: 'center',
                  fontFamily: 'Luckiest Guy',
                  fontSize: 50,
                  letterSpacing: 3,
                  color: PINK,
                  opacity: 0.35,
                }}
              >
                {p.name.toUpperCase()}
              </div>
            ) : (
              <div
                key={p.name}
                style={{
                  position: 'absolute',
                  left: x - 100,
                  top: y - 10,
                  width: 200,
                  display: 'flex',
                  justifyContent: 'center',
                  fontFamily: 'Archivo',
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: 1.6,
                  color: INK,
                  opacity: 0.5,
                }}
              >
                {p.name.toUpperCase()}
              </div>
            )
          })}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={map.lines}
          width={m.w * s}
          height={m.h * s}
          alt=""
          style={{ position: 'absolute', left: 0, top: -offY }}
        />
        {buses.map((b, i) => (
          <Dot key={i} at={b} r={19} slug={b.slug} letter={b.letter} size={22} />
        ))}
      </div>
    </div>
  )
}

const cache = new Map<string, ArrayBuffer>()

/**
 * A card as PNG bytes: the hub's, or with `route` that line's. It depends on
 * the language and the committed line data only.
 */
export async function renderFreeRidesCard(lang: Lang, route?: TransitRoute): Promise<ArrayBuffer> {
  const key = `${lang}:${route?.slug ?? 'hub'}`
  const hit = cache.get(key)
  if (hit) return hit
  const png = await renderOgPng(<FreeRidesCard lang={lang} m={cityMap([], lang)} route={route} />, {
    width: W,
    height: H,
    fonts: await cardFonts(),
  })
  cache.set(key, png)
  return png
}
