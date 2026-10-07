import { describe, expect, it } from 'vitest'
import { eventAnswer, listingAnswer, listingQuestion, verifiedLine } from '../../src/lib/answers'
import { webPageJsonLd } from '../../src/lib/jsonld'

const molinas = {
  name: "Molina's Ranch Restaurant",
  answer: null,
  detail: { address: '4090 East 8th Avenue, Hialeah, FL, 33013' },
}

describe('listingAnswer', () => {
  it('prefers the authored answer', () => {
    expect(listingAnswer('en', { ...molinas, answer: '  A Cuban kitchen.  ' }, { slug: 'food' }, 'Hialeah')).toBe(
      'A Cuban kitchen.',
    )
  })
  it('falls back to name, category, city and street only', () => {
    expect(listingAnswer('en', molinas, { slug: 'food' }, 'Hialeah')).toBe(
      "Molina's Ranch Restaurant is a restaurant in Hialeah, Florida, at 4090 East 8th Avenue.",
    )
    expect(listingAnswer('es', molinas, { slug: 'food' }, 'Hialeah')).toBe(
      "Molina's Ranch Restaurant es un restaurante en Hialeah, Florida, en 4090 East 8th Avenue.",
    )
  })
  it('never prints a partial address as a street', () => {
    const club = { name: 'Club de la Amistad', answer: null, detail: { address: 'Hialeah, FL' } }
    expect(listingAnswer('en', club, { slug: 'nonprofit' }, 'Hialeah')).toBe(
      'Club de la Amistad is a nonprofit organization in Hialeah, Florida.',
    )
  })
  it('calls a local gem an institution', () => {
    const park = { name: 'Hialeah Park', answer: null, detail: { address: '100 E 32nd St, Hialeah, FL 33013' } }
    expect(listingAnswer('es', park, { slug: 'gems' }, 'Hialeah')).toBe(
      'Hialeah Park es una institución local en Hialeah, Florida, en 100 E 32nd St.',
    )
  })
  it('uses a neutral noun for an unknown category', () => {
    expect(listingAnswer('en', { name: 'X', answer: null, detail: {} }, null, undefined)).toBe(
      'X is a local business.',
    )
  })
  it('asks the question with the name', () => {
    expect(listingQuestion('es', 'Polo Norte')).toBe('¿Qué es Polo Norte?')
  })
})

describe('verifiedLine', () => {
  it('prints the stored calendar day, not the day before', () => {
    expect(verifiedLine('en', '2026-08-18T00:00:00.000Z')).toBe('Last verified August 18, 2026')
    expect(verifiedLine('es', '2026-08-18T12:00:00.000Z')).toBe('Verificado por última vez el 18 de agosto de 2026')
  })
  it('is absent when nobody has checked', () => {
    expect(verifiedLine('en', null)).toBeNull()
  })
})

describe('eventAnswer', () => {
  const gala = {
    title: 'Friendship & Recognition Gala',
    date: '2026-10-06T12:00:00.000Z',
    endDate: null,
    timeLabel: '5:00 PM – 10:00 PM',
    eventStatus: 'scheduled' as const,
  }
  const where = { venue: 'Salón Rojo', cityName: 'Hialeah', organizer: 'Club de la Amistad' }

  it('says when, where and who for an upcoming event', () => {
    expect(eventAnswer('en', gala, where, '2026-10-01')).toBe(
      '“Friendship & Recognition Gala” takes place on Tuesday, October 6, 2026, 5:00 PM – 10:00 PM, at Salón Rojo, Hialeah. Organized by Club de la Amistad.',
    )
    expect(eventAnswer('es', { ...gala, title: 'Gala de la Amistad' }, where, '2026-10-01')).toBe(
      '«Gala de la Amistad» es el martes, 6 de octubre de 2026, 5:00 PM – 10:00 PM, en Salón Rojo, Hialeah. Organiza: Club de la Amistad.',
    )
  })
  it('goes past tense once the day has gone', () => {
    expect(eventAnswer('en', gala, { venue: 'Salón Rojo' }, '2026-10-07')).toBe(
      '“Friendship & Recognition Gala” took place on Tuesday, October 6, 2026, 5:00 PM – 10:00 PM, at Salón Rojo.',
    )
  })
  it('spans a multi-day event', () => {
    expect(
      eventAnswer('en', { ...gala, endDate: '2026-10-08T12:00:00.000Z', timeLabel: null }, { venue: '' }, '2026-10-01'),
    ).toBe('“Friendship & Recognition Gala” takes place from Tuesday, October 6, 2026 to Thursday, October 8, 2026.')
  })
  it('says cancelled, postponed and new date plainly', () => {
    expect(eventAnswer('en', { ...gala, eventStatus: 'cancelled' }, { venue: 'Salón Rojo' }, '2026-10-01')).toBe(
      '“Friendship & Recognition Gala”, planned for Tuesday, October 6, 2026, at Salón Rojo, is cancelled.',
    )
    expect(eventAnswer('es', { ...gala, eventStatus: 'postponed' }, { venue: 'Salón Rojo' }, '2026-10-01')).toBe(
      '«Friendship & Recognition Gala», previsto para el martes, 6 de octubre de 2026, en Salón Rojo, está aplazado y aún no tiene nueva fecha.',
    )
    expect(eventAnswer('en', { ...gala, eventStatus: 'rescheduled' }, { venue: 'Salón Rojo' }, '2026-10-01')).toBe(
      '“Friendship & Recognition Gala” has moved to a new date: Tuesday, October 6, 2026, 5:00 PM – 10:00 PM, at Salón Rojo.',
    )
  })
})

describe('webPageJsonLd', () => {
  it('carries dateModified on the page, pointing at the entity', () => {
    const page = webPageJsonLd('en', '/en/hialeah/molinas-ranch', {
      name: "Molina's Ranch",
      mainEntityId: 'https://flamingocounty.com/en/hialeah/molinas-ranch#business',
      dateModified: '2026-08-18T00:00:00.000Z',
    })
    expect(page).toMatchObject({
      '@type': 'WebPage',
      dateModified: '2026-08-18',
      mainEntity: { '@id': 'https://flamingocounty.com/en/hialeah/molinas-ranch#business' },
    })
  })
  it('claims no freshness nobody checked', () => {
    expect(webPageJsonLd('en', '/en/events/x', { name: 'X' })).not.toHaveProperty('dateModified')
  })
})
