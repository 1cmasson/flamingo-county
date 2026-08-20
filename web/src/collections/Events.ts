import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * Events — `EVENTS` (20 records) in fc-data.js.
 *
 * Venue is a branch in the source: 16 events carry `biz` (a business id) and 4
 * carry `place` + `hood` + `city` instead. `venueType` makes that explicit
 * rather than leaving it to "whichever field happens to be set".
 *
 * `going` is a seed integer baked into the record, not live data — real
 * saved/going state is localStorage-only (`fc.saved`, `fc.going`) and has no
 * server side. It stays a plain number until there are accounts.
 *
 * `date` is a bare calendar date and `timeLabel` is free-text display
 * ('9PM–1AM', '6AM–NOON'), which is how the source has it. Normalizing to real
 * start/end datetimes is a phase-2 decision, tied to rebuilding the date
 * bucketing — the old site hardcoded a two-month window (EV_TODAY '2026-08-17',
 * MONTHNAME with only keys 8 and 9) rather than computing one.
 */
export const Events: CollectionConfig = {
  slug: 'events',
  access: publicRead,
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'date', 'kind', 'star'],
    group: 'Content',
  },
  fields: [
    slugField,
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'date',
          type: 'date',
          required: true,
          admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' } },
        },
        {
          name: 'timeLabel',
          type: 'text',
          admin: { description: 'Display string as written, e.g. "9PM–1AM". Not parsed.' },
        },
        { name: 'kind', type: 'relationship', relationTo: 'event-kinds', required: true },
      ],
    },
    {
      name: 'venueType',
      type: 'select',
      required: true,
      defaultValue: 'listing',
      options: [
        { label: 'At a listed business', value: 'listing' },
        { label: 'At a place (park, centre, church)', value: 'place' },
      ],
    },
    {
      name: 'listing',
      type: 'relationship',
      relationTo: 'listings',
      admin: { condition: (data) => data?.venueType === 'listing' },
    },
    {
      type: 'row',
      admin: { condition: (data) => data?.venueType === 'place' },
      fields: [
        {
          name: 'place',
          type: 'text',
          localized: true,
          admin: { description: 'e.g. "Máximo Gómez Park".' },
        },
        { name: 'hood', type: 'text' },
        { name: 'city', type: 'relationship', relationTo: 'cities' },
      ],
    },
    {
      name: 'star',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Eligible for the "on deck" spotlight.' },
    },
    {
      name: 'going',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Seed count only. Not a live tally — there are no accounts yet.',
      },
    },
    {
      name: 'freeLabel',
      type: 'text',
      localized: true,
      admin: {
        description:
          'A price/entry label, not a boolean — e.g. "NO COVER BEFORE 10", "$12 A PLATE", "FREE TO WATCH".',
      },
    },
    {
      name: 'note',
      type: 'textarea',
      localized: true,
      admin: { description: 'The longer blurb on the event page. Only starred events have one.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'imageHint',
      type: 'text',
      localized: true,
      admin: { description: 'Art direction for the empty photo slot.' },
    },
  ],
}
