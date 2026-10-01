import { getPayload } from 'payload'
import config from '../../../payload.config'
import { isBot, parseTrackedLink } from '../../../lib/tracking'

/**
 * Count a click on a `/go/...` link, then send the visitor on. See
 * lib/tracking.ts for the link format.
 *
 * Lives outside `[lang]` and is excluded from the proxy's matcher, so it is
 * not redirected to `/es/go/...` first. The visitor's own landing page then
 * goes through the proxy as usual and picks up their language.
 *
 * The Location is relative: behind Railway and Cloudflare the request URL's
 * host and scheme are not reliably the public ones, and a relative redirect
 * keeps the visitor on whichever host they came in on.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params
  const link = parseTrackedLink(slug, new URL(req.url).searchParams.get('to'))
  if (!link) return redirect('/')

  if (!isBot(req.headers.get('user-agent'))) {
    try {
      const payload = await getPayload({ config })
      let draft: number | undefined
      if (link.draftId) {
        // Only link a draft that exists — a mistyped id should still count the click.
        const found = await payload
          .findByID({ collection: 'hq-social-drafts', id: link.draftId, depth: 0, overrideAccess: true })
          .catch(() => null)
        draft = found?.id
      }
      await payload.create({
        collection: 'hq-clicks',
        data: {
          source: link.source,
          draft,
          to: link.location.split('?')[0],
          country: req.headers.get('cf-ipcountry') ?? undefined,
        },
        overrideAccess: true,
      })
    } catch (err) {
      // Never strand a visitor because the count failed.
      console.error('[hq] click not recorded:', err instanceof Error ? err.message : err)
    }
  }
  return redirect(link.location)
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store' } })
}
