import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * One vote in a ranking's round (lib/rankings.ts). Deliberately thin, like
 * `hq-uses`: which game, which place, where the voter came from. No IP, user
 * agent, cookie or visitor id. Staff-only; the page shows the counts.
 */
export const RankingVotes: CollectionConfig = {
  slug: 'ranking-votes',
  access: staffOnly,
  admin: {
    useAsTitle: 'entrant',
    group: 'HQ',
    defaultColumns: ['ranking', 'stage', 'matchup', 'entrant', 'source', 'test', 'createdAt'],
    description: 'Votes in the neighbors’ rankings. No name, IP or cookie. "Test" = cast on a staff or owner device; left out of the counts.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'ranking', type: 'relationship', relationTo: 'rankings', required: true, index: true },
    {
      name: 'stage',
      type: 'select',
      required: true,
      options: ['qf', 'sf', 'final'],
    },
    { name: 'matchup', type: 'number', required: true, min: 0 },
    { name: 'entrant', type: 'text', required: true, admin: { description: 'The place’s key in the ranking.' } },
    { name: 'source', type: 'text', index: true, admin: { description: 'instagram, facebook, google, direct…' } },
    { name: 'lang', type: 'select', options: ['es', 'en'] },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true },
  ],
}
