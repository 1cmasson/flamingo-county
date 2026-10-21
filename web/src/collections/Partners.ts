import { randomBytes } from 'node:crypto'
import type { CollectionConfig } from 'payload'
import type { Partner } from '../payload-types'
import { staffOnly } from '../fields/shared'

const fourDigits = (v: unknown) => (typeof v === 'string' && /^\d{4}$/.test(v)) || 'Four digits, e.g. 4821.'

/**
 * A business that runs promotions with us: its staff's PINs and the private
 * link to its coupon dashboard (lib/promos.ts). One row per business, kept for
 * every promotion it runs, so staff learn their PIN once and the owner keeps
 * one bookmark.
 *
 * Each waiter can have their own PIN (`staff`), so the dashboard shows who
 * marked each coupon used; `staffPin` is a shared one for the whole business.
 * Either is enough to start handing out coupons.
 *
 * Its own staff-only collection, not fields on `listings` or `promotions`:
 * those are public-read with drafts, so a PIN there would be one field-access
 * slip from the REST API and would sit in the version history, and changing it
 * would need a publish tap. Not exposed over MCP.
 */
export const Partners: CollectionConfig = {
  slug: 'partners',
  access: staffOnly,
  admin: {
    useAsTitle: 'name',
    group: 'Partners',
    defaultColumns: ['name', 'listing', 'updatedAt'],
    description:
      'Businesses running coupons. Staff type a PIN to mark a coupon used: give each waiter their own (Staff) to see who marked each one. The dashboard link shows them how many came in. Hand PINs and the link over in person.',
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // Minted once and kept: the business bookmarks it. Clearing the field
        // in the admin issues a new one (the old link stops working); an update
        // that doesn't mention it, like a PIN change from a script, keeps it.
        const cleared = operation === 'update' && 'dashboardKey' in data && !data.dashboardKey
        if ((operation === 'create' && !data.dashboardKey) || cleared) data.dashboardKey = randomBytes(18).toString('base64url')
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'How we call them, e.g. "1910 Restaurant & Bar".' },
    },
    { name: 'listing', type: 'relationship', relationTo: 'listings', required: true, unique: true },
    {
      name: 'staff',
      type: 'array',
      labels: { singular: 'Staff member', plural: 'Staff' },
      admin: {
        description: 'One PIN per waiter, so the dashboard shows who marked each coupon. Remove someone when they leave; coupons they marked keep their name.',
        initCollapsed: true,
      },
      validate: (rows: unknown, { siblingData }: { siblingData: Partial<Partner> }) => {
        const pins = (Array.isArray(rows) ? rows : []).map((r: { pin?: string }) => r?.pin).filter(Boolean)
        if (siblingData?.staffPin) pins.push(siblingData.staffPin)
        return new Set(pins).size === pins.length || 'Two people have the same PIN: give each one their own.'
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true, admin: { description: 'As the business calls them, e.g. "Ana".' } },
            { name: 'pin', type: 'text', required: true, validate: fourDigits, admin: { description: 'Four digits only they know.' } },
          ],
        },
      ],
    },
    {
      name: 'staffPin',
      type: 'text',
      validate: (v: unknown) => !v || fourDigits(v),
      admin: {
        description:
          'Optional: one PIN for the whole business, for anyone not on the Staff list. Coupons marked with it show no name. Change it if it leaks; old coupons keep working.',
      },
    },
    {
      name: 'dashboardKey',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description: 'The private part of their dashboard link: flamingocounty.com/es/partner/<this>. Clear it and save to issue a new link.',
      },
    },
    { name: 'notes', type: 'textarea', admin: { description: 'Who to talk to, what was agreed. Never shown to anyone.' } },
  ],
}
