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
      type: 'row',
      fields: [
        { name: 'showSpotlight', type: 'checkbox', defaultValue: true },
        { name: 'showRatings', type: 'checkbox', defaultValue: true },
      ],
    },
    { name: 'memberBadges', type: 'checkbox', defaultValue: true },
    {
      type: 'row',
      fields: [
        { name: 'contactEmail', type: 'text' },
        { name: 'contactPhone', type: 'text' },
      ],
    },
    {
      type: 'collapsible',
      label: 'All-cities hero',
      admin: {
        description:
          'Used on the home page when no city filter is applied. Each city supplies its own hero photo and cast on its own record.',
      },
      fields: [
        {
          name: 'heroPhoto',
          type: 'upload',
          relationTo: 'media',
          admin: { description: 'The skyline shot behind the headline.' },
        },
        {
          name: 'heroCast',
          type: 'upload',
          relationTo: 'media',
          admin: { description: 'The three mascots together.' },
        },
        {
          name: 'heroCastBg',
          type: 'text',
          defaultValue: '#00feff',
          admin: { description: 'Backdrop hex behind the group art.' },
        },
      ],
    },
  ],
}
