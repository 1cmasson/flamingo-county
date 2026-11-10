import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * One vote in the weekly story vote (lib/storyPolls.ts). Thin like
 * `ranking-votes`: which poll, which story, where the voter came from. No IP,
 * user agent, cookie or visitor id is stored. Staff-only; the page shows the split.
 */
export const StoryPollVotes: CollectionConfig = {
  slug: 'story-poll-votes',
  access: staffOnly,
  admin: {
    useAsTitle: 'option',
    group: 'HQ',
    defaultColumns: ['poll', 'option', 'source', 'lang', 'test', 'createdAt'],
    description: 'Votes in the weekly story vote. No name, IP or cookie stored. "Test" = cast on a staff or owner device; left out of the counts.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'poll', type: 'relationship', relationTo: 'story-polls', required: true, index: true },
    { name: 'option', type: 'text', required: true, admin: { description: 'The story’s key in the poll.' } },
    { name: 'source', type: 'text', index: true, admin: { description: 'instagram, facebook, google, direct…' } },
    { name: 'lang', type: 'select', options: ['es', 'en'] },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true },
  ],
}
