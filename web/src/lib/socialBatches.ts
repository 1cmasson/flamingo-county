import type { Payload } from 'payload'

import type { HqMedia, HqSocialBatch, HqSocialDraft } from '../payload-types'
import { decideDraft, draftFingerprint, miamiTime, recordEvent } from './hq'
import { facebookProblem, languageProblem, singleEventProblem, storyProblem } from './postiz'
import { MESSAGE_LIMIT, clearButtons, esc, ownerChatId, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'

/**
 * One tap for a week of posts.
 *
 *   1. Claude creates the drafts as usual; each gets its own Telegram preview
 *      (the full caption and the cover file) with Approve / Reject.
 *   2. `hqRequestSocialBatch` lists them in one message with Approve all /
 *      Reject all, holding each draft's fingerprint as previewed.
 *   3. Approve all runs every draft through the same Approve as its own
 *      button (`decideDraft`), against that fingerprint: a draft edited since
 *      the list went out is skipped, never posted unseen.
 *
 * The tap is the permission, exactly as for one draft: the webhook acts only
 * for the owner, and no MCP tool can approve a batch (`hq-social-batches` is
 * not exposed over MCP, and every field is `humanOnly`).
 */

export const BATCH_MIN = 2
export const BATCH_MAX = 20
const BATCH_TTL_MS = 72 * 3_600_000

export function batchCallback(action: 'approve' | 'reject', id: number): string {
  return `sb:${action === 'approve' ? 'a' : 'r'}:${id}`
}

export function parseBatchCallback(data: string | undefined): { action: 'approve' | 'reject'; id: number } | null {
  const m = /^sb:([ar]):(\d+)$/.exec(data ?? '')
  return m ? { action: m[1] === 'a' ? 'approve' : 'reject', id: Number(m[2]) } : null
}

const keyboard = (id: number, count: number): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: `✅ Approve all ${count}`, callback_data: batchCallback('approve', id) },
      { text: '✖️ Reject all', callback_data: batchCallback('reject', id) },
    ],
  ],
})

const LANGUAGE: Record<string, string> = { es: 'ES', en: 'EN', both: 'ES+EN' }

const firstLine = (caption: string) => {
  const line = caption.split('\n').find((l) => l.trim())?.trim() ?? ''
  return line.length > 70 ? `${line.slice(0, 69).trimEnd()}…` : line
}

/** "🎬 video", "🖼 photo", "🖼 3 files": what the first file is, and how many. */
function filesLabel(cover: HqMedia | undefined, count: number): string {
  if (!count) return 'no file'
  const kind = cover?.mimeType?.startsWith('video/') ? '🎬 video' : '🖼 photo'
  return count === 1 ? kind : `${kind} +${count - 1}`
}

/** One draft's two lines in the list. Exported for the tests. */
export function batchLine(n: number, draft: HqSocialDraft, cover: HqMedia | undefined, adminBase?: string): string {
  const id = adminBase
    ? `<a href="${esc(`${adminBase}/admin/collections/hq-social-drafts/${draft.id}`)}">#${draft.id}</a>`
    : `#${draft.id}`
  const parts = [
    id,
    ...(draft.format === 'story' ? ['📲 story'] : []),
    (draft.platforms ?? []).join(' + '),
    ...(draft.language ? [LANGUAGE[draft.language] ?? draft.language] : []),
    miamiTime(draft.scheduledFor),
    filesLabel(cover, draft.media?.length ?? 0),
  ]
  return `${n}. ${parts.map((p, i) => (i === 0 ? p : esc(p))).join(' · ')}\n    ${esc(firstLine(draft.caption ?? ''))}`
}

const setBatch = (payload: Payload, id: number, data: Partial<HqSocialBatch>) =>
  payload.update({ collection: 'hq-social-batches', id, data, overrideAccess: true })

/**
 * Ask the owner to approve several drafts with one tap. Approves nothing.
 * Throws a plain-language error for anything refused, before filing.
 */
export async function requestSocialBatch(
  payload: Payload,
  input: { draftIds: number[]; note?: string },
  now: Date = new Date(),
) {
  const ids = [...new Set(input.draftIds.map(Number))]
  if (ids.length < BATCH_MIN) throw new Error(`A batch needs at least ${BATCH_MIN} different drafts.`)
  if (ids.length > BATCH_MAX) throw new Error(`At most ${BATCH_MAX} drafts per batch; split it in two.`)
  if (!telegramConfigured()) throw new Error('Telegram is not configured, so the owner cannot be asked. Nothing was filed.')

  const { docs } = await payload.find({
    collection: 'hq-social-drafts',
    where: { id: { in: ids } },
    limit: ids.length,
    depth: 0,
    overrideAccess: true,
  })
  const problems: string[] = []
  const drafts: HqSocialDraft[] = []
  for (const id of ids) {
    const d = docs.find((x) => x.id === id) as HqSocialDraft | undefined
    if (!d) {
      problems.push(`#${id} does not exist`)
      continue
    }
    if (d.status !== 'pending') {
      problems.push(`#${id} is ${d.status}, not pending`)
      continue
    }
    // The batch approves what the owner could read in full: each draft's own
    // preview, current. It goes out a moment after the draft is saved.
    if (!d.telegramMessageId || d.previewedHash !== draftFingerprint(d)) {
      problems.push(`#${id}'s own preview hasn't gone out for this version yet (wait a few seconds and ask again)`)
      continue
    }
    const files = Array.isArray(d.media) ? d.media.length : 0
    const rule =
      facebookProblem(d.platforms, files, d.caption) ??
      storyProblem(d.format, d.platforms, files) ??
      singleEventProblem(d.format, d.caption) ??
      languageProblem(d.language, d.format, d.caption)
    if (rule) {
      problems.push(`#${id}: ${rule}`)
      continue
    }
    drafts.push(d)
  }
  if (problems.length) throw new Error(`Nothing was filed. ${problems.join('; ')}.`)

  drafts.sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
  const coverId = (d: HqSocialDraft) => {
    const m = d.media?.[0]
    return typeof m === 'object' && m ? m.id : m
  }
  const coverIds = drafts.map(coverId).filter((m): m is number => typeof m === 'number')
  const covers = coverIds.length
    ? (await payload.find({ collection: 'hq-media', where: { id: { in: coverIds } }, limit: coverIds.length, depth: 0, overrideAccess: true })).docs
    : []

  const title = `${drafts.length} posts, ${miamiTime(drafts[0].scheduledFor)} – ${miamiTime(drafts[drafts.length - 1].scheduledFor)}`
  const batch = await payload.create({
    collection: 'hq-social-batches',
    data: {
      status: 'pending',
      title,
      note: input.note?.slice(0, 300),
      items: drafts.map((d) => ({ draft: d.id, hash: draftFingerprint(d) })),
      expiresAt: new Date(now.getTime() + BATCH_TTL_MS).toISOString(),
    },
    overrideAccess: true,
  })

  const admin = process.env.BETTER_AUTH_URL
  const text = [
    `<b>✅ Approve these ${drafts.length} posts? Batch #${batch.id}</b>`,
    ...(input.note ? [`<i>${esc(input.note.slice(0, 300))}</i>`] : []),
    '',
    ...drafts.map((d, i) => batchLine(i + 1, d, covers.find((c) => c.id === coverId(d)), admin)),
    '',
    '<i>Each full preview, with its file, is above in this chat. Approve all schedules each one exactly as its own Approve would.</i>',
  ].join('\n')
  if (text.length > MESSAGE_LIMIT) {
    await setBatch(payload, batch.id, { status: 'failed', error: 'Too long for one Telegram message.' })
    throw new Error('The list is too long for one Telegram message, so nothing was filed. Send fewer drafts per batch.')
  }

  let sent: { message_id: number }
  try {
    sent = await sendMessage(text, { keyboard: keyboard(batch.id, drafts.length) })
  } catch (err) {
    await setBatch(payload, batch.id, { status: 'failed', error: 'Could not reach Telegram.' })
    throw new Error(`Could not reach the owner on Telegram, so nothing was filed (${err instanceof Error ? err.message : err}).`)
  }
  await setBatch(payload, batch.id, { telegramMessageId: sent.message_id })
  await recordEvent(payload, {
    type: 'social.batch_requested',
    summary: `Claude asked to approve ${drafts.length} drafts at once: ${drafts.map((d) => `#${d.id}`).join(' ')}`,
    refCollection: 'hq-social-batches',
    refId: batch.id,
  })
  return { batchId: batch.id, drafts: drafts.map((d) => d.id), expiresAt: batch.expiresAt }
}

const deciding = new Set<number>()

/**
 * The owner's answer for a whole batch. Returns the outcome for Telegram.
 * The status leaves `pending` before any draft is touched, so a second tap or
 * a redelivered webhook finds it already handled; the in-memory guard covers a
 * tap that lands during the read (one process serves every request).
 */
export async function decideBatch(
  payload: Payload,
  id: number,
  action: 'approve' | 'reject',
  now: Date = new Date(),
): Promise<string> {
  if (deciding.has(id)) return `Batch #${id} is already being handled.`
  deciding.add(id)
  try {
    const b = await payload.findByID({ collection: 'hq-social-batches', id, depth: 0, overrideAccess: true }).catch(() => null)
    if (!b) return `No batch #${id}.`
    if (b.status !== 'pending') return `Batch #${id} is already ${b.status}.`
    if (b.expiresAt && new Date(b.expiresAt).getTime() < now.getTime()) {
      await setBatch(payload, id, { status: 'expired' })
      return `Batch #${id} expired. Each draft can still be approved on its own preview, or ask Claude for a new batch.`
    }
    await setBatch(payload, id, { status: 'approving' })

    const items = b.items ?? []
    const lines: string[] = []
    let scheduled = 0
    for (const item of items) {
      let outcome: string
      try {
        outcome =
          action === 'approve'
            ? await decideDraft(payload, item.draft, 'approve', { shownHash: item.hash, viaBatch: true })
            : await decideDraft(payload, item.draft, 'reject')
      } catch (err) {
        outcome = `⚠️ Draft #${item.draft} failed: ${esc(err instanceof Error ? err.message : String(err))}`
      }
      if (outcome.startsWith('✅')) scheduled++
      item.outcome = outcome.replace(/<[^>]+>/g, '').slice(0, 300)
      lines.push(`• ${outcome}`)
    }

    // The drafts' own previews still carry buttons; take them away from every
    // draft this batch settled, quietly.
    const chat = ownerChatId()
    if (chat) {
      const { docs } = await payload.find({
        collection: 'hq-social-drafts',
        where: { id: { in: items.map((i) => i.draft) } },
        limit: items.length,
        depth: 0,
        overrideAccess: true,
      })
      for (const d of docs) {
        if (d.status !== 'pending' && d.telegramMessageId) await clearButtons(chat, d.telegramMessageId)
      }
    }

    await setBatch(payload, id, { status: action === 'approve' ? 'approved' : 'rejected', items })
    await recordEvent(payload, {
      type: action === 'approve' ? 'social.batch_approved' : 'social.batch_rejected',
      summary:
        action === 'approve'
          ? `Approved batch #${id}: ${scheduled} of ${items.length} scheduled`
          : `Rejected batch #${id} (${items.length} drafts)`,
      refCollection: 'hq-social-batches',
      refId: id,
    })
    const head =
      action === 'approve'
        ? `✅ Batch #${id}: ${scheduled} of ${items.length} scheduled.`
        : `✖️ Batch #${id} rejected. Nothing was sent to Postiz.`
    return [head, ...lines].join('\n')
  } finally {
    deciding.delete(id)
  }
}

/** Where a batch stands, for Claude. */
export async function socialBatchStatus(payload: Payload, id: number) {
  const b = await payload.findByID({ collection: 'hq-social-batches', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!b) return { batchId: id, status: 'not found' }
  return {
    batchId: b.id,
    status: b.status,
    items: (b.items ?? []).map((i) => ({ draft: i.draft, outcome: i.outcome ?? null })),
    error: b.error ?? null,
  }
}
