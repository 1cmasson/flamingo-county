import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * The three cities — `CITIES` in fc-data.js, an object keyed by slug.
 *
 * `sub` and `blurb` are localized; `name` is not (HIALEAH, MIAMI LAKES and
 * LITTLE HAVANA are proper nouns and render identically in both languages).
 * Note hialeah's `sub` — "La Ciudad que Progresa" — is already Spanish in the
 * English copy, on purpose: it is the city's actual motto.
 */
export const Cities: CollectionConfig = {
  slug: 'cities',
  access: publicRead,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'sub', 'slug'],
    group: 'Content',
  },
  fields: [
    slugField,
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: { description: 'Set in caps. Not translated — proper noun.' },
    },
    {
      name: 'sub',
      type: 'text',
      localized: true,
      admin: { description: 'The tagline under the name, e.g. "Calle Ocho Forever".' },
    },
    {
      name: 'blurb',
      type: 'textarea',
      localized: true,
      admin: { description: 'The paragraph on the city page.' },
    },
    {
      name: 'order',
      type: 'number',
      admin: {
        position: 'sidebar',
        description: 'Order in the nav tabs and city lists. Source order: Hialeah, Miami Lakes, Little Havana.',
      },
    },
    {
      name: 'lead',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description:
          'Index into the cast array, picking which character represents the city. Vestigial in the source — every city sets `solo`, which wins over it.',
      },
    },
    {
      type: 'collapsible',
      label: 'Palette',
      fields: [
        {
          name: 'accent',
          type: 'text',
          admin: { description: 'City accent hex, e.g. #FF2E88.' },
        },
        {
          name: 'castBg',
          type: 'text',
          admin: { description: 'Backdrop hex behind the mascot cast.' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Photography',
      fields: [
        {
          name: 'photo',
          type: 'upload',
          relationTo: 'media',
          admin: {
            description:
              'City hero. The static site hand-rolled a responsive set via PHOTOS/pickPhoto; Payload generates the sizes from this single source instead.',
          },
        },
        {
          name: 'photoPos',
          type: 'text',
          admin: { description: 'CSS object-position, e.g. "center 45%". Blank means center.' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Mascots',
      fields: [
        {
          name: 'solo',
          type: 'upload',
          relationTo: 'media',
          admin: { description: 'The single mascot used in compact spots.' },
        },
        {
          name: 'soloName',
          type: 'text',
          admin: { description: 'e.g. RAFA. Not translated — a name.' },
        },
        {
          name: 'castCount',
          type: 'number',
          admin: { description: 'How many characters the group art depicts.' },
        },
        {
          name: 'groupAR',
          type: 'text',
          admin: { description: 'Aspect ratio of the group art, e.g. "1122 / 975".' },
        },
        {
          name: 'headOffset',
          type: 'group',
          admin: {
            description: 'Crops the mascot head out of the group art for the city tab avatar.',
          },
          fields: [
            { name: 'h', type: 'text', admin: { description: 'height, e.g. 440%' } },
            { name: 'l', type: 'text', admin: { description: 'left, e.g. -50%' } },
            { name: 't', type: 'text', admin: { description: 'top, e.g. -11%' } },
          ],
        },
        {
          name: 'cast',
          type: 'array',
          admin: { description: 'The mascot busts shown on the city page.' },
          fields: [
            { name: 'image', type: 'upload', relationTo: 'media' },
            {
              name: 'name',
              type: 'text',
              admin: { description: 'e.g. "RAFA & YOLI". Not translated — names.' },
            },
            { name: 'bg', type: 'text', admin: { description: 'Backdrop hex for this bust.' } },
            { name: 'z', type: 'number', admin: { description: 'Stacking order.' } },
            {
              name: 'group',
              type: 'checkbox',
              defaultValue: false,
              admin: { description: 'This image shows the whole cast, not one character.' },
            },
          ],
        },
      ],
    },
  ],
}
