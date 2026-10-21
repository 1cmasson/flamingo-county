import type { TaskConfig } from 'payload'
import { collectGraphTelemetry } from '../lib/graphTelemetry'

/**
 * Hourly at :20, on the same `hq` queue and runner as the other jobs, off the
 * minutes the reel job (every 15) and the Postiz job (:45) use. Each part
 * decides inside whether it is due — account days once a day, the audience
 * once a week, comments every run, each market account once a day — so an
 * hourly run is cheap when nothing is (see lib/graphTelemetry.ts).
 *
 * Does nothing (not even a network call) until `META_GRAPH_TOKEN` is set.
 */
export const graphTelemetry: TaskConfig<'graphTelemetry'> = {
  slug: 'graphTelemetry',
  schedule: [{ cron: '0 20 * * * *', queue: 'hq' }],
  handler: async ({ req }) => ({ output: await collectGraphTelemetry(req.payload) }),
  outputSchema: [
    { name: 'accountDays', type: 'number' },
    { name: 'audience', type: 'number' },
    { name: 'comments', type: 'number' },
    { name: 'marketAccounts', type: 'number' },
    { name: 'marketPosts', type: 'number' },
  ],
}
