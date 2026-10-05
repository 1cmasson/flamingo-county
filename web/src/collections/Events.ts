import { autoDraftHook } from '../lib/autoDraft'
import { indexNowHooks } from '../lib/indexnow'
import type { CollectionConfig } from 'payload'
import { draftVersions, hhmm, mcpDraftsOnly, noPrice, publishedRead, slugField } from '../fields/shared'
import { SEASON_OPTIONS } from '../lib/seasons'
import { EVENT_SETTING_LABELS, EVENT_SETTINGS, FLAT_SETTING } from '../lib/eventSetting'

const indexNow = indexNowHooks('events')

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
  // Drafts: saved changes stay off the site until published. Claude can only
  // save drafts; publishing is the owner's tap in Telegram. See shared.ts.
  access: publishedRead,
  versions: draftVersions,
  // IndexNow and the social auto-draft both run after a save; the spread
  // alone would let one replace the other.
  hooks: {
    ...indexNow,
    afterChange: [...indexNow.afterChange, autoDraftHook('events')],
    beforeOperation: [mcpDraftsOnly],
  },
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
      name: 'endDate',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description:
          'Only for an event that runs over several days: its last day. Leave empty for a one-day event, including one that runs past midnight (9PM–1AM) — that is worked out from the clock.',
      },
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
      // A listed business already has its address on the listing; a place
      // does not, and without one the structured data says only "Hialeah, FL".
      name: 'placeAddress',
      type: 'text',
      admin: {
        condition: (data) => data?.venueType === 'place',
        description:
          'Full street address as "street, city, ST, zip", e.g. "4410 West 16th Ave., Suite 40, Hialeah, FL, 33012". Only from the announcement or the venue itself.',
      },
    },
    {
      /**
       * Who puts the event on, when that is not the venue: the Club de la
       * Amistad's gala is at a rented hall. Left empty, the venue's listing
       * stands in as the organizer, which is right for a business's own night.
       */
      type: 'row',
      fields: [
        {
          name: 'organizer',
          type: 'relationship',
          relationTo: 'listings',
          admin: { description: 'The listing that organises it, if it is in the directory.' },
        },
        {
          name: 'organizerName',
          type: 'text',
          admin: {
            description: 'Otherwise its name as announced, e.g. "City of Hialeah".',
            condition: (data) => !data?.organizer,
          },
        },
        {
          name: 'organizerUrl',
          type: 'text',
          admin: {
            description: 'Its own website, full URL. Optional.',
            condition: (data) => !data?.organizer,
          },
        },
      ],
    },
    {
      /**
       * The drawn scene behind the social poster, when the venue's name does
       * not say it (lib/eventSetting.ts). Empty lets the site pick; an
       * event's own photo wins over any scene.
       */
      name: 'setting',
      type: 'select',
      options: [
        ...EVENT_SETTINGS.map((value) => ({ label: EVENT_SETTING_LABELS[value], value })),
        { label: 'None: the flat city-colour poster', value: FLAT_SETTING },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Poster scene. Leave empty and the site picks one from the venue (library, park, church…) or the city. Only for an event without its own photo.',
      },
    },
    {
      name: 'eventStatus',
      type: 'select',
      required: true,
      defaultValue: 'scheduled',
      options: [
        { label: 'On', value: 'scheduled' },
        { label: 'Postponed (no new date yet)', value: 'postponed' },
        { label: 'Rescheduled (date changed)', value: 'rescheduled' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Search and answer engines read this. A cancelled event stays up marked cancelled rather than disappearing, so nobody turns up to it.',
      },
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
      /**
       * Which seasonal guide lists the event (/es/halloween, ...). The guide
       * shows every published event with its season that has not finished;
       * lib/seasons.ts holds the guides themselves. Not localized: an event
       * is a Halloween event in both languages.
       */
      name: 'season',
      type: 'select',
      options: SEASON_OPTIONS,
      admin: {
        position: 'sidebar',
        description: 'Which seasonal guide lists it. Leave empty for an ordinary event.',
      },
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
      // The site names no prices anywhere — on the page or in structured data.
      // This label says who gets in, never what it costs.
      validate: noPrice,
      admin: {
        description:
          'Who gets in, not what it costs — e.g. "BY INVITATION", "MEMBERS AND VOLUNTEERS", "ALL AGES". No prices: the site doesn\'t publish them.',
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
