import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * Things someone has to do. `assignee: claude` is the hand-off point between
 * the always-on Telegram bot and Claude Code: `/task` in Telegram files one,
 * and Claude picks it up (over MCP, once that lands) instead of the bot trying
 * to act on its own.
 */
export const HqTasks: CollectionConfig = {
  slug: 'hq-tasks',
  access: staffOnly,
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'assignee', 'status', 'dueAt', 'createdAt'],
    group: 'HQ',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      type: 'select',
      defaultValue: 'open',
      index: true,
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Doing', value: 'doing' },
        { label: 'Done', value: 'done' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'assignee',
      type: 'select',
      defaultValue: 'me',
      options: [
        { label: 'Me', value: 'me' },
        { label: 'Claude', value: 'claude' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'dueAt', type: 'date', admin: { position: 'sidebar' } },
    { name: 'title', type: 'text', required: true },
    { name: 'detail', type: 'textarea' },
    { name: 'event', type: 'relationship', relationTo: 'hq-events' },
  ],
}
