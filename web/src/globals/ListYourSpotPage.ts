import type { GlobalConfig } from 'payload'

/**
 * "List your spot" page copy.
 *
 * The 6 membership perks are hardcoded in ListYourSpot.dc.html:176-183 and
 * paired with `perkIcon(i)` (fc-data.js:736), which cycles a fixed icon list by
 * array index — so reordering the perks silently reassigns every icon. Here the
 * icon is named on the perk instead.
 *
 * `services` also lives here rather than on Listings: the 4-item array in
 * Business.dc.html:232-237 is identical page copy for every non-food listing,
 * not per-business data.
 */
export const ListYourSpotPage: GlobalConfig = {
  slug: 'list-your-spot-page',
  access: { read: () => true },
  admin: { group: 'Page copy' },
  fields: [
    {
      name: 'perks',
      type: 'array',
      admin: { description: 'The membership perk chips.' },
      fields: [
        { name: 't', type: 'text', required: true, localized: true },
        { name: 'd', type: 'textarea', required: true, localized: true },
        {
          name: 'icon',
          type: 'select',
          admin: {
            description:
              'Named explicitly. The old site derived this from array position, so reordering perks reshuffled the icons.',
          },
          options: [
            { label: 'Map pin', value: 'map-pin' },
            { label: 'NFC', value: 'nfc' },
            { label: 'QR code', value: 'qr-code' },
            { label: 'Newspaper', value: 'newspaper' },
            { label: 'Megaphone', value: 'megaphone' },
            { label: 'Bird', value: 'bird' },
          ],
        },
      ],
    },
    {
      name: 'services',
      type: 'array',
      admin: {
        description:
          'Shown on every non-food listing detail page. Page copy, identical for all of them — not per-business data.',
      },
      fields: [{ name: 'text', type: 'text', required: true, localized: true }],
    },
  ],
}
