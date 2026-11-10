import { getPayload } from 'payload'
import config from '../../../../payload.config'
import { isLang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { currentPollSlug } from '../../../../lib/storyPolls'

/**
 * /es/vota: the link in the reel's comment-to-DM, the same every week. It
 * forwards to the poll open now (else the last one, with its winner; else
 * the next), with the query kept so `utm_source` still names where the vote
 * came from. A temporary redirect, never cached: the target changes weekly.
 * With no poll published at all, the stories page. See lib/storyPolls.ts.
 *
 * A route handler, not a page: a page's redirect() can arrive as a meta tag
 * once the layout has started streaming, and this should be a plain 307.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLang(lang)) return new Response('Not found', { status: 404 })
  const payload = await getPayload({ config })
  const slug = await currentPollSlug(payload)
  const url = new URL(req.url)
  const to = new URL(slug ? routes.storyPoll(lang, slug) : routes.stories(lang), url)
  to.search = url.search
  return new Response(null, { status: 307, headers: { Location: to.pathname + to.search, 'Cache-Control': 'no-store' } })
}
