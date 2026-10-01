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

/**
 * Every operation staff-only — the HQ collections. Unlike `subscribers` and
 * `listing-requests` there is no public `create`: no visitor writes here. Rows
 * come from server-side hooks, the Telegram webhook and the jobs queue, which
 * all use the local API.
 */
export const staffOnly = {
  read: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
  create: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
  update: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
  delete: ({ req }: { req: { user?: unknown } }) => Boolean(req.user),
}

/**
 * Field access that refuses writes arriving over MCP (`@payloadcms/plugin-mcp`
 * sets `req.payloadAPI = 'MCP'`). For the fields that must stay with a human or
 * with HQ's own bookkeeping — a draft's approval status above all. HQ's own
 * writes use `overrideAccess`, which skips field access, so they are unaffected.
 */
export const notFromMcp = ({ req }: { req: { payloadAPI?: string } }) => req.payloadAPI !== 'MCP'
export const humanOnly = { create: notFromMcp, update: notFromMcp }
