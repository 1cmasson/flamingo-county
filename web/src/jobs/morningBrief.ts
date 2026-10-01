import type { TaskConfig } from 'payload'
import { isBriefHour, sendBrief } from '../lib/brief'

/**
 * The 7:30 AM brief to Telegram.
 *
 * Scheduled every hour at :30, and `isBriefHour` lets through only the run
 * that lands at 7 in Miami. The jobs queue has no timezone option — croner
 * reads cron in the *server's* local zone, UTC on Railway and Eastern on a dev
 * Mac — so any fixed hour here would mean a different time on each machine and
 * drift an hour at every daylight-saving change. The other 23 runs a day return
 * immediately, and completed jobs are deleted (`deleteJobOnComplete` defaults
 * to true), so they leave nothing behind.
 *
 * The schedule only *queues* the job; `jobs.autoRun` in payload.config runs it,
 * and autoRun only starts once something calls `getPayload({ cron: true })` —
 * which is what src/instrumentation.ts does at boot.
 */
export const morningBrief: TaskConfig<'morningBrief'> = {
  slug: 'morningBrief',
  schedule: [{ cron: '0 30 * * * *', queue: 'hq' }],
  retries: 2,
  handler: async ({ req }) => {
    if (!isBriefHour()) return { output: { sent: false } }
    const sent = await sendBrief(req.payload)
    return { output: { sent } }
  },
  outputSchema: [{ name: 'sent', type: 'checkbox' }],
}
