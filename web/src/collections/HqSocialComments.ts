import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * Comments people leave on our own Instagram reels, read from Meta's Graph API
 * by the `graphTelemetry` job (lib/graphTelemetry.ts), so a later job can tag
 * the answers to "Which Miami story should we tell next?" and HQ can draft
 * replies. Needs `instagram_manage_comments` on META_GRAPH_TOKEN; without it
 * nothing is read and one `graph.scope_missing` event says so.
 *
 * Privacy: no username, no profile, no picture. A reply is posted to the
 * comment's id, so the commenter's handle is not needed to answer, and it is
 * left out. `fromUs` marks comments the @flamingo.county account wrote itself
 * (Graph's username is compared in memory and thrown away). Comment text is
 * public on the reel; it is kept as written, clipped at 2,200 characters
 * (Instagram's own limit).
 */
export const HqSocialComments: CollectionConfig = {
  slug: 'hq-social-comments',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'text',
    defaultColumns: ['text', 'mediaId', 'commentedAt', 'likeCount'],
    description: 'Comments on our own Instagram reels, from Meta’s Graph API. No usernames are kept.',
  },
  defaultSort: '-commentedAt',
  fields: [
    { name: 'commentId', type: 'text', required: true, unique: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'platform', type: 'select', defaultValue: 'instagram', options: [{ label: 'instagram', value: 'instagram' }] },
        { name: 'mediaId', type: 'text', required: true, index: true },
        { name: 'commentedAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    { name: 'permalink', type: 'text', admin: { description: 'The reel’s link.' } },
    { name: 'mediaCaption', type: 'text', admin: { description: 'The reel’s caption, clipped.' } },
    { name: 'text', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'likeCount', type: 'number' },
        { name: 'fromUs', type: 'checkbox', defaultValue: false, admin: { description: 'Written by @flamingo.county itself.' } },
      ],
    },
    {
      name: 'tags',
      type: 'json',
      admin: { description: 'For a later job: e.g. the story a "which story next" answer asks for.' },
    },
  ],
}
