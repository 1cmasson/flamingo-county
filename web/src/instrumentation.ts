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
  // CI's test container only (.github/workflows/lighthouse.yml). The runner
  // writes to the database every minute, and SQLite gives a second process no
  // wait: CI's `pnpm seed`, running beside the server, failed "database is
  // locked" on the minute. Production never sets this.
  if (process.env.HQ_JOBS === 'off') return
  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('./payload.config')
    await getPayload({ config, cron: true })
  } catch (err) {
    console.error('[hq] could not start the jobs runner:', err)
  }
}
