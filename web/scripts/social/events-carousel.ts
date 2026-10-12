/**
 * The events carousel: one Instagram/Facebook post per language for the
 * events in a date range (Monday: the week; Thursday: the weekend). Run by the
 * `events-carousel` skill, which shows the owner the render and then drafts it
 * over MCP. Nothing here posts or writes to the site.
 *
 *   pnpm social:events -- --from 2026-10-19 --to 2026-10-25
 *   pnpm social:events -- --from 2026-10-23 --to 2026-10-25 --out ~/Desktop/x
 *
 * Slides, 1080×1350 (Instagram's 4:5), per language:
 *   1. the cover, a still: EVENTOS / EVENTS and the dates;
 *   2. a list slide per city, up to `PER_SLIDE` events each (more spill onto
 *      a second slide), drawn over the city's fountain loop as an MP4, with
 *      the city's mascot in the corner. A JPEG of each is written too:
 *      Facebook can't mix video and photos in one post, so it gets the stills;
 *   3. how to save them: the live /links page and an event's
 *      + MI SEMANA / + CALENDARIO buttons, screenshot at phone width.
 *
 * Events come from the site's public REST API (published only), so the
 * render is what the site shows. No prices: a title naming one is left out,
 * as everywhere else.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from '@playwright/test'

import type { City, Event } from '../../src/payload-types'
import { addDays, dateOnly, eventDaysIn, eventRunEnd, shortWeekday, weekday } from '../../src/lib/dates'
import { eventVenue } from '../../src/lib/eventVenue'
import { isAnnounceable, monthShort, unshout } from '../../src/lib/week'

type Lang = 'es' | 'en'
const LANGS: Lang[] = ['es', 'en']

/** Events on one list slide. Eight rows still read at phone size over the panel. */
export const PER_SLIDE = 8
/** Instagram takes ten items in a carousel: the cover and the save slide leave eight for lists. */
const MAX_LIST_SLIDES = 8
const W = 1080
const H = 1350
const LOOP_SECONDS = 10
const CAPTION_LIMIT = 2200

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FONTS = join(WEB, 'src/assets/og/fonts')
const MASCOTS = join(WEB, 'src/assets/og/mascots')
const SCENES = join(WEB, 'src/assets/og/settings')
const LOOPS = join(WEB, 'public/assets/cities')

/** Each city's loop and mascot, by slug. A city missing here falls back to a still scene and no mascot. */
const CITY_ART: Record<string, { loop: string; mascot: string; accent: string }> = {
  hialeah: { loop: 'hialeah.mp4', mascot: 'hialeah.png', accent: '#ff2e88' },
  lakes: { loop: 'lakes.mp4', mascot: 'lakes.png', accent: '#16e0f2' },
  havana: { loop: 'havana.mp4', mascot: 'havana.png', accent: '#ffd400' },
}

/* ------------------------------------------------------------------------ */
/* Arguments                                                                 */
/* ------------------------------------------------------------------------ */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/* ------------------------------------------------------------------------ */
/* Events                                                                    */
/* ------------------------------------------------------------------------ */

export type Row = {
  id: number
  slug: string
  /** The first day of the range the event is on: the day it is listed under. */
  day: string
  /**
   * Its last day, for a run: the real one, not cut at the range, so an exhibit
   * closing the Monday after a weekend post still reads HASTA LUN 19.
   */
  last: string
  /** Whether it opened before the range. */
  started: boolean
  title: Record<Lang, string>
  time: Record<Lang, string>
  venue: string
  city: City | null
}

async function fetchEvents(site: string, from: string, to: string, lang: Lang): Promise<Event[]> {
  const q = new URLSearchParams({
    limit: '300',
    depth: '2',
    locale: lang,
    sort: 'date',
    'where[and][0][_status][equals]': 'published',
    'where[and][1][date][less_than_equal]': `${to}T23:59:59.999Z`,
    'where[and][2][or][0][date][greater_than_equal]': `${from}T00:00:00.000Z`,
    'where[and][2][or][1][endDate][greater_than_equal]': `${from}T00:00:00.000Z`,
  })
  const res = await fetch(`${site}/api/events?${q}`)
  if (!res.ok) throw new Error(`GET /api/events (${lang}) answered ${res.status}`)
  return ((await res.json()) as { docs: Event[] }).docs
}

/** The range's events, one row each, in date order (then start time). */
export function toRows(es: Event[], en: Event[], from: string, to: string): Row[] {
  const enById = new Map(en.map((ev) => [ev.id, ev]))
  const rows: Row[] = []
  for (const ev of es) {
    if (!isAnnounceable(ev)) continue
    const days = eventDaysIn(ev, from, to)
    if (!days.length) continue
    const other = enById.get(ev.id) ?? ev
    const { name, city } = eventVenue(ev)
    rows.push({
      id: ev.id,
      slug: ev.slug,
      day: days[0],
      last: eventRunEnd(ev),
      started: dateOnly(ev.date) < from,
      title: { es: ev.title.trim(), en: (other.title || ev.title).trim() },
      time: { es: ev.timeLabel ?? '', en: other.timeLabel ?? ev.timeLabel ?? '' },
      venue: name,
      city,
    })
  }
  const start = (r: Row) => es.find((e) => e.id === r.id)?.startTime ?? '99:99'
  return rows.sort((a, b) => a.day.localeCompare(b.day) || start(a).localeCompare(start(b)) || a.id - b.id)
}

export type CityGroup = { city: City | null; slug: string; name: string; rows: Row[] }

/** Rows by city, cities in the site's own order; events with no city last. */
export function byCity(rows: Row[]): CityGroup[] {
  const groups = new Map<string, CityGroup>()
  for (const r of rows) {
    const slug = r.city?.slug ?? 'other'
    if (!groups.has(slug)) groups.set(slug, { city: r.city, slug, name: r.city ? unshout(r.city.name) : '', rows: [] })
    groups.get(slug)!.rows.push(r)
  }
  return [...groups.values()].sort((a, b) => (a.city?.order ?? 99) - (b.city?.order ?? 99))
}

/** A city's rows cut into slides of `per`: 10 → 5 + 5, not 8 + 2. */
export function chunk<T>(items: T[], per: number = PER_SLIDE): T[][] {
  if (items.length <= per) return [items]
  const n = Math.ceil(items.length / per)
  const size = Math.ceil(items.length / n)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/* ------------------------------------------------------------------------ */
/* Words                                                                     */
/* ------------------------------------------------------------------------ */

const d = (iso: string) => Number(iso.slice(8, 10))

/** "19–25 OCT" / "OCT 19–25"; "28 SEP – 4 OCT" / "SEP 28 – OCT 4"; one day: "SÁB 24 OCT". */
export function rangeText(from: string, to: string, lang: Lang): string {
  const m = (iso: string) => monthShort(iso, lang)
  if (from === to) return lang === 'es' ? `${shortWeekday(from, 'es')} ${d(from)} ${m(from)}` : `${shortWeekday(from, 'en')} ${m(from)} ${d(from)}`
  const same = from.slice(0, 7) === to.slice(0, 7)
  if (lang === 'es') return same ? `${d(from)}–${d(to)} ${m(to)}` : `${d(from)} ${m(from)} – ${d(to)} ${m(to)}`
  return same ? `${m(to)} ${d(from)}–${d(to)}` : `${m(from)} ${d(from)} – ${m(to)} ${d(to)}`
}

/** Friday to Sunday is a weekend post; anything else is the week's. */
export function isWeekend(from: string, to: string): boolean {
  return weekday(from) >= 5 && (weekday(to) === 0 || weekday(to) === 6) && to <= addDays(from, 2)
}

/** "SÁB 24", or "SÁB 24 – DOM 25" for a run, or "HASTA DOM 25" for one that opened earlier. */
export function dayText(r: Row, lang: Lang): string {
  const wd = (iso: string) => shortWeekday(iso, lang)
  if (r.started) return lang === 'es' ? `HASTA ${wd(r.last)} ${d(r.last)}` : `UNTIL ${wd(r.last)} ${d(r.last)}`
  if (r.last === r.day) return `${wd(r.day)} ${d(r.day)}`
  return `${wd(r.day)} ${d(r.day)}–${wd(r.last)} ${d(r.last)}`
}

const COPY = {
  es: {
    kicker: (weekend: boolean) => (weekend ? 'ESTE FIN DE SEMANA' : 'ESTA SEMANA'),
    title: 'EVENTOS',
    count: (n: number) => `${n} ${n === 1 ? 'EVENTO' : 'EVENTOS'}`,
    page: (i: number, n: number) => (n > 1 ? `${i}/${n}` : ''),
    saveTitle: 'GUÁRDALOS',
    saveSub: 'en tu calendario',
    step1: 'LINK EN LA BIO',
    step1b: '«Eventos de la semana»',
    step2: 'EN CADA EVENTO',
    step2b: ['+ MI SEMANA lo guarda en tu cuenta', '+ CALENDARIO lo pone en tu teléfono'],
  },
  en: {
    kicker: (weekend: boolean) => (weekend ? 'THIS WEEKEND' : 'THIS WEEK'),
    title: 'EVENTS',
    count: (n: number) => `${n} ${n === 1 ? 'EVENT' : 'EVENTS'}`,
    page: (i: number, n: number) => (n > 1 ? `${i}/${n}` : ''),
    saveTitle: 'SAVE THEM',
    saveSub: 'to your calendar',
    step1: 'LINK IN BIO',
    step1b: '"This week’s events"',
    step2: 'ON ANY EVENT',
    step2b: ['+ MY WEEK saves it to your account', '+ CALENDAR puts it on your phone'],
  },
} as const

/* ------------------------------------------------------------------------ */
/* Captions                                                                  */
/* ------------------------------------------------------------------------ */

const CAPTION = {
  es: {
    head: (weekend: boolean, range: string) =>
      weekend ? `Qué hacer este fin de semana, ${range} 🦩` : `Lo que hay esta semana, ${range} 🦩`,
    save: 'Para guardarlos en tu calendario: link en la bio → Eventos de la semana → + MI SEMANA.',
    saveFb: (link: string) => `Para guardarlos en tu calendario, entra a ${link} y toca + MI SEMANA en el que quieras.`,
  },
  en: {
    head: (weekend: boolean, range: string) =>
      weekend ? `What's on this weekend, ${range} 🦩` : `What's on this week, ${range} 🦩`,
    save: 'To save them to your calendar: link in bio → This week’s events → + MY WEEK.',
    saveFb: (link: string) => `To save them to your calendar, open ${link} and tap + MY WEEK on any of them.`,
  },
}

/** "Sáb 24" for a caption line. */
function capDay(r: Row, lang: Lang): string {
  return dayText(r, lang)
    .toLowerCase()
    .replace(/(^|[\s–])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/^Hasta (\p{L})/u, (_, w) => `Hasta el ${w.toLowerCase()}`)
    .replace(/^Until /, 'Through ')
}

/**
 * The caption: a heading, then each city with one line per event (day, title,
 * venue), then how to save them. `fbLink` set → the Facebook version, which
 * links the week's page; Instagram says "link in bio" (links aren't tappable
 * there). Nothing but the events' own fields: no prices, no descriptions.
 */
export function caption(groups: CityGroup[], from: string, to: string, lang: Lang, fbLink?: string): string {
  const c = CAPTION[lang]
  const range = rangeText(from, to, lang).toLowerCase().replace(/\b([a-z])/g, (m) => (lang === 'en' ? m.toUpperCase() : m))
  const blocks = groups.map((g) => {
    const lines = g.rows.map((r) => [`• ${capDay(r, lang)}`, r.title[lang], r.venue].filter(Boolean).join(' · '))
    return [g.name ? g.name.toUpperCase() : '', ...lines].filter(Boolean).join('\n')
  })
  const save = fbLink ? c.saveFb(fbLink) : c.save
  return [c.head(isWeekend(from, to), range), ...blocks, save].join('\n\n')
}

/* ------------------------------------------------------------------------ */
/* Drawing                                                                   */
/* ------------------------------------------------------------------------ */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** A title, escaped, with hyphenated words kept whole: "N-400" must not break after "N-". */
const escTitle = (s: string) => esc(s).replace(/\S*\w-\w\S*/g, (w) => `<span style="white-space:nowrap">${w}</span>`)
const file = (p: string) => `file://${p}`

const BASE_CSS = `
@font-face { font-family: Lucky; src: url('${file(join(FONTS, 'LuckiestGuy-Regular.ttf'))}'); }
@font-face { font-family: Archivo; src: url('${file(join(FONTS, 'Archivo-ExtraBold.ttf'))}'); font-weight: 800; }
:root { --ink: #0c0f14; --cream: #fff6e5; --yellow: #ffd400; --pink: #ff2e88; --cyan: #33cde6; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
body { font-family: Archivo, sans-serif; font-weight: 800; color: var(--ink); position: relative; }
.lucky { font-family: Lucky, sans-serif; font-weight: 400; letter-spacing: 1px; }
.band { position: absolute; left: 0; right: 0; top: 0; height: 150px;
  background: radial-gradient(circle, rgba(12,15,20,.55) 2px, transparent 2.6px) 0 0/22px 22px, linear-gradient(180deg, #ff4fa0 0%, #ffd400 100%);
  border-bottom: 6px solid var(--ink); }
.chip { position: absolute; top: 46px; height: 54px; display: flex; align-items: center; padding: 0 20px; font-size: 26px; letter-spacing: 4px; }
.chip.dark { left: 64px; background: var(--ink); color: var(--yellow); }
.chip.light { right: 64px; background: var(--cream); border: 4px solid var(--ink); }
`

function page(css: string, body: string, transparent = false): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}${css}
  body { background: ${transparent ? 'transparent' : 'var(--cyan)'}; }</style></head><body>${body}</body></html>`
}

function coverHtml(lang: Lang, from: string, to: string, n: number, cities: string[], scene: string): string {
  const c = COPY[lang]
  const range = rangeText(from, to, lang)
  const css = `
  .scene { position: absolute; inset: 150px 0 0 0; background: url('${file(scene)}') center bottom/cover; }
  .head { position: absolute; left: 64px; top: 210px; background: var(--ink); padding: 40px 56px 60px; box-shadow: 14px 14px 0 var(--cream); }
  .kick { color: var(--yellow); font-size: 64px; }
  .title { color: var(--cream); font-size: 168px; line-height: .95; text-shadow: 6px 6px 0 var(--pink); margin-top: 6px; }
  .ticket { position: absolute; right: 52px; top: 610px; background: var(--yellow); border: 8px solid var(--ink); padding: 26px 40px 14px; transform: rotate(-3deg); box-shadow: 10px 10px 0 var(--ink); font-size: ${range.length > 12 ? 92 : 116}px; white-space: nowrap; }
  .meta { position: absolute; left: 64px; bottom: 60px; }
  .count { display: inline-block; background: var(--ink); color: var(--cream); font-size: 54px; padding: 16px 24px 6px; }
  .cities { background: var(--cream); border: 4px solid var(--ink); font-size: 32px; letter-spacing: 3px; padding: 12px 22px; margin-top: 0; }
  `
  return page(
    css,
    `<div class="scene"></div><div class="band"></div>
     <div class="chip dark">${lang === 'es' ? 'AGENDA' : 'WHAT’S ON'}</div><div class="chip light">FLAMINGOCOUNTY.COM</div>
     <div class="head"><div class="lucky kick">${c.kicker(isWeekend(from, to))}</div><div class="lucky title">${c.title}</div></div>
     <div class="lucky ticket">${esc(range)}</div>
     <div class="meta"><div class="lucky count">${c.count(n)}</div><div class="cities">${esc(cities.join(' · ').toUpperCase())}</div></div>`,
  )
}

/**
 * The list slide's overlay, drawn on a transparent page and laid over the
 * city's loop. The list sits at the bottom and grows upward; the fountain
 * plays in the window above it (`compose`), so three events leave most of
 * the scene and eight still leave a strip. The mascot stands in the lower
 * right corner, and the rows beside it are pulled in so no title runs under
 * it (done in the page, once the fonts have laid the rows out).
 */
function listHtml(lang: Lang, g: CityGroup, rows: Row[], part: number, parts: number, total: number): string {
  const c = COPY[lang]
  const art = CITY_ART[g.slug]
  const mascot = art ? join(MASCOTS, art.mascot) : null
  const accent = art?.accent ?? '#ffd400'
  const titleSize = rows.length > 6 ? 30 : rows.length > 4 ? 34 : 38
  const css = `
  .city { position: absolute; left: 56px; top: 56px; background: var(--ink); color: var(--cream); padding: 22px 34px 8px; box-shadow: 10px 10px 0 ${accent}; }
  .city .name { font-size: ${g.name.length > 10 ? 84 : 104}px; line-height: 1; }
  .city .sub { font-family: Archivo; font-size: 26px; letter-spacing: 4px; color: var(--yellow); padding: 4px 0 16px; }
  .page { position: absolute; right: 56px; top: 68px; background: var(--cream); border: 4px solid var(--ink); font-size: 30px; padding: 8px 16px; }
  .panel { position: absolute; left: 40px; right: 40px; bottom: 40px; background: var(--cream); border: 6px solid var(--ink); box-shadow: 0 -10px 0 ${accent}; padding: 8px 28px 10px; }
  .row { display: flex; gap: 20px; align-items: center; padding: 13px 0; border-bottom: 3px dashed rgba(12,15,20,.22); }
  .row:last-child { border-bottom: 0; }
  .day { flex: 0 0 auto; min-width: 140px; background: var(--yellow); border: 4px solid var(--ink); text-align: center; font-size: 23px; letter-spacing: 1px; padding: 8px 8px 5px; line-height: 1.1; }
  .day.run { font-size: 19px; max-width: 160px; }
  .txt { min-width: 0; flex: 1; }
  .t { font-size: ${titleSize}px; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .w { font-family: Archivo; font-size: 21px; color: #4a4f57; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mascot { position: absolute; right: 6px; bottom: 0; height: 400px; filter: drop-shadow(6px 6px 0 rgba(12,15,20,.5)); }
  `
  const items = rows
    .map((r) => {
      const day = dayText(r, lang)
      const where = [r.time[lang], r.venue].filter(Boolean).join(' · ')
      return `<div class="row"><div class="lucky day${day.length > 9 ? ' run' : ''}">${esc(day)}</div>
        <div class="txt"><div class="lucky t">${escTitle(r.title[lang])}</div>${where ? `<div class="w">${esc(where)}</div>` : ''}</div></div>`
    })
    .join('')
  // Pull in the rows the mascot overlaps, then again: a row that wraps to a
  // second line pushes the panel up and can bring another row beside it.
  const fit = `<script>
    document.fonts.ready.then(() => {
      const m = document.querySelector('.mascot')
      for (let pass = 0; m && pass < 3; pass++) {
        const top = m.getBoundingClientRect().top + 40
        const left = m.getBoundingClientRect().left + 30
        for (const row of document.querySelectorAll('.row')) {
          const b = row.getBoundingClientRect()
          if (b.bottom > top) row.style.paddingRight = Math.max(0, b.right - left) + 'px'
        }
      }
      document.body.dataset.panelTop = String(Math.round(document.getElementById('panel').getBoundingClientRect().top))
      document.body.dataset.ready = '1'
    })
  </script>`
  return page(
    css,
    `<div class="city"><div class="lucky name">${esc(g.name.toUpperCase() || (lang === 'es' ? 'MÁS' : 'MORE'))}</div><div class="sub">${c.count(total)}</div></div>
     ${parts > 1 ? `<div class="lucky page">${c.page(part, parts)}</div>` : ''}
     <div class="panel" id="panel">${items}</div>
     ${mascot ? `<img class="mascot" src="${file(mascot)}">` : ''}${fit}`,
    true,
  )
}

/** A box on a phone screenshot, in the page's CSS pixels. */
type Box = { x: number; y: number; w: number; h: number }
type Shot = { path: string; boxes: Box[] }

/** The phone viewport the screenshots are taken at. */
const PHONE = { width: 390, height: 640 }
const PHONE_W = 452

function saveHtml(lang: Lang, links: Shot, event: Shot): string {
  const c = COPY[lang]
  const k = PHONE_W / PHONE.width
  const rings = (shot: Shot) =>
    shot.boxes
      .map((b) => `<div class="ring" style="left:${b.x * k - 10}px;top:${b.y * k - 10}px;width:${b.w * k + 20}px;height:${b.h * k + 20}px"></div>`)
      .join('')
  const css = `
  body { background: var(--cream) !important; }
  .t1 { position: absolute; left: 60px; top: 170px; font-size: 124px; line-height: .95; color: var(--ink); text-shadow: 5px 5px 0 var(--pink); }
  .t2 { position: absolute; left: 64px; top: 292px; font-size: 40px; letter-spacing: 1px; }
  .phone { position: absolute; top: 380px; width: ${PHONE_W + 20}px; border: 10px solid var(--ink); border-radius: 44px; overflow: hidden; background: #fff; box-shadow: 12px 12px 0 var(--ink); }
  .phone .in { position: relative; }
  .phone img { display: block; width: ${PHONE_W}px; }
  .p1 { left: 52px; } .p2 { right: 52px; }
  .ring { position: absolute; border: 7px solid var(--pink); border-radius: 14px; box-shadow: 0 0 0 4px #fff; }
  .n { position: absolute; top: 352px; width: 82px; height: 82px; border-radius: 50%; background: var(--pink); color: var(--cream); border: 6px solid var(--ink); font-size: 48px; display: flex; align-items: center; justify-content: center; padding-top: 8px; z-index: 2; }
  .n1 { left: 28px; } .n2 { left: 532px; }
  .step { position: absolute; top: 1180px; width: 452px; font-size: 25px; line-height: 1.25; }
  .s1 { left: 62px; } .s2 { right: 62px; }
  .step b { display: block; font-family: Lucky; font-weight: 400; font-size: 38px; letter-spacing: 1px; margin-bottom: 4px; }
  `
  return page(
    css,
    `<div class="band" style="height:110px"></div>
     <div class="lucky t1">${c.saveTitle}</div><div class="t2">${c.saveSub}</div>
     <div class="phone p1"><div class="in"><img src="${file(links.path)}">${rings(links)}</div></div>
     <div class="phone p2"><div class="in"><img src="${file(event.path)}">${rings(event)}</div></div>
     <div class="lucky n n1">1</div><div class="lucky n n2">2</div>
     <div class="step s1"><b>${c.step1}</b>${esc(c.step1b)}</div>
     <div class="step s2"><b>${c.step2}</b>${c.step2b.map(esc).join('<br>')}</div>`,
  )
}

/* ------------------------------------------------------------------------ */
/* Rendering                                                                 */
/* ------------------------------------------------------------------------ */

async function shoot(browser: Browser, html: string, out: string, transparent = false): Promise<Record<string, string>> {
  const tmp = `${out}.html`
  writeFileSync(tmp, html)
  const pg = await browser.newPage({ viewport: { width: W, height: H } })
  await pg.goto(file(tmp))
  await pg.evaluate(() => document.fonts.ready)
  await pg.waitForLoadState('networkidle')
  if (html.includes('dataset.ready')) await pg.waitForFunction(() => document.body.dataset.ready === '1')
  const data = await pg.evaluate(() => ({ ...document.body.dataset }) as Record<string, string>)
  await pg.screenshot({ path: out, omitBackground: transparent, type: out.endsWith('.jpg') ? 'jpeg' : 'png', ...(out.endsWith('.jpg') ? { quality: 90 } : {}) })
  await pg.close()
  unlinkSync(tmp)
  return data
}

/**
 * The overlay over the city's loop, as an MP4 and a JPEG still. CRF 27 keeps
 * a slide near 2 MB: HQ's upload tool fails with "Maximum call stack size
 * exceeded" on a 3.7 MB file (2026-10-12) and takes 2.3 MB, and a 10-second
 * loop behind a list loses nothing visible at that size. The loop
 * fills the window above the panel (`panelTop`), sharp and centred on it;
 * behind the panel and any gap it is the same loop, blurred and darkened.
 */
function compose(loop: string | null, overlay: string, panelTop: number, mp4: string, jpg: string): void {
  const src = loop ?? join(SCENES, 'hialeah-gateway.jpg')
  const [sw, sh] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src])
    .toString()
    .trim()
    .split(',')
    .map(Number)
  // As tall as the window (a little more, for the panel's top edge), never
  // narrower than the slide; even numbers for H.264.
  const even = (n: number) => Math.ceil(n / 2) * 2
  const fgH = even(Math.max((W * sh) / sw, panelTop + 40))
  const y = Math.min(0, Math.round((panelTop + 20 - fgH) / 2))
  const input = loop ? ['-stream_loop', '-1', '-i', src] : ['-loop', '1', '-i', src]
  const filter = [
    `[0:v]fps=30,split[a][b]`,
    `[a]scale=-2:${H},crop=${W}:${H},boxblur=24:2,eq=brightness=-0.10:saturation=1.05[bg]`,
    `[b]scale=-2:${fgH}:flags=lanczos,crop=${W}:${fgH},eq=saturation=1.12:contrast=1.04[fg]`,
    `[bg][fg]overlay=0:${y}[base]`,
    `[base][1:v]overlay=0:0,format=yuv420p[v]`,
  ].join(';')
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...input, '-i', overlay, '-filter_complex', filter, '-map', '[v]', '-t', String(LOOP_SECONDS), '-c:v', 'libx264', '-profile:v', 'high', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', '-an', mp4])
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '2', '-i', mp4, '-frames:v', '1', '-q:v', '2', jpg])
}

/**
 * The two phone screenshots for the save slide, from the live site: /links
 * with its this-week button, and an event on /this-week scrolled to its
 * + MI SEMANA / + CALENDARIO buttons. Returns where those buttons are, for
 * the rings `saveHtml` draws (outlines on the page itself get clipped).
 * Headless Chromium is not counted as a visit (lib/visits.ts).
 */
async function phoneShots(browser: Browser, site: string, lang: Lang, dir: string, slug: string | null): Promise<[Shot, Shot]> {
  const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, locale: lang })
  const box = (el: Element) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }
  const pg = await ctx.newPage()
  await pg.goto(`${site}/${lang}/links`, { waitUntil: 'networkidle' })
  const a = pg.locator('a[href*="this-week"]').first()
  await a.scrollIntoViewIfNeeded()
  await pg.evaluate(() => window.scrollBy(0, -120))
  await pg.waitForTimeout(300)
  const linksBox = await a.evaluate(box)
  const links: Shot = { path: join(dir, `phone-links-${lang}.png`), boxes: [linksBox] }
  await pg.screenshot({ path: links.path })

  const ev = await ctx.newPage()
  await ev.goto(`${site}/${lang}/this-week`, { waitUntil: 'networkidle' })
  // One of the post's events when the page is on its week; rendered ahead of
  // that week, whichever event the page shows first (the buttons are the same).
  const mine = ev.locator(`a[href$="/${slug}/ics"]`).first()
  const cal = slug && (await mine.count()) ? mine : ev.locator('a[href$="/ics"]').first()
  if (!(await cal.count())) throw new Error('No event with a calendar button on /this-week')
  const card = cal.locator('xpath=ancestor::article[1]')
  const save = card.getByText(/MI SEMANA|MY WEEK/).first()
  // The buttons in the lower part of the screen, the event's title above them.
  await cal.scrollIntoViewIfNeeded()
  await ev.evaluate((el) => {
    const r = (el as Element).getBoundingClientRect()
    window.scrollBy(0, r.bottom - window.innerHeight * 0.78)
  }, await cal.elementHandle())
  await ev.waitForTimeout(300)
  const boxes = [await cal.evaluate(box)]
  if (await save.count()) boxes.unshift(await save.evaluate(box))
  const event: Shot = { path: join(dir, `phone-event-${lang}.png`), boxes }
  await ev.screenshot({ path: event.path })
  await ctx.close()
  return [links, event]
}

async function main() {
  const from = arg('from')
  const to = arg('to')
  if (!from || !to || !ISO.test(from) || !ISO.test(to) || to < from) {
    console.error('Usage: pnpm social:events -- --from YYYY-MM-DD --to YYYY-MM-DD [--out DIR] [--site URL]')
    process.exit(2)
  }
  const site = (arg('site') ?? 'https://flamingocounty.com').replace(/\/$/, '')
  const out = resolve(arg('out')?.replace(/^~/, homedir()) ?? join(homedir(), 'Movies/Flamingo County Reels', `${from} events carousel`))
  mkdirSync(out, { recursive: true })

  const [es, en] = await Promise.all([fetchEvents(site, from, to, 'es'), fetchEvents(site, from, to, 'en')])
  const rows = toRows(es, en, from, to)
  if (!rows.length) {
    console.log(`No published events between ${from} and ${to}: nothing to draw.`)
    return
  }
  const groups = byCity(rows)
  const slides = groups.flatMap((g) => chunk(g.rows).map((part, i, all) => ({ g, part, i: i + 1, n: all.length })))
  if (slides.length > MAX_LIST_SLIDES) throw new Error(`${slides.length} list slides: Instagram takes ${MAX_LIST_SLIDES} with the cover and the save slide. Narrow the range.`)

  const browser = await chromium.launch()
  const manifest: Record<string, unknown> = { from, to, site, events: rows.map((r) => ({ id: r.id, slug: r.slug, day: r.day, city: r.city?.slug ?? null, title: r.title.es })) }
  try {
    for (const lang of LANGS) {
      const dir = join(out, lang)
      mkdirSync(dir, { recursive: true })
      const files: { ig: string[]; fb: string[] } = { ig: [], fb: [] }
      const scene = join(SCENES, groups[0].slug === 'lakes' ? 'main-street-lakes.jpg' : 'hialeah-gateway.jpg')
      const cover = join(dir, '01-cover.jpg')
      await shoot(browser, coverHtml(lang, from, to, rows.length, groups.map((g) => g.name).filter(Boolean), existsSync(scene) ? scene : join(SCENES, 'hialeah-gateway.jpg')), cover)
      files.ig.push(cover)
      files.fb.push(cover)
      let k = 2
      for (const s of slides) {
        const base = join(dir, `${String(k++).padStart(2, '0')}-${s.g.slug}${s.n > 1 ? `-${s.i}` : ''}`)
        const { panelTop } = await shoot(browser, listHtml(lang, s.g, s.part, s.i, s.n, s.g.rows.length), `${base}-overlay.png`, true)
        const art = CITY_ART[s.g.slug]
        compose(art ? join(LOOPS, art.loop) : null, `${base}-overlay.png`, Number(panelTop), `${base}.mp4`, `${base}.jpg`)
        files.ig.push(`${base}.mp4`)
        files.fb.push(`${base}.jpg`)
      }
      const [links, event] = await phoneShots(browser, site, lang, dir, rows.find((r) => !r.started)?.slug ?? rows[0].slug)
      const save = join(dir, `${String(k).padStart(2, '0')}-save.jpg`)
      await shoot(browser, saveHtml(lang, links, event), save)
      files.ig.push(save)
      files.fb.push(save)

      const ig = caption(groups, from, to, lang)
      // Instagram's limit. Eight short lines a city sit far below it; a very
      // busy range could not, and it is the owner who picks what to cut.
      if (ig.length > CAPTION_LIMIT) console.warn(`${lang} caption is ${ig.length} characters; Instagram takes ${CAPTION_LIMIT}. Shorten it before drafting.`)
      writeFileSync(join(dir, 'caption-instagram.txt'), ig)
      // The Facebook link is the draft's own /go/fb/<id> link; the skill fills
      // FB_LINK in once the draft exists.
      writeFileSync(join(dir, 'caption-facebook.txt'), caption(groups, from, to, lang, 'FB_LINK'))
      manifest[lang] = files
    }
  } finally {
    await browser.close()
  }
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`${rows.length} events, ${slides.length} list slide(s) per language → ${out}`)
}

// Run as a script, not when the unit test imports the helpers above.
if (process.argv[1]?.endsWith('events-carousel.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
