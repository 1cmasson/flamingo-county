import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * Business categories — `CATS` in fc-data.js.
 *
 * The source array has 6 entries, but the first is `{ key: 'all', label:
 * 'EVERYTHING' }`, which is a filter-chip affordance rather than a taxonomy
 * row. We import the 5 real ones; the filter UI synthesizes its own "all".
 * Importing it would make a listing assignable to "all" and would render a
 * duplicate chip on the ported frontend.
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  access: publicRead,
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'slug'],
    group: 'Taxonomy',
  },
  fields: [
    slugField,
    {
      name: 'label',
      type: 'text',
      required: true,
      localized: true,
      admin: { description: 'Shown on the filter chips. Set in caps, e.g. BARS & RESTAURANTS.' },
    },
    {
      name: 'order',
      type: 'number',
      admin: { position: 'sidebar', description: 'Chip display order.' },
    },
  ],
}
