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
 * Only pages with nothing to index are closed: admin, API, and the signed-in
 * My Week page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/', '/en/my-week', '/es/my-week'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
