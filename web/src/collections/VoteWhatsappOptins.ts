import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * WhatsApp numbers that asked, after voting, to hear when the next weekly
 * story vote opens and who won (lib/voteOptins.ts). One row per number, with
 * the exact consent sentence they ticked and when. A welcome goes out when
 * they sign up, and the weekly "the vote is open" only after the owner's tap
 * in Telegram (lib/voteWhatsapp.ts). Staff-only and off MCP: these are
 * people's phone numbers.
 */
export const VoteWhatsappOptins: CollectionConfig = {
  slug: 'vote-whatsapp-optins',
  access: staffOnly,
  admin: {
    useAsTitle: 'phone',
    group: 'HQ',
    defaultColumns: ['phone', 'lang', 'status', 'source', 'test', 'consentAt'],
    description:
      'WhatsApp numbers that opted in to the weekly vote message, with their consent. One message a week; BAJA/STOP = set to unsubscribed. "Test" = signed up from a staff or owner device.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'phone',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'E.164, e.g. +17865551234.' },
    },
    { name: 'lang', type: 'select', options: ['es', 'en'], required: true, defaultValue: 'es' },
    {
      name: 'status',
      type: 'select',
      options: ['active', 'unsubscribed'],
      required: true,
      defaultValue: 'active',
      index: true,
      admin: { description: 'Set to unsubscribed when they write BAJA or STOP. Never message an unsubscribed number.' },
    },
    { name: 'poll', type: 'relationship', relationTo: 'story-polls', admin: { description: 'The vote they signed up from (the latest one).' } },
    {
      name: 'consentText',
      type: 'textarea',
      required: true,
      admin: { description: 'The exact checkbox sentence they ticked.' },
    },
    { name: 'consentAt', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'source', type: 'text', index: true, admin: { description: 'instagram, facebook, google, direct…' } },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true },
    {
      name: 'lastPollSentId',
      type: 'number',
      index: true,
      admin: { readOnly: true, description: 'The last vote whose "the vote is open" WhatsApp went to this number (lib/voteWhatsapp.ts). Never sent twice for one vote.' },
    },
    { name: 'lastPollSentAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'lastResultSentId',
      type: 'number',
      index: true,
      admin: { readOnly: true, description: 'The last vote whose winner WhatsApp went to this number (lib/voteWhatsapp.ts). Never sent twice for one vote.' },
    },
  ],
}
