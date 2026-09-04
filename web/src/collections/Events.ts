import type { CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * `HH:mm`, or empty. Validated at the edge rather than in the ICS route: a
 * malformed clock reaching `Date.UTC` produces `NaN`, and an ICS with
 * `DTSTART:NaNNaNNaN` is a file every calendar client rejects silently.
 */
const hhmm = (value: unknown) =>
  !value ||
  (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
  'Use 24-hour HH:mm, e.g. 09:00.'

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
          localized: true,
          admin: {
            description:
              'Display string as written, e.g. "9PM–1AM". Not parsed — `startTime` is the clock the calendar file reads. Localized because it is not always a clock reading: an event whose time is not settled says so in words ("Por confirmar"), and that has to translate.',
          },
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
      /**
       * The machine-readable clock, `HH:mm` on a 24-hour dial, in Miami time.
       *
       * `timeLabel` cannot do this job. It is display copy and always has been
       * — '9PM–1AM', '6AM–NOON', 'Por confirmar' — so the calendar file had
       * nothing to promote to a real start and emitted an all-day entry
       * instead. That is fine for a street party and wrong for a 9am
       * breakfast, which lands in the calendar as a banner across the whole
       * Sunday with no hour on it.
       *
       * Two separate fields rather than parsing one, because the label has to
       * stay free to say something that is not a time. Keep them agreeing:
       * nothing checks that '9:00 AM' and `09:00` are the same instant.
       *
       * Leave both empty for an event whose hour is not settled — the ICS goes
       * back to all-day, which is the honest shape for "we don't know yet".
       */
      type: 'row',
      fields: [
        {
          name: 'startTime',
          type: 'text',
          validate: hhmm,
          admin: {
            description:
              '24-hour HH:mm in Miami time, e.g. 09:00. Drives the .ics file only; the page prints timeLabel.',
          },
        },
        {
          name: 'endTime',
          type: 'text',
          validate: hhmm,
          admin: {
            description:
              'Optional, same format. Left empty the calendar entry runs an hour from startTime — a length for the calendar to draw, not a published finishing time.',
          },
        },
      ],
    },
    {
      name: 'star',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Currently drives nothing. It marked an event as eligible for the HEADLINERS strip at the top of the events board; that strip has been removed, so no page reads this. Kept because the flag is a genuine editorial judgement and the source data carries it — not because anything is wired to it.',
      },
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
