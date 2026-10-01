import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * The ops event log — HQ's event bus and its telemetry in one table.
 *
 * Everything that happens and might need the owner's attention lands here as
 * one row: a listing request, a signup, a social draft approved or rejected, a
 * brief sent. The Telegram bot pings from it, the morning brief summarises it,
 * and later the MCP server lets Claude read it. One table, so the three never
 * disagree about what happened.
 *
 * `type` is a dotted `<thing>.<what happened>` string rather than a select so a
 * new source can start writing without a schema migration. `ref` points back
 * at the record that caused it, by slug and id, for the same reason.
 */
export const HqEvents: CollectionConfig = {
  slug: 'hq-events',
  access: staffOnly,
  admin: {
    useAsTitle: 'summary',
    defaultColumns: ['summary', 'type', 'status', 'createdAt'],
    group: 'HQ',
    description: 'Everything the ops layer has seen. New rows show up in the morning brief.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New', value: 'new' },
        { label: 'Seen', value: 'seen' },
        { label: 'Done', value: 'done' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'type',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'e.g. listing_request.created, social.scheduled, brief.sent' },
    },
    { name: 'summary', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'refCollection', type: 'text', admin: { description: 'Collection that caused it.' } },
        { name: 'refId', type: 'text' },
      ],
    },
    { name: 'data', type: 'json', admin: { description: 'Anything else worth keeping.' } },
  ],
}
