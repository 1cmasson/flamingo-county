import { randomBytes } from 'node:crypto'
import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * A business that runs promotions with us: its staff PIN and the private
 * link to its coupon dashboard (lib/promos.ts). One row per business, kept for
 * every promotion it runs, so staff learn one PIN and the owner keeps one
 * bookmark.
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
      'Businesses running coupons. The PIN is what their staff type to mark a coupon used; the dashboard link shows them how many came in. Give both to the business in person.',
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
      name: 'staffPin',
      type: 'text',
      required: true,
      validate: (v: unknown) => (typeof v === 'string' && /^\d{4}$/.test(v)) || 'Four digits, e.g. 4821.',
      admin: { description: 'Four digits staff type on the customer’s phone to redeem. Change it if it leaks; old coupons keep working.' },
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
