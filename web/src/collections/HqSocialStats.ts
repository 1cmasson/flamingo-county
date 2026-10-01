import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'
import { PLATFORMS } from '../lib/postiz'

/**
 * Snapshots of what Postiz reports, kept because Postiz does not keep them:
 * it fetches analytics live from each platform, so last month's numbers are
 * gone unless something saved them.
 *
 * Two kinds of row, written by the `socialStats` job (src/jobs):
 * - `post`: one published post at a checkpoint — 24h, 3d and 7d after it went
 *   out — which is what lets posts be compared like with like.
 * - `channel`: a whole account's last seven days, once a day.
 *
 * `metrics` is `{ label: { latest, sum, change } }` — see `summarizeMetrics` —
 * and `raw` is Postiz's reply as received, in case a summary turns out wrong.
 */
export const HqSocialStats: CollectionConfig = {
  slug: 'hq-social-stats',
  access: staffOnly,
  admin: {
    group: 'HQ',
    defaultColumns: ['kind', 'platform', 'draft', 'checkpoint', 'createdAt'],
    description: 'Post and account numbers from Postiz, saved by the hourly stats job.',
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
            { label: '24 hours', value: '24h' },
            { label: '3 days', value: '3d' },
            { label: '7 days', value: '7d' },
          ],
        },
      ],
    },
    { name: 'draft', type: 'relationship', relationTo: 'hq-social-drafts', index: true },
    { name: 'postizPostId', type: 'text' },
    { name: 'metrics', type: 'json', required: true },
    { name: 'raw', type: 'json' },
  ],
}
