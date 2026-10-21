import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * One coupon a visitor took for a promotion (lib/promos.ts): its code, where
 * the visitor came from, when the business marked it used and who did.
 *
 * Taken on the website, it is deliberately thin, like `hq-uses`: no name,
 * phone, email, IP, user agent or cookie; the code is the only handle. Taken
 * by WhatsApp (a promotion's `claimBy`), it keeps the number that wrote to us
 * and their WhatsApp name: that is what lets one number take one coupon and
 * tells us who came. Staff-only; the business sees a masked number.
 */
export const PromoCoupons: CollectionConfig = {
  slug: 'promo-coupons',
  access: staffOnly,
  admin: {
    useAsTitle: 'code',
    group: 'Partners',
    defaultColumns: ['code', 'promotion', 'whatsappName', 'phone', 'source', 'redeemedAt', 'redeemedBy', 'createdAt'],
    description:
      'Coupons people took, and which were used. Website coupons have no name or phone; WhatsApp coupons keep the number and WhatsApp name. "Test" = taken on a staff or owner device; left out of the counts.',
  },
  defaultSort: '-createdAt',
  // One coupon per WhatsApp number per promotion. Website coupons have no phone, and SQLite lets those repeat.
  indexes: [{ fields: ['promotion', 'phone'], unique: true }],
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
    { name: 'channel', type: 'select', options: ['web', 'whatsapp'], defaultValue: 'web', admin: { description: 'Where it was taken.' } },
    { name: 'phone', type: 'text', index: true, admin: { description: 'WhatsApp coupons: the number that asked for it (+13055551234).' } },
    { name: 'whatsappName', type: 'text', admin: { description: 'WhatsApp coupons: the name on their WhatsApp profile, as they set it.' } },
    { name: 'redeemedAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'redeemedBy',
      type: 'text',
      admin: { description: 'The staff member whose PIN marked it used, as named then. Empty = the shared business PIN.' },
    },
    {
      name: 'pinFails',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Wrong PINs typed on this coupon. At 5 it locks.' },
    },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true },
  ],
}
