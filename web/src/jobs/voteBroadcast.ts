import type { TaskConfig } from 'payload'
import { offerVoteBroadcasts } from '../lib/voteWhatsapp'

/**
 * Offers the owner, on Telegram, to send "the vote is open" to the WhatsApp
 * subscribers (lib/voteWhatsapp.ts). Runs hourly at :10; each open vote is
 * offered once. Nothing goes to WhatsApp until he taps Send.
 *
 * Off with `HQ_VOTE_BROADCAST=off`.
 */
export const voteBroadcast: TaskConfig<'voteBroadcast'> = {
  slug: 'voteBroadcast',
  schedule: [{ cron: '0 10 * * * *', queue: 'hq' }],
  retries: 2,
  handler: async ({ req }) => ({ output: { offered: await offerVoteBroadcasts(req.payload) } }),
  outputSchema: [{ name: 'offered', type: 'number' }],
}
