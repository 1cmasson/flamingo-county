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
      ],
    },
    {
      name: 'publicationStatus',
      type: 'select',
      required: true,
      defaultValue: 'unsourced',
      options: [
        { label: 'Ready — every field traces to a source', value: 'ready' },
        { label: 'Needs owner confirmation', value: 'needs_owner_confirmation' },
        { label: 'Unsourced — design placeholder', value: 'unsourced' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'How much of this record is actually known. `unsourced` is the original design content, whose phone and hours were synthesized from the array index — it is not a smaller version of `ready`, it is a different kind of data. Filter on this before publishing anything.',
      },
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
          type: 'row',
          fields: [
            { name: 'email', type: 'text' },
            {
              name: 'instagram',
              type: 'text',
              admin: {
                description:
                  'Full profile URL. For the researched listings this is more reliable than the website — 10 of 11 have one, 9 have a site, and one of those sites is down.',
              },
            },
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
          name: 'hoursConfidence',
          type: 'select',
          options: [
            { label: 'High — one unambiguous owned-channel schedule', value: 'high' },
            { label: 'Medium — sources mostly agree', value: 'medium' },
            { label: 'Low', value: 'low' },
            { label: 'None — sources disagree', value: 'none' },
          ],
          admin: {
            description:
              'Empty means authored design content rather than researched. The Business page renders hours only at `high` or empty; anything less shows a "call to confirm" line instead, because wrong hours generate owner complaints.',
          },
        },
        {
          name: 'hoursConflicts',
          type: 'array',
          labels: { singular: 'Conflict', plural: 'Conflicts' },
          admin: {
            description:
              'Where sources disagreed. Kept rather than resolved — picking one silently is what this record exists to prevent.',
          },
          fields: [
            { name: 'source', type: 'text', required: true },
            { name: 'detail', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'research',
      type: 'group',
      label: 'Research & provenance',
      admin: {
        description:
          'Only populated for imported listings. This is what separates a sourced record from a plausible one — if you edit a field above, add or update the source here too, or the record quietly stops being auditable.',
      },
      fields: [
        {
          name: 'established',
          type: 'text',
          admin: {
            description:
              'The year the business actually opened or was founded, with a source. NOT the Florida corporate filing date — that is a registration event and several businesses here filed decades after opening. Blank means unknown, which is a fact, not an omission to fill in.',
          },
        },
        {
          name: 'establishedNote',
          type: 'textarea',
          admin: { description: 'Why the date is what it is, or why there is none.' },
        },
        {
          name: 'cuisine',
          type: 'text',
          hasMany: true,
          admin: { description: 'e.g. Peruvian, Ceviche, Seafood.' },
        },
        {
          name: 'signatureItems',
          type: 'text',
          hasMany: true,
          admin: { description: 'The dishes a first-timer comes for.' },
        },
        {
          name: 'blockingGaps',
          type: 'text',
          hasMany: true,
          admin: {
            description:
              'What must be asked of the owner before this listing is complete. Non-empty is what `needs owner confirmation` means.',
          },
        },
        {
          name: 'sources',
          type: 'array',
          labels: { singular: 'Source', plural: 'Sources' },
          fields: [
            { name: 'url', type: 'text', required: true },
            { name: 'title', type: 'text' },
            { name: 'publisher', type: 'text' },
            { name: 'type', type: 'text', admin: { description: 'e.g. press, owned, aggregator.' } },
          ],
        },
        {
          name: 'legalEntity',
          type: 'text',
          admin: { description: 'Registered entity name, where it differs from the trading name.' },
        },
        {
          name: 'sourceFile',
          type: 'text',
          admin: {
            description:
              'The dossier this record was generated from, e.g. research/hialeah/molina.md in the flamingo-city repo.',
          },
        },
      ],
    },
  ],
}
