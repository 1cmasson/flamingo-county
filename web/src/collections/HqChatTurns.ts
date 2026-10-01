import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * The HQ bot's short memory: the owner's plain-text messages and the model's
 * replies, so a follow-up ("and yesterday?") has something to follow.
 *
 * Kept minimal on purpose. Text is stored already redacted (no emails or
 * phones) and clipped, only the last few turns are ever sent back to the model,
 * and turns older than two days are deleted after each exchange. The owner's
 * turns in the last 24 hours are also what the daily call limit counts.
 *
 * Not exposed over MCP (not in the plugin's list in payload.config.ts).
 */
export const HqChatTurns: CollectionConfig = {
  slug: 'hq-chat-turns',
  access: staffOnly,
  admin: {
    useAsTitle: 'text',
    defaultColumns: ['role', 'text', 'createdAt'],
    group: 'HQ',
    description: "The Telegram chat's short memory. Redacted, and pruned after two days.",
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'Owner', value: 'user' },
        { label: 'Assistant', value: 'assistant' },
      ],
    },
    { name: 'text', type: 'textarea', required: true },
  ],
}
