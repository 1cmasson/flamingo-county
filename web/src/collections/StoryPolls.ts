import type { CollectionConfig } from 'payload'
import { draftVersions, mcpDraftsOnly, noPrice, publishedRead, slugField } from '../fields/shared'

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The weekly story vote: four Miami stories, the fans pick one, and the
 * winner is next Wednesday's reel. The page is /es/vota/<slug>, and /es/vota
 * always sends to the poll that is open now, so the link in the reel's
 * comment-to-DM never changes. See lib/storyPolls.ts.
 *
 * Content like any other: drafts, and live only after the owner's Publish tap.
 */
export const StoryPolls: CollectionConfig = {
  slug: 'story-polls',
  access: publishedRead,
  versions: draftVersions,
  hooks: { beforeOperation: [mcpDraftsOnly] },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'opensAt', 'closesAt', '_status', 'updatedAt'],
    group: 'Content',
    description: 'The weekly story vote. The page is /es/vota/<slug>; /es/vota always goes to the poll open now. The winner is the most votes (site + counted comments).',
  },
  fields: [
    slugField,
    {
      name: 'title',
      type: 'text',
      localized: true,
      required: true,
      validate: noPrice,
      admin: { description: 'The page’s headline, e.g. "Tú escoges la historia del miércoles".' },
    },
    {
      name: 'question',
      type: 'text',
      localized: true,
      required: true,
      validate: noPrice,
      admin: { description: 'The question, e.g. "¿Qué historia de Miami contamos esta semana?"' },
    },
    { name: 'intro', type: 'textarea', localized: true, validate: noPrice },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Optional: the link preview (a DM or a share). Without it, the first option’s image is used.' },
    },
    {
      name: 'opensAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Voting opens (Miami time).' },
    },
    {
      name: 'closesAt',
      type: 'date',
      required: true,
      validate: (value: unknown, { siblingData }: { siblingData?: { opensAt?: string } }) => {
        if (!value) return 'When voting closes.'
        const open = new Date(siblingData?.opensAt ?? '').getTime()
        return !(open < new Date(value as string).getTime()) ? 'It must close after it opens.' : true
      },
      admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Voting closes (Miami time); the page then shows the winner.' },
    },
    {
      name: 'winnerPostsOn',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: 'Optional: the day the winning story is posted (a Wednesday). Shown on the page.',
      },
    },
    {
      name: 'igPostUrl',
      type: 'text',
      validate: (v: unknown) => !v || (typeof v === 'string' && /^https:\/\/\S+$/.test(v)) || 'A full https:// link.',
      admin: { description: 'Optional: the Instagram reel where people also vote in the comments.' },
    },
    {
      name: 'options',
      type: 'array',
      minRows: 2,
      maxRows: 6,
      admin: {
        description: 'The stories to pick from, in the order shown (usually 4). A tie goes to the one listed first. Never change a key once voting opens.',
      },
      validate: (rows: unknown) => {
        if (!Array.isArray(rows)) return true
        const keys = rows.map((r) => (r as { key?: string }).key)
        return new Set(keys).size === keys.length || 'Each story needs its own key.'
      },
      fields: [
        {
          name: 'key',
          type: 'text',
          required: true,
          validate: (v: unknown) => (typeof v === 'string' && KEY.test(v)) || 'lowercase-with-dashes, e.g. jack-tigertail',
          admin: { description: 'Votes are stored under this. Never change it once voting opens.' },
        },
        { name: 'title', type: 'text', localized: true, required: true, validate: noPrice },
        {
          name: 'teaser',
          type: 'textarea',
          localized: true,
          validate: noPrice,
          admin: { description: 'One or two sourced lines that make you want to hear it. Don’t give the ending away.' },
        },
        { name: 'image', type: 'upload', relationTo: 'media', admin: { description: 'Our own artwork for this story.' } },
        {
          name: 'story',
          type: 'relationship',
          relationTo: 'stories',
          admin: { description: 'Once the winner is published: its story page, linked from the results.' },
        },
        {
          name: 'commentVotes',
          type: 'number',
          min: 0,
          validate: (v: unknown) => v === null || v === undefined || (Number.isInteger(v) && (v as number) >= 0) || 'A whole number.',
          admin: { description: 'Votes counted by hand from the Instagram comments ("1", "2"…). Added to the site’s votes.' },
        },
      ],
    },
  ],
}
