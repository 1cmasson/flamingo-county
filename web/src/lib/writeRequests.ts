import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import type { HqWriteRequest } from '../payload-types'
import { miamiTime, recordEvent } from './hq'
import { clip, esc, notifyOwner, resolveButtons, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'

/**
 * The permission-code protocol for changes to the public site.
 *
 *   1. Claude calls `hqRequestWrite` with the exact change. Nothing is written.
 *   2. The owner gets it in Telegram as a field-by-field diff, with Approve /
 *      Reject.
 *   3. Approve sends a one-time code to the owner's chat — and nowhere else:
 *      not to the database (an HMAC of it only), not to the event log, not to
 *      any tool response.
 *   4. The owner gives Claude the code. `hqApplyWrite(requestId, code)` writes
 *      the stored change, exactly as approved. It takes no data of its own.
 *
 * Refusals are the point, so they are all here: no approval, wrong code (five
 * tries, then the request locks), expired code, a request already used, a page
 * edited since the request was made, a newer request for the same page.
 */

/** Collections Claude may ask to change. Everything else is refused outright. */
export const WRITABLE = ['events', 'weekly-events', 'stories', 'spotlights', 'listings'] as const
export type Writable = (typeof WRITABLE)[number]

const LOCALES = ['es', 'en'] as const
type Locale = (typeof LOCALES)[number]
export type LocaleData = Partial<Record<Locale, Record<string, unknown>>>

const REQUEST_TTL_MS = 72 * 3_600_000
/** Long enough to approve on the phone and paste later; the attempt lock does the real work. */
const CODE_TTL_MS = 4 * 3_600_000
export const MAX_ATTEMPTS = 5
const MAX_BYTES = 50_000
const NEVER_WRITABLE = new Set(['id', 'createdAt', 'updatedAt'])

/** No 0/O, 1/I/L: the code is read off a phone and typed. ~40 bits over 8 characters. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newCode(): string {
  let s = ''
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

/** Case, spaces and dashes don't matter: `abcd efgh` is `ABCD-EFGH`. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Keyed with the Payload secret and bound to the request id, so a stored hash
 * is useless without the secret and a code for one request opens no other.
 */
export function codeHash(secret: string, requestId: number | string, code: string): string {
  return createHmac('sha256', secret).update(`${requestId}:${normalizeCode(code)}`).digest('hex')
}

function codeMatches(secret: string, request: Pick<HqWriteRequest, 'id' | 'codeHash'>, code: string): boolean {
  if (!request.codeHash) return false
  const a = Buffer.from(codeHash(secret, request.id, code), 'hex')
  const b = Buffer.from(request.codeHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

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
  if (v === null || v === undefined || v === '') return '∅'
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

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** One line per field that changes, `old → new`, and a warning for the dangerous ones. */
export function diffLines(
  collection: string,
  operation: 'create' | 'update',
  locales: LocaleData,
  current: Partial<Record<Locale, Record<string, unknown>>> = {},
): { lines: string[]; warnings: string[]; changes: number } {
  const lines: string[] = []
  const warnings = new Set<string>()
  let changes = 0
  for (const locale of LOCALES) {
    const data = locales[locale]
    if (!data) continue
    for (const [field, next] of Object.entries(data)) {
      const prev = current[locale]?.[field]
      if (operation === 'update' && same(prev, next)) continue
      changes++
      lines.push(
        operation === 'update'
          ? `• ${field} (${locale}): ${formatValue(prev)} → ${formatValue(next)}`
          : `• ${field} (${locale}): ${formatValue(next)}`,
      )
      if (field === 'slug' && operation === 'update') {
        warnings.add('⚠️ Changes the URL — existing links to this page will break.')
      }
      if (collection === 'listings' && field === 'publicationStatus') {
        warnings.add(
          next === 'ready'
            ? '⚠️ Marks the listing "ready": that claims every field traces to a real source.'
            : '⚠️ Changes how sourced this listing is marked.',
        )
      }
    }
  }
  return { lines, warnings: [...warnings], changes }
}

/* ------------------------------------------------------------------------ */
/* 1. Request                                                                */
/* ------------------------------------------------------------------------ */

const keyboard = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: '✅ Approve — send me a code', callback_data: `wr:a:${id}` },
      { text: '✖️ Reject', callback_data: `wr:r:${id}` },
    ],
  ],
})

export function parseWriteCallback(data: string | undefined): { action: 'approve' | 'reject'; id: number } | null {
  const m = /^wr:([ar]):(\d+)$/.exec(data ?? '')
  return m ? { action: m[1] === 'a' ? 'approve' : 'reject', id: Number(m[2]) } : null
}

function titleOf(doc: Record<string, unknown> | undefined): string {
  const t = doc?.title ?? doc?.name ?? doc?.slug
  return typeof t === 'string' ? t : ''
}

const setRequest = (payload: Payload, id: number, data: Partial<HqWriteRequest>) =>
  payload.update({ collection: 'hq-write-requests', id, data, overrideAccess: true })

export type WriteRequestInput = {
  collection: string
  operation: string
  id?: string | number
  locales: LocaleData
  reason?: string
}

/**
 * Validate and file a request, and put it in front of the owner. Writes
 * nothing to the site. Throws a plain-language error for anything refused.
 */
export async function requestWrite(payload: Payload, input: WriteRequestInput, now: Date = new Date()) {
  if (!(WRITABLE as readonly string[]).includes(input.collection)) {
    throw new Error(`"${input.collection}" can't be changed this way. Allowed: ${WRITABLE.join(', ')}.`)
  }
  const collection = input.collection as Writable
  if (input.operation !== 'create' && input.operation !== 'update') throw new Error('operation must be create or update.')
  const operation = input.operation
  if (operation === 'update' && (input.id === undefined || input.id === '')) throw new Error('An update needs the document id.')
  if (!telegramConfigured()) throw new Error('Telegram is not configured, so the owner cannot be asked. Nothing was filed.')

  const locales: LocaleData = {}
  for (const l of LOCALES) if (input.locales?.[l] && Object.keys(input.locales[l]!).length) locales[l] = input.locales[l]
  if (!Object.keys(locales).length) throw new Error('Give the change under locales.es and/or locales.en.')
  if (JSON.stringify(locales).length > MAX_BYTES) throw new Error('That change is too large for one request.')

  const known = new Set(
    payload.collections[collection].config.flattenedFields.map((f) => f.name).filter((n) => !NEVER_WRITABLE.has(n)),
  )
  for (const [l, data] of Object.entries(locales)) {
    const bad = Object.keys(data!).filter((k) => !known.has(k))
    if (bad.length) throw new Error(`Unknown or protected field(s) in ${l}: ${bad.join(', ')}.`)
  }

  const current: Partial<Record<Locale, Record<string, unknown>>> = {}
  let target: Record<string, unknown> | undefined
  if (operation === 'update') {
    for (const l of LOCALES) {
      if (!locales[l]) continue
      const doc = (await payload
        .findByID({
          collection: collection as CollectionSlug,
          id: input.id as string | number,
          locale: l,
          fallbackLocale: false as never,
          depth: 0,
          overrideAccess: true,
        })
        .catch(() => null)) as Record<string, unknown> | null
      if (!doc) throw new Error(`No ${collection} document with id ${input.id}.`)
      current[l] = doc
      target = doc
    }
  }

  const { lines, warnings, changes } = diffLines(collection, operation, locales, current)
  if (!changes) throw new Error('That would change nothing.')

  const label =
    operation === 'update'
      ? `Update ${collection} #${input.id}${titleOf(target) ? ` “${titleOf(target)}”` : ''}`
      : `Create ${collection}${titleOf(locales.es ?? locales.en) ? ` “${titleOf(locales.es ?? locales.en)}”` : ''}`

  // A newer request for the same page — or a create with the same title —
  // replaces the older one, so a stale version can never be approved.
  const older = await payload.find({
    collection: 'hq-write-requests',
    where: {
      and: [
        { collection: { equals: collection } },
        { status: { in: ['pending', 'approved'] } },
        operation === 'update'
          ? { targetId: { equals: String(input.id) } }
          : { and: [{ operation: { equals: 'create' } }, { title: { equals: label } }] },
      ],
    },
    depth: 0,
    limit: 20,
    overrideAccess: true,
  })

  const request = await payload.create({
    collection: 'hq-write-requests',
    data: {
      status: 'pending',
      title: label,
      collection,
      operation,
      targetId: operation === 'update' ? String(input.id) : undefined,
      targetUpdatedAt: operation === 'update' ? String(target?.updatedAt ?? '') : undefined,
      reason: input.reason?.slice(0, 500),
      locales,
      preview: [...warnings, ...lines].join('\n'),
      attempts: 0,
      expiresAt: new Date(now.getTime() + REQUEST_TTL_MS).toISOString(),
    },
    overrideAccess: true,
  })

  const text = [
    `<b>✍️ Site change #${request.id}</b>`,
    esc(label),
    ...(input.reason ? [`<i>${esc(clip(input.reason, 300))}</i>`] : []),
    ...warnings.map(esc),
    '',
    ...lines.map(esc),
  ].join('\n')
  let sent: { message_id: number }
  try {
    sent = await sendMessage(text, { keyboard: keyboard(request.id) })
  } catch (err) {
    // The owner never saw it, so it can never be approved: close it, and
    // leave any older request for the same page untouched.
    await setRequest(payload, request.id, { status: 'failed', error: 'Could not reach Telegram.' })
    throw new Error(`Could not reach the owner on Telegram, so nothing was filed (${err instanceof Error ? err.message : err}).`)
  }
  await setRequest(payload, request.id, { telegramMessageId: sent.message_id })

  for (const old of older.docs) {
    await setRequest(payload, old.id, { status: 'superseded', codeHash: null })
    if (old.telegramMessageId) {
      await resolveButtons(ownerChat(), old.telegramMessageId, `Replaced by request #${request.id}.`).catch(() => undefined)
    }
  }

  await recordEvent(payload, {
    type: 'site.write_requested',
    summary: `Claude asked: ${label}`,
    refCollection: 'hq-write-requests',
    refId: request.id,
  })
  return { requestId: request.id, title: label, changes, expiresAt: request.expiresAt }
}

const ownerChat = () => process.env.TELEGRAM_OWNER_CHAT_ID as string

/* ------------------------------------------------------------------------ */
/* 2–3. Approve (Telegram) and the code                                      */
/* ------------------------------------------------------------------------ */

async function load(payload: Payload, id: number) {
  return payload
    .findByID({ collection: 'hq-write-requests', id, depth: 0, overrideAccess: true })
    .catch(() => null)
}

function expired(r: HqWriteRequest, now: Date) {
  return r.expiresAt ? new Date(r.expiresAt).getTime() < now.getTime() : false
}

/**
 * Issue a fresh code for a request the owner approves (or re-approves with
 * `/code <id>`). Returns the Telegram text carrying the code — the only place
 * it ever exists in plain form — and a `revert` to call if that message could
 * not be delivered, so no request sits approved behind a code nobody has.
 */
export async function issueCode(
  payload: Payload,
  id: number,
  now: Date = new Date(),
): Promise<{ text: string; revert?: () => Promise<void> }> {
  const r = await load(payload, id)
  if (!r) return { text: `No site change #${id}.` }
  if (r.status !== 'pending' && r.status !== 'approved') return { text: `Site change #${id} is ${r.status}; no code issued.` }
  if (expired(r, now)) {
    await setRequest(payload, id, { status: 'expired', codeHash: null })
    return { text: `Site change #${id} expired. Ask Claude to file it again.` }
  }

  const code = newCode()
  const previous = { status: r.status, codeHash: r.codeHash, codeExpiresAt: r.codeExpiresAt }
  await setRequest(payload, id, {
    status: 'approved',
    codeHash: codeHash(payload.secret, id, code),
    codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
  })
  await recordEvent(payload, {
    type: 'site.write_approved',
    summary: `Approved site change #${id}: ${r.title ?? ''}`,
    refCollection: 'hq-write-requests',
    refId: id,
  })
  return {
    text: [
      `✅ Approved site change #${id}.`,
      `Code: <code>${code}</code>`,
      `Give it to Claude to apply. Single use, valid until ${esc(miamiTime(new Date(now.getTime() + CODE_TTL_MS)))}.`,
      `/code ${id} sends a new one (the old one stops working).`,
    ].join('\n'),
    revert: async () => {
      await setRequest(payload, id, { ...previous, status: previous.status as HqWriteRequest['status'] })
    },
  }
}

export async function rejectWrite(payload: Payload, id: number): Promise<string> {
  const r = await load(payload, id)
  if (!r) return `No site change #${id}.`
  if (r.status !== 'pending' && r.status !== 'approved') return `Site change #${id} is already ${r.status}.`
  await setRequest(payload, id, { status: 'rejected', codeHash: null })
  await recordEvent(payload, {
    type: 'site.write_rejected',
    summary: `Rejected site change #${id}: ${r.title ?? ''}`,
    refCollection: 'hq-write-requests',
    refId: id,
  })
  return `✖️ Site change #${id} rejected. Nothing was written.`
}

/* ------------------------------------------------------------------------ */
/* 4. Apply                                                                  */
/* ------------------------------------------------------------------------ */

const applying = new Set<number>()

/**
 * Write an approved change, given its code. Writes only what was stored at
 * request time. Every refusal says why, and none reveals anything about the
 * code beyond "wrong".
 */
export async function applyWrite(req: PayloadRequest, id: number, code: string, now: Date = new Date()): Promise<string> {
  // One process serves every request (SQLite pins the service to a single
  // instance), so this stops two calls with the right code both writing.
  if (applying.has(id)) return `Site change #${id} is already being applied.`
  applying.add(id)
  try {
    return await apply(req, id, code, now)
  } finally {
    applying.delete(id)
  }
}

async function apply(req: PayloadRequest, id: number, code: string, now: Date): Promise<string> {
  const { payload } = req
  const r = await load(payload, id)
  if (!r) return `No site change #${id}.`
  if (r.status === 'pending') return `Site change #${id} hasn't been approved. The owner approves it in Telegram and gives you the code.`
  if (r.status !== 'approved') return `Site change #${id} is ${r.status}. File a new request if it's still needed.`
  if ((r.attempts ?? 0) >= MAX_ATTEMPTS) return `Site change #${id} is locked.`
  if (!r.codeExpiresAt || new Date(r.codeExpiresAt).getTime() < now.getTime()) {
    return `The code for site change #${id} has expired. The owner can send /code ${id} for a new one.`
  }

  if (!codeMatches(payload.secret, r, code)) {
    const attempts = (r.attempts ?? 0) + 1
    if (attempts >= MAX_ATTEMPTS) {
      await setRequest(payload, id, { attempts, status: 'locked', codeHash: null })
      await recordEvent(
        payload,
        { type: 'site.write_locked', summary: `Site change #${id} locked after ${attempts} wrong codes`, refCollection: 'hq-write-requests', refId: id },
        { ping: `🔒 Site change #${id} locked after ${attempts} wrong codes. Nothing was written.` },
      )
      return `Wrong code. Site change #${id} is now locked.`
    }
    await setRequest(payload, id, { attempts })
    return `Wrong code. ${MAX_ATTEMPTS - attempts} tries left.`
  }

  // Right code: spend it before writing anything.
  await setRequest(payload, id, { status: 'applying', codeHash: null })
  const collection = r.collection as Writable
  const locales = r.locales as LocaleData
  const order = LOCALES.filter((l) => locales[l])

  try {
    if (r.operation === 'update') {
      const fresh = (await payload
        .findByID({ collection: collection as CollectionSlug, id: r.targetId!, depth: 0, overrideAccess: true })
        .catch(() => null)) as { updatedAt?: string } | null
      if (!fresh) throw new Error('The document no longer exists.')
      if (String(fresh.updatedAt ?? '') !== (r.targetUpdatedAt ?? '')) {
        await setRequest(payload, id, { status: 'stale', error: 'Changed since the request was made.' })
        return `The page changed after site change #${id} was requested, so nothing was written. File a new request against the current version.`
      }
    }

    let docId: string | number | undefined = r.operation === 'update' ? r.targetId! : undefined
    const done: Locale[] = []
    for (const locale of order) {
      try {
        if (docId === undefined) {
          const created = await payload.create({
            collection: collection as CollectionSlug,
            data: locales[locale] as never,
            locale,
            req,
            overrideAccess: false,
          })
          docId = created.id
        } else {
          await payload.update({
            collection: collection as CollectionSlug,
            id: docId,
            data: locales[locale] as never,
            locale,
            req,
            overrideAccess: false,
          })
        }
        done.push(locale)
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err)
        throw new Error(done.length ? `${why} (the ${done.join(', ')} version was already written)` : why)
      }
    }

    await setRequest(payload, id, { status: 'applied', appliedDocId: String(docId), error: null })
    await recordEvent(
      payload,
      { type: 'site.write_applied', summary: `Applied site change #${id}: ${r.title ?? ''}`, refCollection: collection, refId: docId },
      { ping: `🟢 Applied site change #${id}: ${esc(r.title ?? '')}` },
    )
    return `Applied site change #${id}: ${r.title ?? ''} (${collection} #${docId}).`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setRequest(payload, id, { status: 'failed', error: message })
    void notifyOwner(`⚠️ Site change #${id} failed: ${esc(message)}`)
    return `Site change #${id} failed: ${message}`
  }
}

/** Status for Claude. Never includes anything about the code but whether it is still valid. */
export async function writeStatus(payload: Payload, id: number) {
  const r = await load(payload, id)
  if (!r) return { requestId: id, status: 'not found' }
  return {
    requestId: r.id,
    title: r.title,
    status: r.status,
    codeValidUntil: r.status === 'approved' ? r.codeExpiresAt : null,
    triesLeft: r.status === 'approved' ? MAX_ATTEMPTS - (r.attempts ?? 0) : null,
    appliedDocId: r.appliedDocId ?? null,
    error: r.error ?? null,
  }
}
