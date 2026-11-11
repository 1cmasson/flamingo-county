import type { CollectionConfig } from 'payload'
import { noPrice, staffOnly } from '../fields/shared'

/**
 * A story a fan asked us to tell, typed under the weekly vote
 * (lib/storySuggestions.ts). Thin like `ranking-nominations`: the text as
 * typed, where it came from. No IP, user agent, cookie or visitor id.
 * Staff-only: unchecked free text, never shown publicly.
 */
export const StoryPollSuggestions: CollectionConfig = {
  slug: 'story-poll-suggestions',
  access: staffOnly,
  admin: {
    useAsTitle: 'text',
    group: 'HQ',
    defaultColumns: ['poll', 'text', 'source', 'test', 'createdAt'],
    description:
      'Stories fans asked for under the weekly vote. Unchecked text: never shown publicly. Ideas for next week’s options. "Test" = from a staff or owner device.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'poll', type: 'relationship', relationTo: 'story-polls', required: true, index: true },
    { name: 'text', type: 'text', required: true, maxLength: 140, validate: noPrice, admin: { description: 'The story, as the fan typed it.' } },
    { name: 'source', type: 'text', index: true, admin: { description: 'instagram, facebook, google, direct…' } },
    { name: 'lang', type: 'select', options: ['es', 'en'] },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true },
  ],
}
