import { addDays, todayISO, weekday } from './dates'

/**
 * The pure half of the address lookup: reading typed addresses, the pickup
 * rules cities write, and point-in-polygon. Shared by the sync that builds the
 * address database (civicSync.ts) and the pages that read it (civic.ts), and
 * free of I/O so the tests can pin it.
 */

/* -------------------------------------------------------- normalization */

const WORDS: Record<string, string> = {
  WEST: 'W', EAST: 'E', NORTH: 'N', SOUTH: 'S', NORTHWEST: 'NW', NORTHEAST: 'NE', SOUTHWEST: 'SW', SOUTHEAST: 'SE',
  OESTE: 'W', ESTE: 'E', NOROESTE: 'NW', NORESTE: 'NE', SUROESTE: 'SW', SURESTE: 'SE',
  STREET: 'ST', STR: 'ST', CALLE: 'ST', AVENUE: 'AVE', AV: 'AVE', AVENIDA: 'AVE', AVN: 'AVE',
  PLACE: 'PL', LANE: 'LN', TERRACE: 'TER', TERR: 'TER', TERRAZA: 'TER', COURT: 'CT', DRIVE: 'DR', ROAD: 'RD',
  BOULEVARD: 'BLVD', BLV: 'BLVD', CIRCLE: 'CIR', PARKWAY: 'PKWY', HIGHWAY: 'HWY',
}

/** Words that say where, not which address: dropped. */
const NOISE = new Set(['FL', 'FLA', 'FLORIDA', 'USA', 'US'])

const ORDINAL = /^(\d+)(ST|ND|RD|TH|RA|DA|TA|VA|NA|MA|ER|DO|TO|MO)$/

/**
 * Typed text → the key addresses are stored under: "5410 west 6th lane,
 * Hialeah FL 33012" → { text: "5410 W 6 LN", zip: "33012" }. Ordinals go
 * (the county writes "6TH", people write "6" or "6th"), and so do units
 * ("apt 5", "#5"): the address is the building.
 */
export function normalizeAddress(q: string): { text: string; zip: string | null } {
  let s = String(q ?? '').toUpperCase().slice(0, 140)
  s = s.replace(/\b(APT|APARTMENT|UNIT|STE|SUITE|APTO)\b\.?\s*\S+/g, ' ').replace(/#\s*\S+/g, ' ')
  s = s.replace(/[.,;]/g, ' ')
  let zip: string | null = null
  const tokens: string[] = []
  for (const raw of s.split(/\s+/).filter(Boolean)) {
    if (/^\d{5}(-\d{4})?$/.test(raw) && tokens.length > 0) {
      zip = raw.slice(0, 5)
      continue
    }
    if (NOISE.has(raw)) continue
    const ord = raw.match(ORDINAL)
    tokens.push(ord ? ord[1] : (WORDS[raw] ?? raw))
  }
  // A city name typed after the street ("… LN HIALEAH") would break a prefix
  // match; the zip, not the city, is what narrows a search.
  while (tokens.length > 2 && CITY_WORDS.has(tokens[tokens.length - 1])) tokens.pop()
  return { text: tokens.join(' '), zip }
}

const CITY_WORDS = new Set([
  'HIALEAH', 'GARDENS', 'MIAMI', 'BEACH', 'LAKES', 'DORAL', 'GABLES', 'CORAL', 'HOMESTEAD', 'KENDALL', 'SPRINGS',
  'SHORES', 'PINECREST', 'AVENTURA', 'SWEETWATER', 'MEDLEY', 'HAVANA', 'LITTLE', 'NORTH', 'SOUTH', 'WEST',
])

/** The stored key for an address's parts, the county's way: number, direction, name, type, suffix. */
export function addressKey(parts: (string | number | null | undefined)[]): string {
  return parts
    .map((p) => String(p ?? '').trim().toUpperCase())
    .filter(Boolean)
    .flatMap((p) => p.split(/\s+/))
    .map((w) => {
      const ord = w.match(ORDINAL)
      return ord ? ord[1] : w
    })
    .join(' ')
}

export function slugOf(key: string, zip: string): string {
  return `${key} ${zip}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const DIRS = /^(N|S|E|W|NW|NE|SW|SE)$/

/** "5410 W 6 LN" → "5410 W 6th Ln": how people write it. */
export function prettyAddress(key: string): string {
  const words = key.split(' ')
  return words
    .map((w, i) => {
      if (DIRS.test(w)) return w
      if (/^\d+$/.test(w) && i > 0 && i < words.length - 1) {
        const n = Number(w)
        const suf = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
        return w + suf
      }
      return /^[A-Z]+$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w
    })
    .join(' ')
}

/** "LUA A. CURTIS" → "Lua A. Curtis"; keeps NW/SW, ordinals, short codes and Mc names. */
export function titleCase(s: string): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b)
    .replace(/\b(Nw|Ne|Sw|Se|Fl|Ii|Iii|Iv|Jfk|Fiu|Mdc)\b/g, (m) => m.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, c: string) => `Mc${c.toUpperCase()}`)
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n: string, s2: string) => n + s2.toLowerCase())
}

/* -------------------------------------------------------------- rules */

const DAY_INDEX: Record<string, number> = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 }
/** The City of Miami writes days as letters: "TF" is Tuesday and Friday, R is Thursday. */
const DAY_LETTER: Record<string, number> = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 }

/**
 * A pickup rule. `weeks` is which occurrences in the month ("1st and 3rd");
 * null is every week. `biweekly` is every other week with no anchor we know,
 * which can name the day but not the date.
 */
export type Rule = { days: number[]; weeks: number[] | null; biweekly?: boolean }

/** "Monday & Thursday", "1ST and 3RD Tuesday", "2nd Friday", "Tuesday Friday". */
export function parseRule(service: string): Rule | null {
  const s = service.toUpperCase()
  const days = Object.entries(DAY_INDEX)
    .filter(([name]) => s.includes(name))
    .map(([, i]) => i)
    .sort()
  if (!days.length) return null
  const weeks = [...s.matchAll(/\b([1-5])(ST|ND|RD|TH)?\b/g)].map((m) => Number(m[1]))
  return { days, weeks: weeks.length ? weeks : null }
}

/** "TF" → Tuesday and Friday, every week. */
export function parseDayLetters(letters: string): Rule | null {
  const days = [...new Set([...String(letters ?? '').toUpperCase()].map((c) => DAY_LETTER[c]).filter((d) => d !== undefined))].sort()
  return days.length ? { days, weeks: null } : null
}

/** Which occurrence of its weekday a date is within its month: the 1st, 2nd… */
const nthInMonth = (iso: string) => Math.floor((Number(iso.slice(8, 10)) - 1) / 7) + 1

export function matchesRule(rule: Rule, iso: string): boolean {
  return rule.days.includes(weekday(iso)) && (!rule.weeks || rule.weeks.includes(nthInMonth(iso)))
}

/** The next `count` pickup days, today included. None for a rule with no known anchor. */
export function nextDates(rule: Rule, from: string = todayISO(), count = 3): string[] {
  if (rule.biweekly) return []
  const out: string[] = []
  for (let d = from, n = 0; out.length < count && n < 400; d = addDays(d, 1), n++) if (matchesRule(rule, d)) out.push(d)
  return out
}

/** The same rule as an RFC 5545 recurrence. */
export function rrule(rule: Rule): string | null {
  if (rule.biweekly) return null
  const codes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
  if (!rule.weeks) return `FREQ=WEEKLY;BYDAY=${rule.days.map((d) => codes[d]).join(',')}`
  return `FREQ=MONTHLY;BYDAY=${rule.weeks.flatMap((w) => rule.days.map((d) => `${w}${codes[d]}`)).join(',')}`
}

/* ------------------------------------------------------- land use */

/**
 * What a building is, from the first two digits of the Property Appraiser's
 * land-use (DOR) code: 00–09 residential, 02 mobile homes, 03/04/06 the big
 * shared buildings (10+ apartments, condos, retirement homes), the rest
 * commercial, industrial, public.
 */
export const KIND = { unknown: -1, home: 0, building: 1, business: 2, mobile: 3 } as const

export function kindFromDor(code: string | null | undefined): number {
  const c = String(code ?? '').trim()
  if (!/^\d{2}/.test(c)) return KIND.unknown
  const use = Number(c.slice(0, 2))
  if (use === 2) return KIND.mobile
  if (use === 3 || use === 4 || use === 6) return KIND.building
  if (use <= 9) return KIND.home
  return KIND.business
}

/* ---------------------------------------------------- point in polygon */

export type Ring = [number, number][]
type Shape = { rings: Ring[]; box: [number, number, number, number]; value: number }

/** Even-odd across all rings, which handles holes and multipart polygons alike. */
export function ringsContain(rings: Ring[], x: number, y: number): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/**
 * Polygons bucketed on a grid of ~1 km cells, so finding which of a few
 * thousand polygons holds a point looks at a handful. `value` is what a hit
 * returns (a row in a zone table).
 */
export class PolygonIndex {
  private cells = new Map<string, Shape[]>()
  constructor(private cell = 0.01) {}

  add(rings: Ring[], value: number) {
    if (!rings.length) return
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const ring of rings)
      for (const [x, y] of ring) {
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
    const shape: Shape = { rings, box: [x0, y0, x1, y1], value }
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++)
      for (let cy = Math.floor(y0 / this.cell); cy <= Math.floor(y1 / this.cell); cy++) {
        const k = `${cx}:${cy}`
        const list = this.cells.get(k)
        if (list) list.push(shape)
        else this.cells.set(k, [shape])
      }
  }

  /** The value of the first polygon holding the point, or -1. */
  find(x: number, y: number): number {
    const list = this.cells.get(`${Math.floor(x / this.cell)}:${Math.floor(y / this.cell)}`)
    if (!list) return -1
    for (const s of list) {
      const [x0, y0, x1, y1] = s.box
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && ringsContain(s.rings, x, y)) return s.value
    }
    return -1
  }
}
