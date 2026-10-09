import type { TaskConfig } from 'payload'
import { draftWeeklyRoundup, isRoundupTime } from '../lib/weeklyRoundup'

/**
 * The Monday roundup: one social draft for the week's events
 * (lib/weeklyRoundup.ts).
 *
 * Scheduled every hour at :15, and `isRoundupTime` lets through only Mondays
 * from 7 AM in Miami, for the same reason as the morning brief: croner reads
 * cron in the server's own zone (see src/jobs/morningBrief.ts). The first run
 * that lands drafts the week; every later one finds the week's draft and
 * stops, so a run missed during a deploy is made up the next hour.
 */
export const weeklyRoundup: TaskConfig<'weeklyRoundup'> = {
  slug: 'weeklyRoundup',
  schedule: [{ cron: '0 15 * * * *', queue: 'hq' }],
  retries: 2,
  handler: async ({ req }) => {
    if (!isRoundupTime()) return { output: { drafted: false } }
    const draft = await draftWeeklyRoundup(req.payload)
    return { output: { drafted: Boolean(draft) } }
  },
  outputSchema: [{ name: 'drafted', type: 'checkbox' }],
}
