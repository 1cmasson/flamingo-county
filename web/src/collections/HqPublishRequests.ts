import type { CollectionConfig } from 'payload'
import { humanOnly, staffOnly } from '../fields/shared'

/**
 * Requests to publish a draft of the site's content, and what came of them.
 *
 * The rule: drafts are free, going live is not. Claude saves drafts of
 * events, weekly events, stories, spotlights and listings over MCP as it
 * likes — none of it is visible. To publish, it files a request
 * (`hqRequestPublish`); the owner sees the exact change in Telegram and taps
 * Publish or Reject. See lib/publishRequests.ts.
 *
 * Deliberately absent from the MCP plugin's list, so no client can read or
 * edit it through the generic tools — including marking its own request
 * approved. Every field is also `humanOnly` in case it is ever added.
 */
export const HqPublishRequests: CollectionConfig = {
  slug: 'hq-publish-requests',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'createdAt'],
    description: 'Drafts Claude asked to publish. Each goes live only when you tap Publish in Telegram.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      access: humanOnly,
      options: [
        { label: 'Waiting for you', value: 'pending' },
        { label: 'Published', value: 'published' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Replaced by a newer request', value: 'superseded' },
        { label: 'Draft changed — re-sent', value: 'stale' },
        { label: 'Expired', value: 'expired' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'title', type: 'text', access: humanOnly, admin: { readOnly: true } },
    {
      type: 'row',
      fields: [
        { name: 'collection', type: 'text', required: true, access: humanOnly, admin: { readOnly: true } },
        { name: 'targetId', type: 'text', required: true, index: true, access: humanOnly, admin: { readOnly: true } },
      ],
    },
    {
      // The draft that was shown. Publish refuses if the draft has moved on.
      name: 'draftStamp',
      type: 'text',
      access: humanOnly,
      admin: { hidden: true },
    },
    { name: 'reason', type: 'textarea', access: humanOnly, admin: { readOnly: true } },
    { name: 'preview', type: 'textarea', access: humanOnly, admin: { readOnly: true } },
    { name: 'expiresAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'telegramMessageId', type: 'number', access: humanOnly, admin: { hidden: true } },
    { name: 'error', type: 'text', access: humanOnly, admin: { readOnly: true } },
  ],
}
