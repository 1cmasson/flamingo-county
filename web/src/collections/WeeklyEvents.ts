import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * Recurring weekly events — `WEEKLY` (6 records) in fc-data.js.
 *
 * A separate concept from Events: no date, just a day of week. Renders as the
 * "every week" strip on the events board.
 *
 * The source records are `{ dow, time, title, biz, kind }` with NO id field,
 * so the seed mints `weekly-<dow>-<slugified title>` to keep the upsert
 * idempotent. Without that, every re-run would create 6 duplicates.
 */
export const WeeklyEvents: CollectionConfig = {
  slug: 'weekly-events',
  access: publicRead,
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'dow', 'time', 'listing'],
    group: 'Content',
  },
  fields: [
    slugField,
    { name: 'title', type: 'text', required: true, localized: true },
    {
      type: 'row',
      fields: [
        {
          name: 'dow',
          type: 'select',
          required: true,
          admin: { description: 'Day of week, matching JS getDay(): 0 = Sunday.' },
          options: [
            { label: 'Sunday', value: '0' },
            { label: 'Monday', value: '1' },
            { label: 'Tuesday', value: '2' },
            { label: 'Wednesday', value: '3' },
            { label: 'Thursday', value: '4' },
            { label: 'Friday', value: '5' },
            { label: 'Saturday', value: '6' },
          ],
        },
        {
          name: 'time',
          type: 'text',
          admin: { description: 'Display string, e.g. "8PM" or "5–9PM".' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'listing', type: 'relationship', relationTo: 'listings', required: true },
        { name: 'kind', type: 'relationship', relationTo: 'event-kinds', required: true },
      ],
    },
  ],
}
