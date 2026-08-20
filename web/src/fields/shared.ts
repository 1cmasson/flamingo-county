import type { Field } from 'payload'

/**
 * Every content type in fc-data.js already carries a stable string id
 * (`el-gallo`, `son-thursday`, `flamingo-room`), and those ids are the live URL
 * contract: `?biz=el-gallo`, `?e=son-thursday`, `?s=el-gallo`. We reuse them
 * verbatim rather than minting new ones, which is also what makes the seed
 * importer idempotent — it upserts on this field.
 *
 * WEEKLY and SPOTS carry no id in the source, so the seed assigns them a
 * synthetic one (`weekly-4-son-cubano-live`, `spotlight-havana`) to keep the
 * same upsert working uniformly. See src/seed/index.ts.
 */
export const slugField: Field = {
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description: 'URL identifier. Changing it breaks existing links.',
  },
}

/** Public read, authenticated write — the default for every content collection. */
export const publicRead = { read: () => true }
