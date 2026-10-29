import type { CollectionConfig } from 'payload'
import { humanOnly, staffOnly } from '../fields/shared'

/**
 * Emails Claude wants to send from hola@, and the owner's answer.
 *
 * The rule (owner, 2026-10-24): no email goes out until he has read it and said
 * send. Claude files the whole email here (`hqRequestEmail`); the owner gets
 * every word of it in Telegram — recipients, subject, body, attachments — and
 * taps Send or Don't send. On Send, HQ itself sends exactly what is stored
 * here, through Resend. An email filed with a send time is scheduled by the
 * tap instead, and can be cancelled from Telegram until it goes out. Claude never sends; a local hook
 * (~/.claude/hooks/email-gate.py) blocks the other ways it could.
 * See lib/emailApprovals.ts.
 *
 * Deliberately absent from the MCP plugin's list, so no client can approve or
 * edit its own request after filing. Every field is also `humanOnly`.
 */
export const HqEmailApprovals: CollectionConfig = {
  slug: 'hq-email-approvals',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'to', 'status', 'createdAt'],
    description: 'Emails Claude asked to send from hola@. Each goes out only after you tap Send in Telegram.',
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
        { label: 'Sending', value: 'sending' },
        { label: 'Scheduled (goes out at the send time)', value: 'scheduled' },
        { label: 'Sent', value: 'sent' },
        { label: 'Cancelled before it went out', value: 'cancelled' },
        { label: "Don't send", value: 'declined' },
        { label: 'Failed (nothing went out)', value: 'failed' },
        { label: 'Expired', value: 'expired' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'to', type: 'text', required: true, access: humanOnly, admin: { readOnly: true } },
    { name: 'cc', type: 'text', access: humanOnly, admin: { readOnly: true } },
    { name: 'subject', type: 'text', required: true, access: humanOnly, admin: { readOnly: true } },
    { name: 'body', type: 'textarea', required: true, access: humanOnly, admin: { readOnly: true } },
    // The earlier message a reply quotes underneath, as plain text.
    { name: 'quote', type: 'textarea', access: humanOnly, admin: { readOnly: true } },
    // Message-ID headers that thread a reply under the original in the recipient's inbox.
    { name: 'inReplyTo', type: 'text', access: humanOnly, admin: { readOnly: true } },
    { name: 'references', type: 'text', access: humanOnly, admin: { readOnly: true } },
    {
      name: 'attachments',
      type: 'relationship',
      relationTo: 'hq-media',
      hasMany: true,
      access: humanOnly,
      admin: { readOnly: true },
    },
    { name: 'why', type: 'text', access: humanOnly, admin: { readOnly: true } },
    // When it goes out. Empty means on the tap; set, the tap schedules it and Resend holds it until then.
    { name: 'sendAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'expiresAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'decidedAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'sentAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'resendId', type: 'text', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'error', type: 'text', access: humanOnly, admin: { readOnly: true } },
    { name: 'telegramMessageId', type: 'number', access: humanOnly, admin: { hidden: true } },
  ],
}
