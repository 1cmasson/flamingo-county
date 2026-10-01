import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * One row per human click on a `/go/...` tracking link (src/app/go). Instagram
 * and TikTok captions cannot carry links, so most social traffic arrives
 * through the bio link — and without these rows it would arrive looking like
 * direct traffic.
 *
 * Deliberately thin: no IP, no user agent, no cookie. Source, the draft when
 * the link names one, where the visitor was sent, and Cloudflare's country
 * code are enough to count clicks per post and per platform.
 */
export const HqClicks: CollectionConfig = {
  slug: 'hq-clicks',
  access: staffOnly,
  admin: {
    group: 'HQ',
    defaultColumns: ['source', 'draft', 'to', 'country', 'createdAt'],
    description: 'Clicks on /go/ tracking links. Bots and link previews are not counted.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'source', type: 'text', required: true, index: true },
    { name: 'draft', type: 'relationship', relationTo: 'hq-social-drafts' },
    { name: 'to', type: 'text' },
    { name: 'country', type: 'text' },
  ],
}
