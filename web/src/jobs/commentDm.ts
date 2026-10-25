import type { TaskConfig } from 'payload'
import { runCommentDm } from '../lib/commentDm'

/**
 * Every 2 minutes, on the same `hq` queue and runner as the other jobs: reads
 * the comments of the active comment-DM campaigns, alerts the owner about new
 * keyword comments and sends the DMs that are due (lib/commentDm.ts).
 *
 * Polling, not a webhook: no public endpoint to verify and no Meta webhook
 * subscription to keep alive. At two minutes and a few posts that is well
 * inside Graph's limits, and a DM is due 5–12 minutes after the comment
 * anyway.
 *
 * Does nothing (not even a network call) until a campaign is switched on in
 * the admin and META_GRAPH_TOKEN is set.
 */
export const commentDm: TaskConfig<'commentDm'> = {
  slug: 'commentDm',
  schedule: [{ cron: '0 */2 * * * *', queue: 'hq' }],
  handler: async ({ req }) => ({ output: await runCommentDm(req.payload) }),
  outputSchema: [
    { name: 'campaigns', type: 'number' },
    { name: 'posts', type: 'number' },
    { name: 'matched', type: 'number' },
    { name: 'sent', type: 'number' },
    { name: 'manual', type: 'number' },
    { name: 'skipped', type: 'number' },
  ],
}
