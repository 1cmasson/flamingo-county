import type { CollectionConfig } from 'payload'
import { humanOnly, notFromMcp, staffOnly } from '../fields/shared'

/**
 * One person who wrote to our WhatsApp about a client we run a line for
 * (lib/whatsappFlows.ts): who they are, where they came from, what they asked
 * for, and the conversation so far. One row per number per flow, so the list
 * shows which visits and calls came through us.
 *
 * The bot keeps its place here (`step`), not in memory, so a restart
 * mid-conversation picks up where it left off. Never anything about their
 * health: the flow doesn't ask, and a shared location is used for the bus
 * answer and dropped, never saved. Staff-only. Over MCP the number is hidden
 * and the bot's fields can't be written.
 */
export const HqLeads: CollectionConfig = {
  slug: 'hq-leads',
  access: staffOnly,
  admin: {
    useAsTitle: 'whatsappName',
    group: 'HQ',
    defaultColumns: ['whatsappName', 'flow', 'status', 'intent', 'place', 'source', 'lastInboundAt'],
    description:
      'People who wrote to our WhatsApp for a client (La Capital…). "Ready" = they asked to be called and said yes to sharing their number; set the rest from the Telegram buttons.',
  },
  defaultSort: '-lastInboundAt',
  indexes: [{ fields: ['flow', 'phone'], unique: true }],
  fields: [
    { name: 'flow', type: 'text', required: true, index: true, admin: { description: 'Which line: la-capital.' } },
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
    { name: 'source', type: 'text', index: true, admin: { description: 'Where the link was tapped (instagram, story, listing…), from the ref in their first message.' } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New (saw the menu)', value: 'new' },
        { label: 'Asking (using the buttons)', value: 'asking' },
        { label: 'Handoff (waiting for a person)', value: 'handoff' },
        { label: 'Ready (asked to be called, number OK to share)', value: 'ready' },
        { label: 'Called', value: 'called' },
        { label: 'Visited', value: 'visited' },
        { label: 'No-show', value: 'no-show' },
        { label: 'Closed', value: 'closed' },
      ],
    },
    {
      name: 'step',
      type: 'text',
      defaultValue: 'menu',
      access: humanOnly,
      admin: { readOnly: true, description: 'Where the bot is in the conversation.' },
    },
    { name: 'intent', type: 'select', options: ['visit', 'callback', 'directions'], admin: { description: 'What they came for.' } },
    { name: 'place', type: 'text', admin: { description: 'Which location (the flow’s place key).' } },
    { name: 'when', type: 'text', admin: { description: 'When they’d like to go (this week, next week, any).' } },
    { name: 'timeOfDay', type: 'text', admin: { description: 'Morning, afternoon or any.' } },
    { name: 'travel', type: 'text', admin: { description: 'Car, bus or a ride from someone.' } },
    {
      name: 'consentAt',
      type: 'date',
      access: humanOnly,
      admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'When they tapped yes to their name and number going to the client.' },
    },
    { name: 'consentText', type: 'textarea', access: humanOnly, admin: { description: 'The exact question they said yes to.' } },
    { name: 'optedOut', type: 'checkbox', defaultValue: false, access: humanOnly, admin: { description: 'They wrote BAJA/STOP. Never message them first.' } },
    { name: 'misses', type: 'number', defaultValue: 0, access: humanOnly, admin: { description: 'Replies in a row the bot didn’t understand. At 2 it hands over to a person.' } },
    { name: 'lastInboundAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'Their last message. Free-form replies are allowed for 24 hours after it.' } },
    {
      name: 'messages',
      type: 'json',
      access: humanOnly,
      admin: { description: 'The conversation, newest last: { at, from: them | bot | us, body }. The last 60 are kept.' },
    },
    { name: 'notes', type: 'textarea', admin: { description: 'What the clinic said, when they came.' } },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true, access: humanOnly, admin: { description: 'Written from the owner’s or staff’s own number; left out of the counts.' } },
  ],
}
