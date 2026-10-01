/**
 * Runs once when the Next server starts. Its one job: start Payload's cron
 * runner, which `jobs.autoRun` in payload.config needs and which Payload only
 * starts for `getPayload({ cron: true })`. See src/jobs/morningBrief.ts.
 *
 * Node runtime only — Payload cannot load on the edge. A failure is logged, not
 * thrown: a broken brief must not stop the site from serving.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('./payload.config')
    await getPayload({ config, cron: true })
  } catch (err) {
    console.error('[hq] could not start the jobs runner:', err)
  }
}
