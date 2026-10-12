import { describe, expect, it } from 'vitest'

import type { City, Event } from '../../src/payload-types'
import { byCity, caption, chunk, dayText, isWeekend, rangeText, toRows, type Row } from '../../scripts/social/events-carousel'

const hialeah = { id: 1, slug: 'hialeah', name: 'HIALEAH', order: 0 } as City
const lakes = { id: 2, slug: 'lakes', name: 'MIAMI LAKES', order: 1 } as City

function ev(id: number, date: string, extra: Partial<Event> = {}): Event {
  return {
    id,
    slug: `ev-${id}`,
    title: `Evento ${id}`,
    date: `${date}T12:00:00.000Z`,
    venueType: 'place',
    place: `Lugar ${id}`,
    city: hialeah,
    eventStatus: 'scheduled',
    ...extra,
  } as Event
}

describe('events carousel', () => {
  it('cuts a city into even slides of at most eight', () => {
    expect(chunk([1, 2, 3]).map((s) => s.length)).toEqual([3])
    expect(chunk(Array.from({ length: 8 })).map((s) => s.length)).toEqual([8])
    expect(chunk(Array.from({ length: 10 })).map((s) => s.length)).toEqual([5, 5])
    expect(chunk(Array.from({ length: 17 })).map((s) => s.length)).toEqual([6, 6, 5])
  })

  it('keeps the range, drops cancelled and priced events, and lists a run under its first day in range', () => {
    const es = [
      ev(1, '2026-10-01', { endDate: '2026-10-19T12:00:00.000Z' }),
      ev(2, '2026-10-24', { city: lakes }),
      ev(3, '2026-10-22', { eventStatus: 'cancelled' }),
      ev(4, '2026-10-23', { title: 'Cena $25' }),
      ev(5, '2026-10-27'),
      ev(6, '2026-10-20'),
    ]
    const en = [ev(1, '2026-10-01', { title: 'Event 1', endDate: '2026-10-19T12:00:00.000Z' })]
    const rows = toRows(es, en, '2026-10-19', '2026-10-25')
    expect(rows.map((r) => r.id)).toEqual([1, 6, 2])
    expect(rows[0]).toMatchObject({ day: '2026-10-19', last: '2026-10-19', started: true })
    expect(rows[0].title).toEqual({ es: 'Evento 1', en: 'Event 1' })
    // No English version: the Spanish title stands in rather than nothing.
    expect(rows[1].title.en).toBe('Evento 6')

    const groups = byCity(rows)
    expect(groups.map((g) => [g.slug, g.name, g.rows.length])).toEqual([
      ['hialeah', 'Hialeah', 2],
      ['lakes', 'Miami Lakes', 1],
    ])
  })

  it('gives a run its real last day, not the range end', () => {
    const [row] = toRows([ev(1, '2026-10-01', { endDate: '2026-10-19T12:00:00.000Z' })], [], '2026-10-16', '2026-10-18')
    expect(row).toMatchObject({ day: '2026-10-16', last: '2026-10-19', started: true })
    expect(dayText(row, 'es')).toBe('HASTA LUN 19')
  })

  it('labels days, runs and ranges in both languages', () => {
    const row = (day: string, last: string, started = false) => ({ day, last, started }) as Row
    expect(dayText(row('2026-10-24', '2026-10-24'), 'es')).toBe('SÁB 24')
    expect(dayText(row('2026-10-24', '2026-10-25'), 'en')).toBe('SAT 24–SUN 25')
    expect(dayText(row('2026-10-19', '2026-10-19', true), 'es')).toBe('HASTA LUN 19')
    expect(dayText(row('2026-10-19', '2026-10-19', true), 'en')).toBe('UNTIL MON 19')
    expect(rangeText('2026-10-19', '2026-10-25', 'es')).toBe('19–25 OCT')
    expect(rangeText('2026-10-19', '2026-10-25', 'en')).toBe('OCT 19–25')
    expect(rangeText('2026-10-30', '2026-11-01', 'en')).toBe('OCT 30 – NOV 1')
    expect(isWeekend('2026-10-23', '2026-10-25')).toBe(true)
    expect(isWeekend('2026-10-19', '2026-10-25')).toBe(false)
  })

  it('writes a caption per city, with "link in bio" on Instagram and the link on Facebook', () => {
    const rows = toRows([ev(1, '2026-10-24'), ev(2, '2026-10-24', { city: lakes })], [], '2026-10-23', '2026-10-25')
    const ig = caption(byCity(rows), '2026-10-23', '2026-10-25', 'es')
    expect(ig).toContain('este fin de semana, 23–25 oct')
    expect(ig).toContain('HIALEAH\n• Sáb 24 · Evento 1 · Lugar 1')
    expect(ig).toContain('MIAMI LAKES\n• Sáb 24 · Evento 2 · Lugar 2')
    expect(ig).toContain('link en la bio')
    const fb = caption(byCity(rows), '2026-10-23', '2026-10-25', 'en', 'https://flamingocounty.com/go/fb/9')
    expect(fb).toContain('https://flamingocounty.com/go/fb/9')
    expect(fb).not.toContain('link in bio')
    expect(ig).not.toMatch(/\$\d/)
  })
})
