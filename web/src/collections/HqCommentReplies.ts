import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * One row per keyword comment a campaign (`hq-comment-campaigns`) caught, and
 * what became of its DM. Written only by the `commentDm` job and the owner's
 * "No DM" button (lib/commentDm.ts); read-only over MCP.
 *
 * Unlike `hq-social-comments`, which keeps no usernames, these rows keep the
 * commenter's handle and Instagram-scoped id: the owner's alert names who
 * commented, a manual fallback needs someone to message, and "one DM per
 * person" needs to know who a person is. They are people who asked us to
 * message them, so a row is also the start of a lead (handle, language,
 * campaign, when) if HQ grows a leads list later.
 *
 * Status:
 * - pending: a DM is due at `scheduledAt` (a random 5–12 minutes after it was seen).
 * - sending: claimed by a run, the request to Meta is out. Never retried.
 * - sent: Meta accepted the private reply (`messageId`).
 * - manual: HQ could not send it (no permission, Meta refused, or unsure it
 *   went), so the owner got the text to paste. `error` says why.
 * - failed: not sent and the owner could not be told either.
 * - skipped: no DM: the same person commented before, the owner tapped
 *   "No DM", or the comment was past Instagram's 7 days. `skipReason` says.
 */
export const HqCommentReplies: CollectionConfig = {
  slug: 'hq-comment-replies',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'username',
    defaultColumns: ['username', 'status', 'language', 'scheduledAt', 'commentText'],
    description: 'Keyword comments and the DM each got (or why not). Written by HQ.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Waiting to send', value: 'pending' },
        { label: 'Sending', value: 'sending' },
        { label: 'Sent', value: 'sent' },
        { label: 'Manual (sent to you to paste)', value: 'manual' },
        { label: 'Failed', value: 'failed' },
        { label: 'Skipped', value: 'skipped' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'campaign', type: 'relationship', relationTo: 'hq-comment-campaigns', required: true, index: true },
    { name: 'commentId', type: 'text', required: true, unique: true, index: true },
    {
      // `<campaign>:<commenter>` on the first comment of each person, so the
      // database itself holds "one DM per person per campaign". A row that is
      // no one's DM (a repeat, a comment past 7 days) has `skip:<comment id>`
      // instead: Payload's unique check would count two empty ones as equal.
      name: 'dedupeKey',
      type: 'text',
      unique: true,
      admin: { hidden: true },
    },
    {
      type: 'row',
      fields: [
        { name: 'username', type: 'text', admin: { description: 'Instagram handle, without @.' } },
        { name: 'igUserId', type: 'text', index: true, admin: { description: 'Instagram-scoped id of the commenter.' } },
        {
          name: 'language',
          type: 'select',
          options: [
            { label: 'Español', value: 'es' },
            { label: 'English', value: 'en' },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'mediaId', type: 'text', index: true },
        { name: 'permalink', type: 'text' },
      ],
    },
    { name: 'commentText', type: 'textarea' },
    { name: 'dmText', type: 'textarea', admin: { description: 'Exactly what is (or was) sent.' } },
    {
      type: 'row',
      fields: [
        { name: 'commentedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'scheduledAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
        {
          name: 'handledAt',
          type: 'date',
          index: true,
          admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'When it was sent, or handed to you.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'messageId', type: 'text', admin: { readOnly: true, description: 'Meta’s id for the DM.' } },
        { name: 'recipientId', type: 'text', admin: { readOnly: true } },
      ],
    },
    { name: 'skipReason', type: 'text' },
    { name: 'error', type: 'text' },
    { name: 'errorCode', type: 'text', admin: { description: 'Graph code/subcode.' } },
    {
      type: 'row',
      fields: [
        { name: 'alertMessageId', type: 'number', admin: { hidden: true } },
        { name: 'ownerNotified', type: 'checkbox', defaultValue: false, admin: { description: 'A manual DM reached your Telegram.' } },
      ],
    },
  ],
}
