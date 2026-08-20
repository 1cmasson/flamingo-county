import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * Event kinds — `EKINDS` in fc-data.js.
 *
 * As with Categories, the source's leading `all` entry is a filter affordance,
 * not a taxonomy row: 8 in the source, 7 imported.
 *
 * `bg` and `ink` are presentation baked into the taxonomy — each kind carries
 * its own CSS gradient and ink colour, and `ekind()` falls back to the `music`
 * palette on a miss. They stay as fields rather than moving into code, because
 * adding a kind in the admin has to be able to give it a colour without a
 * deploy.
 */
export const EventKinds: CollectionConfig = {
  slug: 'event-kinds',
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
    },
    {
      name: 'bg',
      type: 'text',
      required: true,
      admin: {
        description:
          'CSS background — a hex colour or a full linear-gradient(...) string. Used as the chip/badge fill.',
      },
    },
    {
      name: 'ink',
      type: 'text',
      required: true,
      admin: { description: 'Foreground hex that reads against bg, e.g. #FFF6E5 or #0C0F14.' },
    },
    {
      name: 'order',
      type: 'number',
      admin: { position: 'sidebar', description: 'Chip display order.' },
    },
  ],
}
