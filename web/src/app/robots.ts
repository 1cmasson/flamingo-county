import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/site'

/**
 * Open to every crawler, AI search and training bots included — visibility in
 * answer engines is the point of the site. To opt out of training only, add
 * `{ userAgent: ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot'], disallow: '/' }`
 * and leave the search agents (OAI-SearchBot, ChatGPT-User, PerplexityBot,
 * Claude-SearchBot, Claude-User) allowed: blocking those removes the site from
 * that engine's answers.
 *
 * Only pages with nothing to index are closed: admin, API, the signed-in My
 * Week page, a visitor's own coupon and a partner's dashboard (lib/promos.ts;
 * both pages also say noindex). Two parts of /api/ stay open, because the
 * longer rule wins: /api/og/, the event cards that are the og:image of events
 * with no photo (a crawler that honours robots, as X's does, would otherwise
 * show the link with no picture), and /api/media/, where every uploaded photo
 * is served. Closing that one kept every story and listing picture out of
 * Google Images and Discover, which needs a large image to show a page at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/api/og/', '/api/media/'],
        disallow: ['/admin', '/api/', '/en/my-week', '/es/my-week', '/en/partner/', '/es/partner/', '/en/promo/*/c/', '/es/promo/*/c/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
