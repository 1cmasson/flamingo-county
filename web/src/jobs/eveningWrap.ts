import type { TaskConfig } from 'payload'
import { isWrapHour, sendWrap } from '../lib/wrap'

/**
 * The 8 PM wrap-up to Telegram.
 *
 * Scheduled every hour on the hour, and `isWrapHour` lets through only the run
 * that lands at 20:00 in Miami, for the same reason as the morning brief: croner
 * reads cron in the server's own zone (UTC on Railway, Eastern on a dev Mac), so
 * a fixed hour would differ by machine and drift at every daylight-saving change.
 * See src/jobs/morningBrief.ts.
 */
export const eveningWrap: TaskConfig<'eveningWrap'> = {
  slug: 'eveningWrap',
  schedule: [{ cron: '0 0 * * * *', queue: 'hq' }],
  retries: 2,
  handler: async ({ req }) => {
    if (!isWrapHour()) return { output: { sent: false } }
    const sent = await sendWrap(req.payload)
    return { output: { sent } }
  },
  outputSchema: [{ name: 'sent', type: 'checkbox' }],
}
