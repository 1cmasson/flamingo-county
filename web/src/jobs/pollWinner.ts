import type { TaskConfig } from 'payload'
import { announcePollWinners } from '../lib/pollWinnerNotice'

/**
 * Tells the owner on Telegram who won a weekly story vote once it closes
 * (lib/pollWinnerNotice.ts). Runs hourly at :05, so a vote closing at noon is
 * announced at 12:05; each poll is announced once, retries included.
 *
 * Off with `HQ_POLL_WINNER=off`.
 */
export const pollWinner: TaskConfig<'pollWinner'> = {
  slug: 'pollWinner',
  schedule: [{ cron: '0 5 * * * *', queue: 'hq' }],
  retries: 2,
  handler: async ({ req }) => ({ output: { announced: await announcePollWinners(req.payload) } }),
  outputSchema: [{ name: 'announced', type: 'number' }],
}
