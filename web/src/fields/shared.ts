import type { CollectionBeforeOperationHook, Field, GlobalBeforeOperationHook } from 'payload'

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

/**
 * Refuses a money amount ("$12", "12 dollars", "20 dólares"). The site makes
 * no price or cost claims, so free-text labels must not smuggle one in.
 */
export const noPrice = (value: unknown) =>
  typeof value !== 'string' ||
  !/\$\s*\d|\d\s*(usd|dollars?|d[oó]lares?)\b/i.test(value) ||
  'No prices. Say who gets in, not what it costs.'

/**
 * `HH:mm`, or empty. Validated at the edge rather than downstream: a malformed
 * clock reaching `Date.UTC` produces `NaN`, and an ICS with
 * `DTSTART:NaNNaNNaN` is a file every calendar client rejects silently. The
 * listings' structured hours go out as schema.org `opens`/`closes`, which want
 * the same shape.
 */
export const hhmm = (value: unknown) =>
  !value ||
  (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
  'Use 24-hour HH:mm, e.g. 09:00.'

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

/* ------------------------------------------------------------- drafts */

/**
 * The site's content collections have drafts: a saved draft is never live,
 * and only a published version is shown. Two rules make that hold everywhere.
 *
 * 1. Anyone not logged in reads published documents only. That covers
 *    Payload's public REST and GraphQL, including `?draft=true`, because the
 *    constraint is applied to the versions query too. The frontend uses the
 *    local API, which skips access control, so lib/data.ts adds
 *    `PUBLISHED` to every query itself.
 * 2. Over MCP, a write must be a draft (see `mcpDraftsOnly`). Publishing is
 *    the owner's Approve tap in Telegram (lib/publishRequests.ts).
 */
export const PUBLISHED = { _status: { equals: 'published' } } as const

export const publishedRead = {
  read: ({ req }: { req: { user?: unknown } }) => (req.user ? true : PUBLISHED),
}

export const draftVersions = { drafts: true, maxPerDoc: 50 } as const

/**
 * Refuse any MCP create or update that is not a draft save, and pin the
 * status to `draft`. Without the pin, `_status: 'published'` in the data
 * would publish even with `draft: true` — Payload treats that as a publish.
 */
export const mcpDraftsOnly: CollectionBeforeOperationHook = ({ args, operation, req }) => {
  if (req.payloadAPI !== 'MCP' || (operation !== 'create' && operation !== 'update')) return args
  const write = args as { draft?: boolean; data?: Record<string, unknown> }
  if (write.draft !== true) {
    throw new Error(
      'Over MCP, site content can only be saved as a draft: pass draft: true. Publishing needs the owner’s approval — use hqRequestPublish.',
    )
  }
  if (write.data) write.data._status = 'draft'
  return args
}

/** `mcpDraftsOnly` for a global with drafts: the link page (globals/LinkPage.ts). */
export const mcpGlobalDraftsOnly: GlobalBeforeOperationHook = ({ args, operation, req }) => {
  if (req.payloadAPI !== 'MCP' || operation !== 'update') return args
  const write = args as { draft?: boolean; data?: Record<string, unknown> }
  if (write.draft !== true) {
    throw new Error(
      'Over MCP, the link page can only be saved as a draft: pass draft: true. Publishing needs the owner’s approval — use hqRequestPublish.',
    )
  }
  if (write.data) write.data._status = 'draft'
  return args
}
