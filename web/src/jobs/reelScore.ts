import type { TaskConfig } from 'payload'
import { scoreReels } from '../lib/reelScore'

/**
 * Hourly at :55, on the same `hq` queue and runner as the other jobs: scores
 * every reel whose 3d (72-hour) reading has come in and writes its
 * post-mortem to `hq-reel-reviews` — see lib/reelScore.ts. The 3d reading
 * itself lands within 15 minutes of hour 72 (the `reelStats` job), and a
 * story waits for both its cuts, so an hour's resolution loses nothing.
 *
 * Reads saved rows only: no network, no post, no Telegram. With no reel rows
 * (no META_GRAPH_TOKEN yet) it finds nothing and writes nothing.
 */
export const reelScore: TaskConfig<'reelScore'> = {
  slug: 'reelScore',
  schedule: [{ cron: '0 55 * * * *', queue: 'hq' }],
  handler: async ({ req }) => ({ output: await scoreReels(req.payload) }),
  outputSchema: [
    { name: 'reviewed', type: 'number' },
    { name: 'experiments', type: 'number' },
  ],
}
