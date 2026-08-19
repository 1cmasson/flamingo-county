import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * Business listings — `BIZ` (14 records) joined with `DETAIL` in fc-data.js.
 *
 * IMPORTANT: `DETAIL` has exactly ONE authored entry, `el-gallo`. The other 13
 * listings' phone, site, hours, story and quote are *synthesized at render time
 * from the array index* in Business.dc.html:206-219 —
 * `phone: '(305) 555-0' + (100 + index)`, `site: id.replace(/-/g,'') + '.com'`,
 * plus a templated 3-paragraph story. The seed deliberately does NOT import
 * that, so the admin shows honestly which listings still need writing rather
 * than laundering placeholder data in as if an owner had supplied it.
 *
 * The 4-item `services` array on Business.dc.html:232-237 is likewise not per
 * business data — it is identical page copy for every non-food listing, so it
 * lives in the listYourSpot global, not here.
 */
export const Listings: CollectionConfig = {
  slug: 'listings',
  access: publicRead,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'city', 'category', 'member'],
    group: 'Content',
  },
  fields: [
    slugField,
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Not translated — the business name is the business name.' },
    },
    {
      type: 'row',
      fields: [
        { name: 'city', type: 'relationship', relationTo: 'cities', required: true },
        { name: 'category', type: 'relationship', relationTo: 'categories', required: true },
      ],
    },
    {
      name: 'hood',
      type: 'text',
      admin: { description: 'Cross street or neighbourhood, e.g. "SW 8th St".' },
    },
    {
      name: 'tag',
      type: 'textarea',
      localized: true,
      admin: { description: 'The one-line pitch on the card. Fully translated in the source.' },
    },
    {
      type: 'row',
      fields: [
        { name: 'rating', type: 'number', min: 0, max: 5 },
        { name: 'reviews', type: 'number', min: 0 },
        {
          name: 'price',
          type: 'select',
          options: [
            { label: '$', value: '$' },
            { label: '$$', value: '$$' },
            { label: '$$$', value: '$$$' },
          ],
        },
      ],
    },
    {
      name: 'member',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Paying member — earns the badge.' },
    },
    {
      name: 'imageHint',
      type: 'text',
      localized: true,
      admin: {
        description:
          'Art direction for the empty photo slot, e.g. "Cantina bar". Shown as the placeholder label until a real photo lands.',
      },
    },
    {
      name: 'gallery',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      admin: { description: 'Hero first, then the detail-page gallery. Empty for now by design.' },
    },
    {
      // A named `group`, not a `collapsible`: collapsible is presentational and
      // flattens its children to the top level, so `data.detail` would be
      // silently dropped on write.
      name: 'detail',
      type: 'group',
      label: 'Detail page',
      admin: {
        description:
          'Only el-gallo has authored detail. Everything else is intentionally blank — the old site faked these values from the array index.',
      },
      fields: [
        {
          name: 'story',
          type: 'array',
          localized: true,
          labels: { singular: 'Paragraph', plural: 'Paragraphs' },
          fields: [{ name: 'text', type: 'textarea', required: true }],
        },
        { name: 'quote', type: 'textarea', localized: true },
        {
          name: 'quoteBy',
          type: 'text',
          admin: { description: 'e.g. "RIGO PEÑA, OWNER". Not translated — a name and a role.' },
        },
        {
          name: 'crewLine',
          type: 'textarea',
          localized: true,
          admin: { description: 'The mascot-crew aside on the detail page.' },
        },
        {
          type: 'row',
          fields: [
            { name: 'address', type: 'text' },
            { name: 'phone', type: 'text' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'site', type: 'text', admin: { description: 'Bare host, no scheme.' } },
            { name: 'cta', type: 'text', localized: true },
          ],
        },
        {
          name: 'hours',
          type: 'array',
          fields: [
            {
              name: 'd',
              type: 'text',
              required: true,
              localized: true,
              admin: { description: 'e.g. "Mon – Wed"' },
            },
            {
              name: 't',
              type: 'text',
              required: true,
              admin: { description: 'e.g. "11am – 11pm"' },
            },
          ],
        },
        {
          name: 'menuNote',
          type: 'text',
          localized: true,
          admin: { description: 'e.g. "KITCHEN OPEN UNTIL 1AM".' },
        },
        {
          name: 'menu',
          type: 'array',
          fields: [
            {
              name: 'name',
              type: 'text',
              required: true,
              localized: true,
              admin: { description: 'Dish names are often already Spanish — leave those as-is.' },
            },
            { name: 'desc', type: 'textarea', localized: true },
            { name: 'price', type: 'text' },
          ],
        },
      ],
    },
  ],
}
