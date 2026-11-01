import type { CollectionConfig } from 'payload'
import { humanOnly, notFromMcp, staffOnly } from '../fields/shared'

/** Logged in, and not over MCP. */
const staffNotMcp = ({ req }: { req: { user?: unknown; payloadAPI?: string } }) => Boolean(req.user) && notFromMcp({ req })

/**
 * A set of social drafts the owner approves with one tap.
 *
 * Claude files the batch (`hqRequestSocialBatch`) once each draft's own
 * preview has gone out; the owner gets one Telegram message listing them with
 * Approve all / Reject all. Approve all runs each draft through the same
 * Approve as its own button, against the version the batch listed. See
 * lib/socialBatches.ts.
 *
 * Deliberately absent from the MCP plugin's list, so no client can read or
 * edit it through the generic tools — including marking its own batch
 * approved. Writes over MCP are refused outright, and every field is also
 * `humanOnly`, in case it is ever added.
 */
export const HqSocialBatches: CollectionConfig = {
  slug: 'hq-social-batches',
  access: { ...staffOnly, create: staffNotMcp, update: staffNotMcp },
  admin: {
    group: 'HQ',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'createdAt'],
    description: 'Social drafts Claude asked you to approve together. Each goes out only when you tap Approve all in Telegram.',
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
        { label: 'Scheduling', value: 'approving' },
        { label: 'Approved', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Expired', value: 'expired' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'title', type: 'text', access: humanOnly, admin: { readOnly: true } },
    { name: 'note', type: 'textarea', access: humanOnly, admin: { readOnly: true } },
    {
      // Each draft as it was listed. Approve all posts a draft only while it
      // still matches `hash`; one edited since is left for its own preview.
      name: 'items',
      type: 'array',
      access: humanOnly,
      admin: { readOnly: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'draft', type: 'number', required: true },
            { name: 'hash', type: 'text', required: true },
          ],
        },
        { name: 'outcome', type: 'text' },
      ],
    },
    { name: 'expiresAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'telegramMessageId', type: 'number', access: humanOnly, admin: { hidden: true } },
    { name: 'error', type: 'text', access: humanOnly, admin: { readOnly: true } },
  ],
}
