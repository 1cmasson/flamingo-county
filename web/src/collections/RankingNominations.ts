import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * A neighbor naming a place for a ranking while it is nominating
 * (lib/rankingNominations.ts). Thin like `ranking-votes`: the place as typed,
 * where it came from. No IP, user agent, cookie or visitor id. Staff-only:
 * the names are unchecked free text, so the page shows only how many there are.
 */
export const RankingNominations: CollectionConfig = {
  slug: 'ranking-nominations',
  access: staffOnly,
  admin: {
    useAsTitle: 'name',
    group: 'HQ',
    defaultColumns: ['ranking', 'name', 'area', 'source', 'test', 'createdAt'],
    description:
      'Places neighbors named on a ranking’s page. Unchecked text: never shown publicly. The most-named become the ranking’s entrants. "Test" = from a staff or owner device; left out of the counts.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'ranking', type: 'relationship', relationTo: 'rankings', required: true, index: true },
    { name: 'name', type: 'text', required: true, maxLength: 80, admin: { description: 'The place, as the neighbor typed it.' } },
    { name: 'area', type: 'text', maxLength: 80, admin: { description: 'Where, if they said: a street or a corner.' } },
    { name: 'source', type: 'text', index: true, admin: { description: 'instagram, facebook, google, direct…' } },
    { name: 'lang', type: 'select', options: ['es', 'en'] },
    { name: 'test', type: 'checkbox', defaultValue: false, index: true },
  ],
}
