import { describe, it, expect } from 'vitest'
import { utcStamp } from '@/lib/dates'

/**
 * The calendar file writes a UTC instant, so every event's hour depends on
 * getting Miami's offset right on that particular date — and the offset is not
 * a constant. September is EDT (UTC-4) and January is EST (UTC-5), which is a
 * whole hour of wrong for anyone who saves a winter event.
 *
 * The two spring-forward cases are the ones that justify resolving the offset
 * twice rather than once: 8 March 2026 is a 23-hour day, and 01:30 and 09:00
 * on it sit either side of the change.
 */
describe('utcStamp', () => {
  it('writes an EDT morning as UTC-4', () => {
    expect(utcStamp('2026-09-06', '09:00')).toBe('20260906T130000Z')
  })

  it('writes an EST morning as UTC-5', () => {
    expect(utcStamp('2026-01-15', '09:00')).toBe('20260115T140000Z')
  })

  it('is already on daylight time later in the spring-forward day', () => {
    expect(utcStamp('2026-03-08', '09:00')).toBe('20260308T130000Z')
  })

  it('is still on standard time before the spring-forward hour', () => {
    expect(utcStamp('2026-03-08', '01:30')).toBe('20260308T063000Z')
  })

  it('is back on standard time after the autumn change', () => {
    expect(utcStamp('2026-11-01', '09:00')).toBe('20261101T140000Z')
  })

  it('adds minutes for the default one-hour end', () => {
    expect(utcStamp('2026-09-06', '09:00', 60)).toBe('20260906T140000Z')
  })
})
