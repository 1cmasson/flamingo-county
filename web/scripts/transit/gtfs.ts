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
