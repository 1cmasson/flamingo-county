import type { TaskConfig } from 'payload'
import { collectReelStats } from '../lib/reelStats'

/**
 * Every 15 minutes, on the same `hq` queue and runner as the other jobs. The
 * hourly Postiz job is too coarse for the 1h checkpoint: its window is an
 * hour long, so an hourly run lands anywhere in it, and one late run misses
 * it. At 15 minutes a 1h reading is taken 60–75 minutes in.
 *
 * Does nothing (not even a network call) until `META_GRAPH_TOKEN` is set —
 * see lib/reelStats.ts.
 */
export const reelStats: TaskConfig<'reelStats'> = {
  slug: 'reelStats',
  schedule: [{ cron: '0 */15 * * * *', queue: 'hq' }],
  handler: async ({ req }) => ({ output: await collectReelStats(req.payload) }),
  outputSchema: [
    { name: 'reels', type: 'number' },
    { name: 'saved', type: 'number' },
  ],
}
