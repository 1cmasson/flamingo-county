import type { TaskConfig } from 'payload'
import { addMissingCards } from '../lib/autoDraft'
import { collectSocialStats } from '../lib/socialStats'

/**
 * Hourly at :45 — the post checkpoints need hourly resolution, and the daily
 * channel snapshot picks its own hour inside (see lib/socialStats.ts). Runs on
 * the same `hq` queue and runner as the brief.
 *
 * It also gives event drafts that have no picture their generated card
 * (`addMissingCards`), first and on its own: a failure there must not cost the
 * stats checkpoint.
 */
export const socialStats: TaskConfig<'socialStats'> = {
  slug: 'socialStats',
  schedule: [{ cron: '0 45 * * * *', queue: 'hq' }],
  handler: async ({ req }) => {
    await addMissingCards(req.payload).catch((err) =>
      console.error('[hq] missing cards failed:', err instanceof Error ? err.message : err),
    )
    return { output: await collectSocialStats(req.payload) }
  },
  outputSchema: [
    { name: 'posts', type: 'number' },
    { name: 'channels', type: 'number' },
  ],
}
