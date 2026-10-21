import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * One coupon a visitor took for a promotion (lib/promos.ts): its code, where
 * the visitor came from, and when the business marked it used.
 *
 * Deliberately thin, like `hq-uses`: no name, phone, email, IP, user agent or
 * cookie. The code is the only handle, and it lives on the visitor's phone
 * (and in their WhatsApp chat with us, if they saved it there).
 */
export const PromoCoupons: CollectionConfig = {
  slug: 'promo-coupons',
  access: staffOnly,
  admin: {
    useAsTitle: 'code',
    group: 'Partners',
    defaultColumns: ['code', 'promotion', 'source', 'redeemedAt', 'test', 'createdAt'],
    description: 'Coupons people took, and which were used. No names, phones or IPs. "Test" = taken on a staff or owner device; left out of the counts.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'code', type: 'text', required: true, unique: true, index: true },
    { name: 'promotion', type: 'relationship', relationTo: 'promotions', required: true, index: true },
    {
      name: 'listing',
      type: 'relationship',
      relationTo: 'listings',
      required: true,
      index: true,
      admin: { description: 'The promotion’s business, kept here so a business’s dashboard is one query.' },
    },
    {
      name: 'source',
      type: 'text',
      index: true,
      admin: { description: 'Where the visitor came from: instagram, facebook, google, direct, qr…' },
    },
    { name: 'lang', type: 'select', options: ['es', 'en'] },
    { name: 'redeemedAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'pinFails',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Wrong PINs typed on this coupon. At 5 it locks.' },
    },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true },
  ],
}
