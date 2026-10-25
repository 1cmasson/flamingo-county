import type { CollectionConfig } from 'payload'

import { humanOnly, noPrice, staffOnly } from '../fields/shared'
import { HQ_INTERNAL } from '../lib/hq'
import { campaignSwitchedOn, campaignWordingChanged, dmTextProblem, notifyCampaignPaused } from '../lib/commentDmCopy'

/**
 * "Comment CHACAL and we'll DM you": a keyword on some of our Instagram posts
 * that gets each commenter one private reply. Read every two minutes by the
 * `commentDm` job (lib/commentDm.ts); the replies it queues and sends are in
 * `hq-comment-replies`.
 *
 * Off until the owner switches it on: `active` defaults to false and cannot be
 * written over MCP (`humanOnly`), so Claude can set a campaign up but only the
 * owner, in the admin, can start it. If anything that changes what goes out
 * (the keyword, the posts, the DM wording) is edited over MCP while it is on,
 * it switches itself off and tells the owner (see the afterChange hook).
 *
 * A post is named by its Instagram media id, or by the HQ draft it was
 * published from: the job then finds the media itself (the draft's publishAt
 * against the account's media timestamps) and writes the id back here.
 */
export const HqCommentCampaigns: CollectionConfig = {
  slug: 'hq-comment-campaigns',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'name',
    defaultColumns: ['name', 'keyword', 'active', 'endsAt'],
    description: 'Comment a keyword → we DM you. Off until you switch a campaign on here.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      access: humanOnly,
      admin: {
        position: 'sidebar',
        description: 'Only you can switch this on. While it is on, HQ reads the posts’ comments every 2 minutes and DMs each matching commenter once.',
      },
    },
    {
      name: 'endsAt',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' }, description: 'Stops by itself after this.' },
    },
    {
      name: 'keyword',
      type: 'text',
      required: true,
      admin: { description: 'One word, e.g. CHACAL. Case, accents and punctuation do not matter; it must be its own word.' },
      validate: (v: unknown) =>
        (typeof v === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}' -]{0,38}[\p{L}\p{N}]$/u.test(v.trim())) || 'A word of 2–40 letters or digits.',
    },
    {
      name: 'posts',
      type: 'array',
      minRows: 1,
      admin: { description: 'The Instagram posts the keyword works on, each with the language its DM is in.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'draft',
              type: 'relationship',
              relationTo: 'hq-social-drafts',
              admin: { description: 'The HQ draft it was published from (finds the media id by itself).' },
            },
            {
              name: 'mediaId',
              type: 'text',
              admin: { description: 'Instagram media id. Filled by HQ from the draft when empty.' },
            },
            {
              name: 'language',
              type: 'select',
              options: [
                { label: 'Español', value: 'es' },
                { label: 'English', value: 'en' },
              ],
              admin: { description: 'Empty: the draft’s language.' },
            },
          ],
        },
        { name: 'permalink', type: 'text', admin: { readOnly: true, description: 'Filled by HQ.' } },
      ],
      validate: (rows: unknown) => {
        const list = Array.isArray(rows) ? (rows as { draft?: unknown; mediaId?: string | null }[]) : []
        if (!list.length) return 'Add at least one post.'
        return list.every((r) => r.draft || r.mediaId?.trim()) || 'Each post needs a draft or a media id.'
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'dmTextEs',
          type: 'textarea',
          required: true,
          maxLength: 900,
          validate: (v: unknown) => dmTextProblem(v) ?? noPrice(v),
          admin: { description: 'The DM for the Spanish post. No links, no prices, no offers.' },
        },
        {
          name: 'dmTextEn',
          type: 'textarea',
          required: true,
          maxLength: 900,
          validate: (v: unknown) => dmTextProblem(v) ?? noPrice(v),
          admin: { description: 'The DM for the English post.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'delayMinMinutes', type: 'number', defaultValue: 5, min: 0, max: 600, admin: { description: 'DM goes a random time after the comment: at least…' } },
        { name: 'delayMaxMinutes', type: 'number', defaultValue: 12, min: 0, max: 600, admin: { description: '…and at most this many minutes.' } },
        { name: 'hourlyCap', type: 'number', defaultValue: 30, min: 1, max: 100, admin: { description: 'DMs per hour at most; the rest wait (and you are told).' } },
      ],
    },
    { name: 'notes', type: 'textarea' },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req, context }) => {
        if (context[HQ_INTERNAL] || operation !== 'update') return doc
        // Switched on by the owner in the admin: say exactly what will go out.
        if (doc.active && !previousDoc?.active) {
          await campaignSwitchedOn(doc)
          return doc
        }
        // Claude changed what goes out while it was on: off until the owner looks again.
        if (req.payloadAPI === 'MCP' && doc.active && campaignWordingChanged(previousDoc, doc)) {
          await req.payload.update({
            collection: 'hq-comment-campaigns',
            id: doc.id,
            data: { active: false },
            overrideAccess: true,
            context: { [HQ_INTERNAL]: true },
          })
          await notifyCampaignPaused(doc)
          return { ...doc, active: false }
        }
        return doc
      },
    ],
  },
}
