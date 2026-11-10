/**
 * Reading Miami-Dade Transit's GTFS, shared by the two transit scripts:
 * sync.ts (Hialeah's free lines) and county.ts (the county's bus routes).
 */
import { createReadStream, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

export type Row = Record<string, string>

export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

export function readCsv(dir: string, file: string): Row[] {
  const lines = readFileSync(join(dir, file), 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(Boolean)
  const head = parseCsvLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((l) => {
    const cells = parseCsvLine(l)
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()]))
  })
}

/** stop_times.txt is too big to hold whole; stream it and keep only our trips. */
export async function readStopTimes(dir: string, tripIds: Set<string>): Promise<Row[]> {
  const rl = createInterface({ input: createReadStream(join(dir, 'stop_times.txt')) })
  let head: string[] | null = null
  const out: Row[] = []
  for await (const line of rl) {
    if (!line) continue
    if (!head) {
      head = parseCsvLine(line.replace(/^﻿/, '')).map((h) => h.trim())
      continue
    }
    const cells = parseCsvLine(line)
    if (!tripIds.has(cells[head.indexOf('trip_id')]?.trim())) continue
    out.push(Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()])))
  }
  return out
}

export function meters(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[0] - a[0])
  const dLng = toRad(b[1] - a[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const minutes = (hms: string) => {
  const [h, m, s] = hms.split(':').map(Number)
  return h * 60 + m + (s || 0) / 60
}

export const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * "W 29 ST@W 4 AV" → "W 29 St & W 4 Ave". Readability only — stop names stay
 * in the county's English in both languages, since they are what is printed on
 * the pole.
 */
export function cleanStopName(raw: string): string {
  const KEEP = new Set(['NW', 'NE', 'SW', 'SE', 'N', 'S', 'E', 'W'])
  const WORDS: Record<string, string> = {
    OPP: 'opp.',
    ST: 'St',
    AV: 'Ave',
    AVE: 'Ave',
    DR: 'Dr',
    RD: 'Rd',
    BLVD: 'Blvd',
    CT: 'Ct',
    PL: 'Pl',
    TER: 'Ter',
    TERR: 'Ter',
    HWY: 'Hwy',
    PKWY: 'Pkwy',
  }
  const word = (w: string): string => {
    if (KEEP.has(w)) return w
    if (WORDS[w]) return WORDS[w]
    // "8TH" → "8th", but "37AV" → "37 Ave".
    const num = w.match(/^(\d+)([A-Z]+)$/)
    if (num)
      return /^(ST|ND|RD|TH)$/.test(num[2])
        ? num[1] + num[2].toLowerCase()
        : `${num[1]} ${word(num[2])}`
    return w.charAt(0) + w.slice(1).toLowerCase()
  }
  return (
    raw
      .toUpperCase()
      // "OP#" and its typo "0 P #" mean "opposite": the stop across from that address.
      .replace(/\b(?:OP|0 ?P)\s*#\s*(\d+)/g, 'OPP #$1')
      .replace(/\s*@\s*#\s*(\d+)/g, ' (#$1)')
      .replace(/\s*@\s*/g, ' & ')
      .replace(/\(/g, ' (')
      .replace(/\s+/g, ' ')
      .trim()
      // Word by word, so punctuation like "(CONNECTOR" or "42/37AV" keeps its shape.
      .replace(/[A-Z0-9]+/g, word)
      .replace(/'S\b/g, "'s")
      .replace(/ And /g, ' and ')
  )
}

/** Douglas–Peucker on lat/lng, metres. Keeps the path's shape, sheds its points. */
export function simplify(pts: [number, number][], tol: number): [number, number][] {
  if (pts.length < 3) return pts
  const k = Math.cos((pts[0][0] * Math.PI) / 180)
  const xy = pts.map(([la, lo]) => [lo * k * 111320, la * 110540])
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = xy[a]
    const [bx, by] = xy[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let far = -1
    let farD = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - xy[i][1]) - (ax - xy[i][0]) * (by - ay)) / len
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far > -1) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return pts.filter((_, i) => keep[i])
}

/** stop_times.txt row by row, for a pass over every trip without holding them all. */
export async function eachStopTime(dir: string, fn: (row: Row) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(join(dir, 'stop_times.txt')) })
  let head: string[] | null = null
  for await (const line of rl) {
    if (!line) continue
    if (!head) {
      head = parseCsvLine(line.replace(/^﻿/, '')).map((h) => h.trim())
      continue
    }
    const cells = parseCsvLine(line)
    fn(Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()])))
  }
}

/* --- Shared by the county reducers (county.ts, network.ts) --- */

/** Ends a head sign shortens past reading: "M. GARDENS NW 207 ST" → "Miami Gardens NW 207 St". */
const PLACE_WORDS: [RegExp, string][] = [
  [/\bM\. ?GARDENS\b/g, 'MIAMI GARDENS'],
  [/\bH\. ?GARDENS\b/g, 'HIALEAH GARDENS'],
  [/\bMIA GARDENS\b/g, 'MIAMI GARDENS'],
]

/** The county's abbreviations that read as words once title-cased: "Fiu" is FIU. */
export function tidy(name: string): string {
  return name
    .replace(/\bFiu\b/g, 'FIU')
    .replace(/\bMdc\b/g, 'MDC')
    .replace(/\b(\d+)st\b/g, '$1 St')
    .replace(/\bTe\b/g, 'Ter')
}

/** "54A - H. GARDENS NW 87 CT/114 ST" → "Hialeah Gardens NW 87 Ct/114 St". */
export function cleanHeadsign(raw: string): string {
  let s = raw.toUpperCase().replace(/^\s*[0-9A-Z]+\s*-\s*/, '')
  for (const [re, to] of PLACE_WORDS) s = s.replace(re, to)
  return tidy(cleanStopName(s)).replace(/ Via /g, ' via ')
}

export type DayKind = 'weekday' | 'saturday' | 'sunday'

export const iso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
export const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')

/** YYYYMMDD of the next date on or after `from` with this day of the week. */
export function nextDow(from: Date, dow: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1)
  return ymd(d)
}

const DOW_FIELD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** The service ids running on a date: the weekly calendar, then that date's exceptions. */
export function servicesOn(date: string, calendar: Row[], exceptions: Row[]): Set<string> {
  const y = Number(date.slice(0, 4))
  const dow = new Date(
    Date.UTC(y, Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8))),
  ).getUTCDay()
  const on = new Set(
    calendar
      .filter((c) => c[DOW_FIELD[dow]] === '1' && c.start_date <= date && date <= c.end_date)
      .map((c) => c.service_id),
  )
  for (const x of exceptions) {
    if (x.date !== date) continue
    if (x.exception_type === '1') on.add(x.service_id)
    else on.delete(x.service_id)
  }
  return on
}

/**
 * Buses closer together than this are one wait to a rider: two branches of a
 * route meeting on the trunk (route 8's buses reach Calle Ocho in pairs four
 * minutes apart, every half hour). Counted apart, the median gap came out at
 * "every 5 min".
 */
const BUNCH_MINUTES = 7

/** Typical minutes between buses in a window of the day, or null when fewer than three buses pass. */
export function headwayIn(times: number[], from: number, to: number): number | null {
  const inside: number[] = []
  for (const t of times) {
    if (t < from || t >= to) continue
    if (inside.length && t - inside[inside.length - 1] < BUNCH_MINUTES) continue
    inside.push(t)
  }
  if (inside.length < 3) return null
  const gaps = inside.slice(1).map((t, i) => t - inside[i])
  const m = median(gaps)
  return m === null ? null : Math.round(m)
}

