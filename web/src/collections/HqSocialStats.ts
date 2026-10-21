import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'
import { PLATFORMS } from '../lib/postiz'

/**
 * Snapshots of what Postiz and Meta report, kept because neither keeps them:
 * Postiz fetches analytics live from each platform, and Graph insights are
 * lifetime totals with no history, so last month's numbers are gone unless
 * something saved them.
 *
 * Three kinds of row:
 * - `post` (`source: 'postiz'`, the `socialStats` job): one published post at
 *   a checkpoint — 24h, 3d and 7d after it went out — which is what lets
 *   posts be compared like with like.
 * - `channel` (`source: 'postiz'`, same job): a whole account's last seven
 *   days, once a day.
 * - `reel` (`source: 'graph'`, the `reelStats` job, lib/reelStats.ts): one
 *   Instagram or Facebook reel at 1h, 3h, 24h, 3d or 7d, read from Meta's
 *   Graph API — every reel on the account, with `draft` set only when a draft
 *   matched it by time. `ageMinutes` is the reel's real age at the reading.
 *
 * For `post` and `channel`, `metrics` is `{ label: { latest, sum, change } }`
 * — see `summarizeMetrics`. For `reel` it is `{ metricName: number }` in
 * Meta's own names (watch times in milliseconds). `raw` is the reply as
 * received, in case a summary turns out wrong.
 */
export const HqSocialStats: CollectionConfig = {
  slug: 'hq-social-stats',
  access: staffOnly,
  admin: {
    group: 'HQ',
    defaultColumns: ['kind', 'platform', 'draft', 'checkpoint', 'ageMinutes', 'createdAt'],
    description: 'Post and account numbers from Postiz, and reel numbers from Meta’s Graph API, saved by the stats jobs.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          type: 'select',
          required: true,
          index: true,
          options: [
            { label: 'Post', value: 'post' },
            { label: 'Channel', value: 'channel' },
            { label: 'Reel (Graph)', value: 'reel' },
          ],
        },
        {
          name: 'source',
          type: 'select',
          defaultValue: 'postiz',
          index: true,
          options: [
            { label: 'Postiz', value: 'postiz' },
            { label: 'Meta Graph API', value: 'graph' },
          ],
        },
        {
          name: 'platform',
          type: 'select',
          required: true,
          options: PLATFORMS.map((p) => ({ label: p, value: p })),
        },
        {
          name: 'checkpoint',
          type: 'select',
          options: [
            { label: '1 hour', value: '1h' },
            { label: '3 hours', value: '3h' },
            { label: '24 hours', value: '24h' },
            { label: '3 days', value: '3d' },
            { label: '7 days', value: '7d' },
          ],
        },
      ],
    },
    { name: 'draft', type: 'relationship', relationTo: 'hq-social-drafts', index: true },
    { name: 'postizPostId', type: 'text' },
    {
      type: 'row',
      fields: [
        {
          name: 'ageMinutes',
          type: 'number',
          admin: { description: 'Graph rows: how old the reel really was when this was read.' },
        },
        {
          name: 'mediaId',
          type: 'text',
          index: true,
          admin: { description: 'Graph rows: the Instagram media id or Facebook video id.' },
        },
        { name: 'mediaPublishedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    { name: 'permalink', type: 'text' },
    { name: 'caption', type: 'text', admin: { description: 'Graph rows: the reel’s caption, clipped.' } },
    {
      name: 'durationSec',
      type: 'number',
      admin: { description: 'Graph rows: the reel’s length in seconds, when Meta gives it (Facebook only).' },
    },
    { name: 'metrics', type: 'json', required: true },
    {
      name: 'retention',
      type: 'json',
      admin: { description: 'Graph rows (Facebook): the retention curve as received — share of plays still watching at each segment.' },
    },
    {
      name: 'failedMetrics',
      type: 'json',
      admin: { description: 'Graph rows: metric names Meta refused for this reading.' },
    },
    { name: 'raw', type: 'json' },
  ],
}
