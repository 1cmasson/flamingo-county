import type { CollectionSlug, Payload } from 'payload'

import type { HqPublishRequest } from '../payload-types'
import { recordEvent } from './hq'
import { clip, esc, ownerChatId, resolveButtons, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'

/**
 * Drafts are free; going live needs the owner.
 *
 *   1. Claude saves drafts of site content over MCP (`draft: true` is enforced,
 *      see `mcpDraftsOnly`). Nothing it saves is visible.
 *   2. `hqRequestPublish` puts the difference between the live page and the
 *      draft in front of the owner in Telegram, with Publish / Reject.
 *   3. Publish publishes exactly that draft. If the draft changed after the
 *      preview, nothing is published and the current version is sent instead.
 *
 * The tap is the permission: the webhook only acts for the owner's Telegram
 * account, behind Telegram's secret header, and no MCP tool can mark a request
 * approved (`hq-publish-requests` is not exposed over MCP).
 */

export const PUBLISHABLE = ['events', 'weekly-events', 'stories', 'spotlights', 'listings'] as const
export type Publishable = (typeof PUBLISHABLE)[number]

const LOCALES = ['es', 'en'] as const
type Locale = (typeof LOCALES)[number]
type Doc = Record<string, unknown>

const REQUEST_TTL_MS = 72 * 3_600_000
const META = new Set(['id', 'createdAt', 'updatedAt', '_status'])

/* ------------------------------------------------------------------------ */
/* What the owner reads                                                      */
/* ------------------------------------------------------------------------ */

/** Every string inside a value — how a story's blocks read as text. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v)
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out))
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) if (k !== 'id' && k !== 'blockType') strings(x, out)
  }
  return out
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '∅'
  if (typeof v === 'string') return clip(v, 220)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'blockType' in x)) {
    return clip(
      v.map((b) => `[${(b as { blockType: string }).blockType}] ${strings(b).join(' / ')}`).join(' ¶ '),
      400,
    )
  }
  return clip(JSON.stringify(v), 220)
}

/** Empty is empty, whichever way Payload stores it. */
const norm = (v: unknown) => (v === undefined || v === '' || (Array.isArray(v) && !v.length) ? null : v)
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b))

/**
 * One line per field that differs between the live page and the draft,
 * `live → draft`, per language for translated fields and once for the rest —
 * plus a warning for the changes that can do damage.
 */
export function diffLines(
  collection: string,
  fields: { name: string; localized?: boolean }[],
  live: Partial<Record<Locale, Doc>>,
  draft: Partial<Record<Locale, Doc>>,
): { lines: string[]; warnings: string[] } {
  const lines: string[] = []
  const warnings = new Set<string>()
  const isNew = !live.es && !live.en
  for (const f of fields) {
    if (META.has(f.name)) continue
    for (const locale of f.localized ? LOCALES : ([LOCALES[0]] as const)) {
      const next = draft[locale]?.[f.name]
      const prev = live[locale]?.[f.name]
      if (same(prev, next) || (isNew && norm(next) === null)) continue
      const tag = f.localized ? ` (${locale})` : ''
      lines.push(isNew ? `• ${f.name}${tag}: ${formatValue(next)}` : `• ${f.name}${tag}: ${formatValue(prev)} → ${formatValue(next)}`)
      if (f.name === 'slug' && !isNew) warnings.add('⚠️ Changes the URL — existing links to this page will break.')
      if (collection === 'listings' && f.name === 'publicationStatus') {
        warnings.add(
          next === 'ready'
            ? '⚠️ Marks the listing "ready": that claims every field traces to a real source.'
            : '⚠️ Changes how sourced this listing is marked.',
        )
      }
    }
  }
  return { lines, warnings: [...warnings] }
}

/* ------------------------------------------------------------------------ */
/* Reading drafts and live pages                                             */
/* ------------------------------------------------------------------------ */

async function readBoth(payload: Payload, collection: Publishable, id: string | number) {
  const live: Partial<Record<Locale, Doc>> = {}
  const draft: Partial<Record<Locale, Doc>> = {}
  for (const locale of LOCALES) {
    const args = {
      collection: collection as CollectionSlug,
      id,
      locale,
      fallbackLocale: false as never,
      depth: 0,
      overrideAccess: true,
    }
    const main = (await payload.findByID({ ...args, draft: false }).catch(() => null)) as Doc | null
    if (!main) throw new Error(`No ${collection} document with id ${id}.`)
    // A page that was never published has no live version: its main row is
    // the draft itself.
    if (main._status === 'published') live[locale] = main
    draft[locale] = (await payload.findByID({ ...args, draft: true })) as unknown as Doc
  }
  return { live, draft }
}

const titleOf = (d?: Doc) => {
  const t = d?.title ?? d?.name ?? d?.slug
  return typeof t === 'string' ? t : ''
}

/**
 * Whether a document's newest version is a draft nobody has published. The
 * seed checks this before writing, because an update publishes on top of the
 * latest version — a pending draft would go live without the owner's tap.
 */
export async function hasPendingDraft(payload: Payload, collection: CollectionSlug, id: number | string): Promise<boolean> {
  const latest = (await payload.findByID({ collection, id, draft: true, depth: 0, overrideAccess: true })) as { _status?: string }
  return latest?._status === 'draft'
}

/* ------------------------------------------------------------------------ */
/* Request                                                                   */
/* ------------------------------------------------------------------------ */

const keyboard = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: '🌐 Publish', callback_data: `pb:a:${id}` },
      { text: '✖️ Reject', callback_data: `pb:r:${id}` },
    ],
  ],
})

export function parsePublishCallback(data: string | undefined): { action: 'publish' | 'reject'; id: number } | null {
  const m = /^pb:([ar]):(\d+)$/.exec(data ?? '')
  return m ? { action: m[1] === 'a' ? 'publish' : 'reject', id: Number(m[2]) } : null
}

const setRequest = (payload: Payload, id: number, data: Partial<HqPublishRequest>) =>
  payload.update({ collection: 'hq-publish-requests', id, data, overrideAccess: true })

/**
 * Ask the owner to publish a document's current draft. Publishes nothing.
 * Throws a plain-language error for anything refused.
 */
export async function requestPublish(
  payload: Payload,
  input: { collection: string; id: string | number; reason?: string },
  now: Date = new Date(),
) {
  if (!(PUBLISHABLE as readonly string[]).includes(input.collection)) {
    throw new Error(`"${input.collection}" can't be published this way. Allowed: ${PUBLISHABLE.join(', ')}.`)
  }
  const collection = input.collection as Publishable
  if (input.id === undefined || input.id === '') throw new Error('Give the id of the document to publish.')
  if (!telegramConfigured()) throw new Error('Telegram is not configured, so the owner cannot be asked. Nothing was filed.')

  const { live, draft } = await readBoth(payload, collection, input.id)
  const isNew = !live.es && !live.en
  if (!isNew && draft.es?._status === 'published') throw new Error('Nothing to publish: the live page is the latest version.')

  const fields = payload.collections[collection].config.flattenedFields as { name: string; localized?: boolean }[]
  const { lines, warnings } = diffLines(collection, fields, live, draft)
  if (!isNew && !lines.length) throw new Error('Nothing to publish: the draft matches the live page.')

  const name = titleOf(draft.es) || titleOf(draft.en)
  const label = `${isNew ? 'New' : 'Changes to'} ${collection} #${input.id}${name ? ` “${name}”` : ''}`
  const older = await payload.find({
    collection: 'hq-publish-requests',
    where: {
      and: [
        { collection: { equals: collection } },
        { targetId: { equals: String(input.id) } },
        { status: { equals: 'pending' } },
      ],
    },
    depth: 0,
    limit: 20,
    overrideAccess: true,
  })

  const request = await payload.create({
    collection: 'hq-publish-requests',
    data: {
      status: 'pending',
      title: label,
      collection,
      targetId: String(input.id),
      draftStamp: String(draft.es?.updatedAt ?? ''),
      reason: input.reason?.slice(0, 500),
      preview: [...warnings, ...lines].join('\n'),
      expiresAt: new Date(now.getTime() + REQUEST_TTL_MS).toISOString(),
    },
    overrideAccess: true,
  })

  const admin = process.env.BETTER_AUTH_URL
    ? `\n<a href="${esc(`${process.env.BETTER_AUTH_URL}/admin/collections/${collection}/${input.id}`)}">Open the draft in the admin</a>`
    : ''
  const text = [
    `<b>🌐 Publish? #${request.id}</b>`,
    esc(label),
    ...(input.reason ? [`<i>${esc(clip(input.reason, 300))}</i>`] : []),
    ...warnings.map(esc),
    '',
    ...lines.map(esc),
  ].join('\n') + admin

  let sent: { message_id: number }
  try {
    sent = await sendMessage(text, { keyboard: keyboard(request.id) })
  } catch (err) {
    // The owner never saw it: close it and leave any older request alone.
    await setRequest(payload, request.id, { status: 'failed', error: 'Could not reach Telegram.' })
    throw new Error(`Could not reach the owner on Telegram, so nothing was filed (${err instanceof Error ? err.message : err}).`)
  }
  await setRequest(payload, request.id, { telegramMessageId: sent.message_id })

  // Only one live question per page: an older preview can't be approved.
  for (const old of older.docs) {
    await setRequest(payload, old.id, { status: 'superseded' })
    if (old.telegramMessageId) {
      await resolveButtons(ownerChatId()!, old.telegramMessageId, `Replaced by #${request.id}.`).catch(() => undefined)
    }
  }

  await recordEvent(payload, {
    type: 'site.publish_requested',
    summary: `Claude asked to publish: ${label}`,
    refCollection: 'hq-publish-requests',
    refId: request.id,
  })
  return { requestId: request.id, title: label, changes: lines.length, expiresAt: request.expiresAt }
}

/* ------------------------------------------------------------------------ */
/* Publish / Reject (the owner's tap)                                        */
/* ------------------------------------------------------------------------ */

const deciding = new Set<number>()

/**
 * The owner's answer. Returns the one-line outcome for Telegram. One process
 * serves every request (SQLite pins the service to a single instance), so the
 * in-memory guard stops a double tap publishing twice.
 */
export async function decidePublish(
  payload: Payload,
  id: number,
  action: 'publish' | 'reject',
  now: Date = new Date(),
): Promise<string> {
  if (deciding.has(id)) return `#${id} is already being handled.`
  deciding.add(id)
  try {
    return await decide(payload, id, action, now)
  } finally {
    deciding.delete(id)
  }
}

async function decide(payload: Payload, id: number, action: 'publish' | 'reject', now: Date): Promise<string> {
  const r = await payload
    .findByID({ collection: 'hq-publish-requests', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!r) return `No publish request #${id}.`
  if (r.status !== 'pending') return `#${id} is already ${r.status}.`
  if (r.expiresAt && new Date(r.expiresAt).getTime() < now.getTime()) {
    await setRequest(payload, id, { status: 'expired' })
    return `#${id} expired. Ask Claude to request it again.`
  }

  if (action === 'reject') {
    await setRequest(payload, id, { status: 'rejected' })
    await recordEvent(payload, { type: 'site.publish_rejected', summary: `Rejected: ${r.title ?? ''}`, refCollection: 'hq-publish-requests', refId: id })
    return `✖️ Not published. The draft stays a draft.`
  }

  const collection = r.collection as Publishable
  const latest = (await payload
    .findByID({ collection: collection as CollectionSlug, id: r.targetId, draft: true, depth: 0, overrideAccess: true })
    .catch(() => null)) as Doc | null
  if (!latest) {
    await setRequest(payload, id, { status: 'failed', error: 'The document no longer exists.' })
    return `#${id}: the document no longer exists.`
  }
  if (String(latest.updatedAt ?? '') !== (r.draftStamp ?? '')) {
    // Edited after this preview: show what would actually go out instead.
    await setRequest(payload, id, { status: 'stale' })
    try {
      const again = await requestPublish(payload, { collection, id: r.targetId, reason: r.reason ?? undefined })
      return `The draft changed after this preview, so nothing was published. The current version is #${again.requestId}.`
    } catch (err) {
      return `The draft changed after this preview, so nothing was published (${esc(err instanceof Error ? err.message : String(err))}).`
    }
  }

  try {
    // Publishing builds on the latest version — the draft just checked — so
    // this publishes exactly what the owner was shown, in every language.
    await payload.update({
      collection: collection as CollectionSlug,
      id: r.targetId,
      data: { _status: 'published' } as never,
      draft: false,
      depth: 0,
      overrideAccess: true,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setRequest(payload, id, { status: 'failed', error: message })
    return `⚠️ Not published: ${esc(message)}`
  }

  await setRequest(payload, id, { status: 'published', error: null })
  await recordEvent(payload, {
    type: 'site.published',
    summary: `Published: ${r.title ?? ''}`,
    refCollection: collection,
    refId: r.targetId,
  })
  return `🌐 Published: ${esc(r.title ?? '')}`
}

/** Where a request stands, for Claude. */
export async function publishStatus(payload: Payload, id: number) {
  const r = await payload
    .findByID({ collection: 'hq-publish-requests', id, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!r) return { requestId: id, status: 'not found' }
  return { requestId: r.id, title: r.title, status: r.status, error: r.error ?? null }
}
