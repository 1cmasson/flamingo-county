import { describe, expect, it } from 'vitest'
import { noPrice } from '../../src/fields/shared'

describe('noPrice', () => {
  it('refuses a money amount in either language', () => {
    for (const label of ['$12 A PLATE', '$ 5 cover', '12 dollars', '20 dólares', '10 USD']) {
      expect(noPrice(label)).not.toBe(true)
    }
  })
  it('lets an entry label through', () => {
    for (const label of ['BY INVITATION', 'MEMBERS AND VOLUNTEERS', 'SOCIOS Y VOLUNTARIOS', 'AGES 21+', '', null]) {
      expect(noPrice(label)).toBe(true)
    }
  })
})
