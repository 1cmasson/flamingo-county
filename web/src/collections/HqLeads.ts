import type { CollectionConfig } from 'payload'
import { humanOnly, notFromMcp, staffOnly } from '../fields/shared'

/**
 * One person who wrote to the reservations WhatsApp line about an event we
 * sell for a promoter (lib/reservas.ts): who they are, where they came from,
 * what they asked for, and the conversation so far. One row per number per
 * event, so the list handed to the promoter is our proof of which bookings
 * were ours.
 *
 * The bot keeps its place in the conversation here (`step`), not in memory, so
 * a restart mid-conversation picks up where it left off. Staff-only. Over MCP
 * the number is hidden and can't be written: Claude reads the conversation and
 * drafts replies (hqLeadDraftReply), and the owner's tap sends them.
 */
export const HqLeads: CollectionConfig = {
  slug: 'hq-leads',
  access: staffOnly,
  admin: {
    useAsTitle: 'whatsappName',
    group: 'HQ',
    defaultColumns: ['whatsappName', 'event', 'status', 'partySize', 'tier', 'source', 'lastInboundAt'],
    description:
      'People who wrote to the reservations WhatsApp. The bot answers the menu; "handoff" = waiting for a person (reply from Telegram). Set booked or lost by hand once you know.',
  },
  defaultSort: '-lastInboundAt',
  indexes: [{ fields: ['event', 'phone'], unique: true }],
  fields: [
    { name: 'event', type: 'text', required: true, index: true, admin: { description: 'The event’s slug in lib/reservas.ts, e.g. chacal-nye.' } },
    {
      name: 'phone',
      type: 'text',
      required: true,
      index: true,
      access: { read: notFromMcp, ...humanOnly },
      admin: { description: 'Their WhatsApp number (+13055551234). Never shown over MCP.' },
    },
    { name: 'whatsappName', type: 'text', admin: { description: 'The name on their WhatsApp profile, as they set it.' } },
    { name: 'lang', type: 'select', options: ['es', 'en'], defaultValue: 'es' },
    { name: 'source', type: 'text', index: true, admin: { description: 'Where the link was tapped (instagram, facebook, story, bio…), from the ref in their first message.' } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New (saw the menu)', value: 'new' },
        { label: 'Asking (using the menu)', value: 'asked' },
        { label: 'Handoff (waiting for a person)', value: 'handoff' },
        { label: 'Booked', value: 'booked' },
        { label: 'Lost', value: 'lost' },
      ],
    },
    {
      name: 'step',
      type: 'text',
      defaultValue: 'menu',
      access: humanOnly,
      admin: { readOnly: true, description: 'Where the bot is in the conversation (menu, party, tier, optin).' },
    },
    { name: 'partySize', type: 'number', min: 1 },
    { name: 'tier', type: 'text', admin: { description: 'The table they picked, by name.' } },
    {
      name: 'optIn',
      type: 'checkbox',
      defaultValue: false,
      access: humanOnly,
      admin: { description: 'They said yes to news about the show by WhatsApp. Without it, nothing is sent to them after 24 hours.' },
    },
    { name: 'optInAt', type: 'date', access: humanOnly },
    { name: 'misses', type: 'number', defaultValue: 0, access: humanOnly, admin: { description: 'Replies in a row the bot didn’t understand. At 2 it hands over to a person.' } },
    { name: 'lastInboundAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Their last message. Free-form replies are allowed for 24 hours after it.' } },
    {
      name: 'messages',
      type: 'json',
      access: humanOnly,
      admin: { description: 'The conversation, newest last: { at, from: them | bot | us, body }. The last 60 are kept.' },
    },
    {
      name: 'draftReply',
      type: 'textarea',
      access: humanOnly,
      admin: { description: 'A reply Claude suggested, waiting for the owner’s tap in Telegram.' },
    },
    { name: 'notes', type: 'textarea', admin: { description: 'What was agreed, deposit, who confirmed with the promoter.' } },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true, access: humanOnly, admin: { description: 'Written from the owner’s or staff’s own number; left out of the counts.' } },
  ],
}
