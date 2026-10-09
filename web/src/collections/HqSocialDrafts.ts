import type { CollectionConfig } from 'payload'
import { humanOnly, staffOnly } from '../fields/shared'
import { HQ_INTERNAL, draftFingerprint, recordEvent, sendDraftPreview } from '../lib/hq'
import { NEEDS_MEDIA, PLATFORMS, facebookProblem } from '../lib/postiz'
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
      // Claude can write and edit drafts over MCP but never move one: approval
      // is a human tap in Telegram, and re-sending a failed draft is done here.
      access: humanOnly,
      // Also the field's description in the MCP tool schema, where it is listed
      // as an input but silently dropped.
      admin: {
        position: 'sidebar',
        description: 'Moved by the Approve/Reject tap in Telegram or here. Ignored when written over MCP.',
      },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'Published', value: 'published' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Failed', value: 'failed' },
      ],
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
      // A Facebook post must carry a flamingocounty.com link. Skipped for HQ's
      // own writes: an auto-draft is created first and gets its tracking link
      // in a second write. Approve checks again.
      validate: (
        value: unknown,
        { siblingData, req }: { siblingData: Partial<HqSocialDraft>; req?: { context?: Record<string, unknown> } },
      ) => {
        if (typeof value !== 'string' || !value.trim()) return 'Write the caption.'
        if (req?.context?.[HQ_INTERNAL]) return true
        return facebookProblem(siblingData.platforms, 1, value) ?? true
      },
      // TikTok's 2000 is the tightest of the three (Instagram 2200, Facebook 63k).
      maxLength: 2000,
    },
    {
      name: 'media',
      type: 'relationship',
      relationTo: 'hq-media',
      hasMany: true,
      admin: { description: 'The first file is the cover shown in Telegram.' },
      validate: (
        value: unknown,
        { siblingData, req }: { siblingData: Partial<HqSocialDraft>; req?: { context?: Record<string, unknown> } },
      ) => {
        // HQ's own bookkeeping writes (stats, post ids) must not fail on an
        // older text-only draft; Approve enforces the rule before posting.
        if (req?.context?.[HQ_INTERNAL]) return true
        const needs = (siblingData.platforms ?? []).filter((p) => NEEDS_MEDIA.includes(p))
        const count = Array.isArray(value) ? value.length : 0
        return needs.length && !count
          ? `${needs.join(' and ')} need at least one photo or video.`
          : true
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'pillar',
          type: 'select',
          options: [
            { label: 'Business spotlight', value: 'spotlight' },
            { label: 'Event', value: 'event' },
            { label: 'Story', value: 'story' },
            { label: 'Promo', value: 'promo' },
            { label: 'Other', value: 'other' },
          ],
          admin: { description: 'What kind of post — the stats are compared by this.' },
        },
        {
          name: 'language',
          type: 'select',
          options: [
            { label: 'Español', value: 'es' },
            { label: 'English', value: 'en' },
            { label: 'Both', value: 'both' },
          ],
        },
      ],
    },
    {
      // The page a draft was written for when it went live (lib/autoDraft.ts),
      // or `weekly-roundup` and the week's Monday (lib/weeklyRoundup.ts).
      // Republishing that page finds this and drafts nothing new.
      type: 'row',
      fields: [
        {
          name: 'sourceCollection',
          type: 'text',
          access: humanOnly,
          admin: { readOnly: true, description: 'Drafted when this page was published, or the weekly roundup. Set by HQ.' },
        },
        { name: 'sourceId', type: 'text', index: true, access: humanOnly, admin: { readOnly: true } },
      ],
      admin: { condition: (data) => Boolean(data?.sourceCollection) },
    },
    {
      // At most one draft per key, held by the database: the Monday roundup
      // writes `weekly-roundup:<monday>`, so a retried run, a restart or a
      // second process can never draft the same week twice. Empty on every
      // other draft (SQLite lets any number of rows leave it empty).
      name: 'dedupeKey',
      type: 'text',
      unique: true,
      access: humanOnly,
      admin: { hidden: true },
    },
    {
      name: 'error',
      access: humanOnly,
      type: 'text',
      admin: {
        readOnly: true,
        condition: (data) => Boolean(data?.error),
        description: 'Why the last approval failed. Set by HQ.',
      },
    },
    {
      name: 'publishAt',
      access: humanOnly,
      type: 'date',
      admin: {
        readOnly: true,
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description: 'When Postiz was told to publish. Stats checkpoints count from here.',
      },
    },
    {
      name: 'postizPosts',
      access: humanOnly,
      type: 'array',
      admin: { readOnly: true, description: 'One Postiz post per platform, for its stats.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'platform', type: 'text', required: true },
            { name: 'postId', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'postizResponse',
      type: 'json',
      access: humanOnly,
      admin: { readOnly: true, description: 'Set by HQ.' },
    },
    {
      name: 'telegramMessageId',
      type: 'number',
      access: humanOnly,
      admin: { readOnly: true, position: 'sidebar', description: 'Set by HQ.' },
    },
    {
      // What the owner was shown. Approve refuses a draft whose content no
      // longer matches, so an edit after the preview can never be posted unseen.
      name: 'previewedHash',
      type: 'text',
      access: humanOnly,
      admin: { hidden: true },
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req, context }) => {
        if (context[HQ_INTERNAL]) return doc
        const draft = doc as HqSocialDraft
        const becamePending =
          draft.status === 'pending' && (operation === 'create' || previousDoc?.status !== 'pending')
        // A pending draft edited after its preview went out — by Claude or in
        // the admin — is previewed again, so the buttons always sit under the
        // version they would post.
        const editedWhilePending =
          operation === 'update' &&
          draft.status === 'pending' &&
          previousDoc?.status === 'pending' &&
          draftFingerprint(draft) !== draftFingerprint(previousDoc as HqSocialDraft)
        if (!becamePending && !editedWhilePending) return doc

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
