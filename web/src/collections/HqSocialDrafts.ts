import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'
import { HQ_INTERNAL, recordEvent, sendDraftPreview } from '../lib/hq'
import { NEEDS_MEDIA, PLATFORMS } from '../lib/postiz'
import type { HqSocialDraft } from '../payload-types'

/**
 * A social post waiting for the owner's yes.
 *
 * Created here in the admin or by Claude. On create — and whenever it is set
 * back to Pending — the draft is sent to Telegram with its cover file and
 * Approve / Reject buttons. Approve uploads the files to Postiz and schedules
 * the post; nothing reaches a social account without that tap.
 */
export const HqSocialDrafts: CollectionConfig = {
  slug: 'hq-social-drafts',
  access: staffOnly,
  admin: {
    useAsTitle: 'caption',
    defaultColumns: ['caption', 'platforms', 'scheduledFor', 'status'],
    group: 'HQ',
    description:
      'Posts waiting for approval in Telegram. Set a failed or rejected draft back to Pending to send it again.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      required: true,
      index: true,
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'scheduledFor',
      type: 'date',
      required: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'A time in the past posts as soon as it is approved.',
      },
    },
    {
      name: 'platforms',
      type: 'select',
      hasMany: true,
      required: true,
      options: PLATFORMS.map((p) => ({ label: p[0].toUpperCase() + p.slice(1), value: p })),
    },
    {
      name: 'caption',
      type: 'textarea',
      required: true,
      // TikTok's 2000 is the tightest of the three (Instagram 2200, Facebook 63k).
      maxLength: 2000,
    },
    {
      name: 'media',
      type: 'relationship',
      relationTo: 'hq-media',
      hasMany: true,
      admin: { description: 'The first file is the cover shown in Telegram.' },
      validate: (value: unknown, { siblingData }: { siblingData: Partial<HqSocialDraft> }) => {
        const needs = (siblingData.platforms ?? []).filter((p) => NEEDS_MEDIA.includes(p))
        const count = Array.isArray(value) ? value.length : 0
        return needs.length && !count
          ? `${needs.join(' and ')} need at least one photo or video.`
          : true
      },
    },
    {
      name: 'error',
      type: 'text',
      admin: { readOnly: true, condition: (data) => Boolean(data?.error) },
    },
    { name: 'postizResponse', type: 'json', admin: { readOnly: true } },
    { name: 'telegramMessageId', type: 'number', admin: { readOnly: true, position: 'sidebar' } },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req, context }) => {
        if (context[HQ_INTERNAL]) return doc
        const draft = doc as HqSocialDraft
        const becamePending =
          draft.status === 'pending' && (operation === 'create' || previousDoc?.status !== 'pending')
        if (!becamePending) return doc

        if (operation === 'create') {
          await recordEvent(
            req.payload,
            {
              type: 'social.draft_created',
              summary: `Social draft #${draft.id} for ${(draft.platforms ?? []).join(', ')}`,
              refCollection: 'hq-social-drafts',
              refId: draft.id,
            },
            { req },
          )
        }
        // Not awaited: the preview uploads a file, and the admin save should
        // not wait on Telegram. Its own failure is logged, not surfaced.
        void sendDraftPreview(req.payload, draft).catch((err) =>
          console.error('[hq] draft preview failed:', err instanceof Error ? err.message : err),
        )
        return doc
      },
    ],
  },
}
