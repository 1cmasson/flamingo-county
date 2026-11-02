import type { CollectionConfig } from 'payload'
import { indexNowHooks } from '../lib/indexnow'
import { draftVersions, mcpDraftsOnly, noPrice, publishedRead, slugField } from '../fields/shared'

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * A neighbors' vote: "the best croquetas in Hialeah, according to Hialeah".
 * Neighbors nominate on the page itself (lib/rankingNominations.ts); the most-named places go
 * in `entrants`, best first, and a bracket of 8 (or 4) is voted on the site
 * round by round. See lib/rankings.ts.
 *
 * Content like any other: drafts, and live only after the owner's Publish tap.
 * The order comes from votes only. A partner never gets a better seed.
 */
export const Rankings: CollectionConfig = {
  slug: 'rankings',
  access: publishedRead,
  versions: draftVersions,
  hooks: { beforeOperation: [mcpDraftsOnly], ...indexNowHooks('rankings') },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'city', '_status', 'updatedAt'],
    group: 'Content',
    description: 'Neighbors’ votes (best croquetas in Hialeah…). The page is /es/rankings/<slug>. The order comes from votes only.',
  },
  fields: [
    slugField,
    { name: 'city', type: 'relationship', relationTo: 'cities', required: true, index: true },
    {
      name: 'title',
      type: 'text',
      localized: true,
      required: true,
      admin: { description: 'What people search for, e.g. "Las mejores croquetas de Hialeah".' },
    },
    {
      name: 'question',
      type: 'text',
      localized: true,
      required: true,
      admin: { description: 'The question we asked, e.g. "¿Dónde hacen las croquetas más ricas de Hialeah?"' },
    },
    { name: 'intro', type: 'textarea', localized: true, validate: noPrice },
    {
      name: 'nominatePostUrl',
      type: 'text',
      admin: { description: 'Optional: a post where people can also nominate in the comments. Shown under the page’s own nomination form.' },
    },
    {
      name: 'nominationsCloseOn',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' }, description: 'Shown while nominating.' },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Our own artwork for the page and its link preview.' },
    },
    {
      name: 'entrants',
      type: 'array',
      admin: {
        description:
          'The most-nominated places, MOST NOMINATED FIRST: the order is the seeding. 8 (or 4) make the bracket; never reorder once voting opens.',
      },
      validate: (rows: unknown) => {
        if (!Array.isArray(rows)) return true
        const keys = rows.map((r) => (r as { key?: string }).key)
        return new Set(keys).size === keys.length || 'Each place needs its own key.'
      },
      fields: [
        {
          name: 'key',
          type: 'text',
          required: true,
          validate: (v: unknown) => (typeof v === 'string' && KEY.test(v)) || 'lowercase-with-dashes, e.g. molinas',
          admin: { description: 'Votes are stored under this. Never change it once voting opens.' },
        },
        { name: 'name', type: 'text', required: true },
        {
          name: 'listing',
          type: 'relationship',
          relationTo: 'listings',
          admin: { description: 'If the place is in our directory. Its page, coupon and nearby bus stops link from here.' },
        },
        { name: 'area', type: 'text', admin: { description: 'Where, as people say it: "W 49th St & Palm Ave".' } },
        {
          name: 'sourceUrl',
          type: 'text',
          admin: { description: 'For a place not in our directory: its own site or Google Maps page, so every fact has a source.' },
        },
        { name: 'nominations', type: 'number', min: 0, admin: { description: 'Times named (the page’s nominations, plus any from a post’s comments).' } },
        { name: 'note', type: 'textarea', localized: true, validate: noPrice, admin: { description: 'One sourced line: what to order, since when.' } },
      ],
    },
    {
      name: 'rounds',
      type: 'array',
      admin: {
        description: 'When each round is open (Miami time). 8 places: qf, sf, final. 4 places: sf, final. Rounds must not overlap.',
      },
      validate: (rows: unknown) => {
        if (!Array.isArray(rows)) return true
        const r = rows as { stage?: string; opensAt?: string; closesAt?: string }[]
        const stages = r.map((x) => x.stage)
        if (new Set(stages).size !== stages.length) return 'One row per round.'
        const order = ['qf', 'sf', 'final']
        const sorted = [...r].sort((a, b) => order.indexOf(a.stage ?? '') - order.indexOf(b.stage ?? ''))
        for (let i = 0; i < sorted.length; i++) {
          const open = new Date(sorted[i].opensAt ?? '').getTime()
          const close = new Date(sorted[i].closesAt ?? '').getTime()
          if (!(open < close)) return `${sorted[i].stage}: it must close after it opens.`
          const nextOpen = sorted[i + 1] ? new Date(sorted[i + 1].opensAt ?? '').getTime() : Infinity
          if (close > nextOpen) return `${sorted[i].stage} must close before ${sorted[i + 1].stage} opens.`
        }
        return true
      },
      fields: [
        {
          name: 'stage',
          type: 'select',
          required: true,
          options: [
            { label: 'Quarterfinal (8 → 4)', value: 'qf' },
            { label: 'Semifinal (4 → 2)', value: 'sf' },
            { label: 'Final', value: 'final' },
          ],
        },
        { name: 'opensAt', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'closesAt', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
  ],
}
