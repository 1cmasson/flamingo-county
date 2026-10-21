import type { TaskConfig } from 'payload'
import { sendReviewReminder } from '../lib/reviewReminder'

/**
 * The Monday 8 AM growth review reminder to Telegram (lib/reviewReminder.ts).
 *
 * Scheduled every hour on the hour, and `sendReviewReminder` lets through only
 * Mondays from 8 AM in Miami, for the same reason as the morning brief: croner
 * reads cron in the server's own zone (see src/jobs/morningBrief.ts). The
 * first run that lands sends; every later one that week, retries included,
 * finds the week's `review.reminded` row and stops.
 *
 * Off with `HQ_REVIEW_REMINDER=off`.
 */
export const reviewReminder: TaskConfig<'reviewReminder'> = {
  slug: 'reviewReminder',
  schedule: [{ cron: '0 0 * * * *', queue: 'hq' }],
  retries: 2,
  handler: async ({ req }) => ({ output: { sent: await sendReviewReminder(req.payload) } }),
  outputSchema: [{ name: 'sent', type: 'checkbox' }],
}
