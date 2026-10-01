const METRIC_NAMES = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB'])

type VitalsBody = {
  name?: unknown
  value?: unknown
  rating?: unknown
  path?: unknown
}

/**
 * Real Core Web Vitals from actual visitors, reported by
 * `components/WebVitals.tsx` via `navigator.sendBeacon`. Lighthouse CI only
 * measures one simulated run on two URLs; this is what real devices and
 * networks on every page actually see.
 *
 * Same shape as the AEO traffic log in proxy.ts: one structured stdout line,
 * no DB write, no cookies, no IP. Grep Railway logs for `"rum"` to pull a
 * day's numbers. 100% sampled rather than a fraction of visits — traffic is
 * low enough that log volume isn't a concern yet.
 */
export async function POST(req: Request) {
  let body: VitalsBody
  try {
    body = await req.json()
  } catch {
    return new Response(null, { status: 400 })
  }

  const { name, value, rating, path } = body
  if (typeof name !== 'string' || !METRIC_NAMES.has(name) || typeof value !== 'number') {
    return new Response(null, { status: 400 })
  }

  console.log(
    JSON.stringify({
      rum: name,
      value: Math.round(value * 1000) / 1000,
      rating: typeof rating === 'string' ? rating : undefined,
      path: typeof path === 'string' ? path : undefined,
      t: new Date().toISOString(),
    }),
  )

  return new Response(null, { status: 204 })
}
