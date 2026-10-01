import type { TaskConfig } from 'payload'
import { collectSocialStats } from '../lib/socialStats'

/**
 * Hourly at :45 — the post checkpoints need hourly resolution, and the daily
 * channel snapshot picks its own hour inside (see lib/socialStats.ts). Runs on
 * the same `hq` queue and runner as the brief.
 */
export const socialStats: TaskConfig<'socialStats'> = {
  slug: 'socialStats',
  schedule: [{ cron: '0 45 * * * *', queue: 'hq' }],
  handler: async ({ req }) => ({ output: await collectSocialStats(req.payload) }),
  outputSchema: [
    { name: 'posts', type: 'number' },
    { name: 'channels', type: 'number' },
  ],
}
