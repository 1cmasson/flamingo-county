import type { GlobalConfig } from 'payload'

/**
 * Site-wide switches.
 *
 * These are the escaped-JSON `data-props` currently sitting on the Home, City,
 * Business, Events and ListYourSpot components — set per page in the Claude
 * Design canvas, which meant flipping ratings off site-wide took five edits.
 * One global instead.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: { read: () => true },
  admin: { group: 'Settings' },
  fields: [
    {
      name: 'price',
      type: 'number',
      defaultValue: 20,
      min: 5,
      max: 99,
      admin: { description: 'Membership price in $/month.' },
    },
    {
      type: 'row',
      fields: [
        { name: 'showSpotlight', type: 'checkbox', defaultValue: true },
        { name: 'showRatings', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'memberBadges', type: 'checkbox', defaultValue: true },
        { name: 'showMenuPrices', type: 'checkbox', defaultValue: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'contactEmail', type: 'text' },
        { name: 'contactPhone', type: 'text' },
      ],
    },
  ],
}
