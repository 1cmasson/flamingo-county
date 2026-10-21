import type { CollectionConfig } from 'payload'
import { draftVersions, mcpDraftsOnly, noPrice, publishedRead, slugField } from '../fields/shared'

/**
 * An offer a partner business runs through us: "free dessert with any
 * entrée", "2-for-1 appetizers on Tuesdays". Each visitor who wants it gets
 * their own one-time coupon (`promo-coupons`), and the business's staff mark
 * it used with their PIN (`partners`). See lib/promos.ts.
 *
 * Content like any other: drafts, and live only after the owner's Publish tap.
 * The offer says what you get, never what it costs or what it saves (`noPrice`).
 */
export const Promotions: CollectionConfig = {
  slug: 'promotions',
  access: publishedRead,
  versions: draftVersions,
  hooks: { beforeOperation: [mcpDraftsOnly] },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'listing', 'startsOn', 'endsOn', '_status'],
    group: 'Content',
    description:
      'Coupons for a partner business. Each visitor gets a one-time code; the business marks it used with its staff PIN (Partners). The page is /es/promo/<slug>.',
  },
  fields: [
    slugField,
    {
      name: 'listing',
      type: 'relationship',
      relationTo: 'listings',
      required: true,
      index: true,
      admin: { description: 'The business. It needs a Partners row (its PIN) before coupons can be redeemed.' },
    },
    {
      name: 'title',
      type: 'text',
      localized: true,
      required: true,
      validate: noPrice,
      admin: { description: 'The offer, e.g. "Free dessert with any entrée". What you get, never a price or a saving in dollars.' },
    },
    {
      name: 'details',
      type: 'textarea',
      localized: true,
      validate: noPrice,
      admin: { description: 'The fine print, e.g. "Dine-in only. One coupon per table."' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startsOn',
          type: 'date',
          admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' }, description: 'Empty: from when it is published.' },
        },
        {
          name: 'endsOn',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
            description: 'The last day a coupon can be used. Empty: until it is unpublished.',
          },
        },
      ],
    },
    {
      name: 'limit',
      type: 'number',
      min: 1,
      admin: { description: 'At most this many coupons handed out. Empty: no limit.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Optional. Without one, the business’s own photo is used.' },
    },
  ],
}
