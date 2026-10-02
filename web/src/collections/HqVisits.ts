import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * One row per page view on the public site, from the site's own counter
 * (lib/visits.ts, components/Pageview.tsx). The traffic half of the growth
 * review: how many people came, from where, and to which pages.
 *
 * Deliberately thin, like `hq-clicks`: no IP, no user agent, no cookie and no
 * visitor id, so two views can never be tied to one person. A visit is counted
 * by its `entry` row (the first page); `source` and `refHost` are set only there.
 * Bots, link previews and anyone signed in to the admin are not counted.
 */
export const HqVisits: CollectionConfig = {
  slug: 'hq-visits',
  access: staffOnly,
  admin: {
    group: 'HQ',
    defaultColumns: ['path', 'entry', 'source', 'country', 'city', 'createdAt'],
    description:
      'Page views on the site, from its own counter. No IPs, cookies or visitor ids. Bots and signed-in staff are not counted.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'path', type: 'text', required: true, index: true },
    {
      name: 'entry',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { description: 'The first page of a visit. Count these for visits; every row for page views.' },
    },
    {
      name: 'source',
      type: 'text',
      index: true,
      admin: {
        description:
          'Entries only: google, facebook, chatgpt…, a referring site’s hostname, a utm_source tag (qr, flyer), or direct.',
      },
    },
    { name: 'refHost', type: 'text', admin: { description: 'Entries only: the referring hostname, never the full URL.' } },
    {
      type: 'row',
      fields: [
        {
          name: 'lang',
          type: 'select',
          options: [
            { label: 'Español', value: 'es' },
            { label: 'English', value: 'en' },
          ],
        },
        {
          name: 'device',
          type: 'select',
          options: [
            { label: 'Mobile', value: 'mobile' },
            { label: 'Desktop', value: 'desktop' },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'country', type: 'text' },
        { name: 'region', type: 'text', admin: { description: 'e.g. FL' } },
        { name: 'city', type: 'text' },
      ],
    },
  ],
}
