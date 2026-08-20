import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * Weekly spotlight — `SPOTS` in fc-data.js, an object keyed by city (3 entries).
 *
 * Modelled as its own collection rather than a field on Cities so a spotlight
 * can rotate — swap the listing, keep the history — without editing the city.
 *
 * Like WEEKLY, the source records carry no id (the city key is the only
 * handle), so the seed mints `spotlight-<cityKey>` for the upsert.
 */
export const Spotlights: CollectionConfig = {
  slug: 'spotlights',
  access: publicRead,
  admin: {
    useAsTitle: 'slug',
    defaultColumns: ['slug', 'city', 'listing'],
    group: 'Content',
  },
  fields: [
    slugField,
    {
      type: 'row',
      fields: [
        { name: 'city', type: 'relationship', relationTo: 'cities', required: true },
        { name: 'listing', type: 'relationship', relationTo: 'listings', required: true },
      ],
    },
    {
      name: 'kind',
      type: 'text',
      localized: true,
      admin: { description: 'The kicker above the card, e.g. "CANTINA · LIVE MUSIC".' },
    },
    {
      name: 'deal',
      type: 'text',
      localized: true,
      admin: { description: 'The offer, e.g. "2-for-1 mojitos, Thursday to Saturday, 7–9pm".' },
    },
    {
      name: 'blurb',
      type: 'textarea',
      localized: true,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
  ],
}
