import { createHash } from 'node:crypto'
import type { Payload } from 'payload'

import type { HqSpendApproval } from '../payload-types'
import { recordEvent } from './hq'
import { clip, esc, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'

/**
 * Paid steps wait for the owner's yes.
 *
 *   1. On his machine a Claude Code hook (~/.claude/hooks/fal-gate.py) blocks a
 *      metered command: a fal call, or more than 15 images for one story.
 *   2. Claude files that exact command here with a reason and a cost
 *      (`hqRequestSpendApproval`). The owner gets it in Telegram with Yes / No.
 *   3. On Yes, the hook's next sight of that exact command redeems the
 *      approval (`hqRedeemSpendApproval`) and lets it run, once.
 *
 * The tap is the permission: the webhook only acts for the owner's own chat,
 * and no MCP tool can mark a request approved (`hq-spend-approvals` is not in
 * the MCP plugin's list, and its fields are `humanOnly`). Redeeming is bound to
 * the sha256 of the command, so an approval for one command can't run another.
 */

const TTL_MS = 6 * 3_600_000 // long enough for a phone tap, short enough not to linger

export function hashCommand(command: string): string {
  return createHash('sha256').update(command.trim()).digest('hex')
}

const keyboard = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: '✅ Yes, run it', callback_data: `sp:a:${id}` },
      { text: '✖️ No', callback_data: `sp:d:${id}` },
    ],
  ],
})

export function parseSpendCallback(data: string | undefined): { action: 'approve' | 'decline'; id: number } | null {
  const m = /^sp:([ad]):(\d+)$/.exec(data ?? '')
  return m ? { action: m[1] === 'a' ? 'approve' : 'decline', id: Number(m[2]) } : null
}

const set = (payload: Payload, id: number, data: Partial<HqSpendApproval>) =>
  payload.update({ collection: 'hq-spend-approvals', id, data, overrideAccess: true })

/** File a paid step for the owner. Approves nothing by itself. */
export async function requestSpend(
  payload: Payload,
  input: { command: string; reason: string; cost?: string },
  now: Date = new Date(),
) {
  const command = (input.command ?? '').trim()
  const reason = (input.reason ?? '').trim()
  if (!command) throw new Error('Give the exact command the hook blocked.')
  if (!reason) throw new Error('Say in plain words what this is and why.')
  if (!telegramConfigured()) throw new Error('Telegram is not configured, so the owner cannot be asked. Nothing was filed.')

  const request = await payload.create({
    collection: 'hq-spend-approvals',
    data: {
      status: 'pending',
      reason: reason.slice(0, 300),
      cost: input.cost?.trim().slice(0, 80) || undefined,
      command,
      commandHash: hashCommand(command),
      expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    },
    overrideAccess: true,
  })

  const text = [
    `<b>💸 Run this? #${request.id}</b>`,
    esc(request.reason),
    ...(request.cost ? [`Cost: <b>${esc(request.cost)}</b>`] : []),
    '',
    // The exact command, so a summary that doesn't match it is visible.
    `<code>${esc(clip(command, 900))}</code>`,
    '',
    '<i>Runs once, only this exact command. Expires in 6 hours.</i>',
  ].join('\n')

  let sent: { message_id: number }
  try {
    sent = await sendMessage(text, { keyboard: keyboard(request.id) })
  } catch (err) {
    await set(payload, request.id, { status: 'expired' })
    throw new Error(`Could not reach the owner on Telegram, so nothing was filed (${err instanceof Error ? err.message : err}).`)
  }
  await set(payload, request.id, { telegramMessageId: sent.message_id })
  await recordEvent(payload, {
    type: 'spend.requested',
    summary: `Claude asked to run a paid step: ${request.reason}`,
    refCollection: 'hq-spend-approvals',
    refId: request.id,
  })
  return { requestId: request.id, expiresAt: request.expiresAt }
}

const busy = new Set<string>()

/**
 * Serialise by key. One process serves every request (SQLite pins the service
 * to a single instance), so this stops a double tap or two redeems racing.
 */
async function locked<T>(key: string, fn: () => Promise<T>, whenBusy: T): Promise<T> {
  if (busy.has(key)) return whenBusy
  busy.add(key)
  try {
    return await fn()
  } finally {
    busy.delete(key)
  }
}

const expired = (r: Pick<HqSpendApproval, 'expiresAt'>, now: Date) =>
  Boolean(r.expiresAt && new Date(r.expiresAt).getTime() < now.getTime())

/** The owner's tap. Returns the one-line outcome for Telegram. */
export function decideSpend(payload: Payload, id: number, action: 'approve' | 'decline', now: Date = new Date()): Promise<string> {
  return locked(
    `decide:${id}`,
    async () => {
      const r = await payload.findByID({ collection: 'hq-spend-approvals', id, depth: 0, overrideAccess: true }).catch(() => null)
      if (!r) return `No request #${id}.`
      if (r.status !== 'pending') return `#${id} is already ${r.status}.`
      if (expired(r, now)) {
        await set(payload, id, { status: 'expired' })
        return `#${id} expired. Claude has to ask again.`
      }
      const approve = action === 'approve'
      await set(payload, id, { status: approve ? 'approved' : 'declined', decidedAt: now.toISOString() })
      await recordEvent(payload, {
        type: approve ? 'spend.approved' : 'spend.declined',
        summary: `${approve ? 'Approved' : 'Declined'}: ${r.reason}`,
        refCollection: 'hq-spend-approvals',
        refId: id,
      })
      return approve ? `✅ Approved once: ${esc(r.reason)}` : `✖️ Declined. It won't run.`
    },
    `#${id} is already being handled.`,
  )
}

/**
 * The hook's check: is there an approved, unexpired, unused request for this
 * exact command? If so, mark it used and say yes. One approval, one run.
 */
export function redeemSpend(payload: Payload, command: string, now: Date = new Date()): Promise<{ ok: boolean; requestId?: number }> {
  const commandHash = hashCommand(command ?? '')
  return locked(
    `redeem:${commandHash}`,
    async () => {
      const { docs } = await payload.find({
        collection: 'hq-spend-approvals',
        where: { and: [{ commandHash: { equals: commandHash } }, { status: { equals: 'approved' } }] },
        sort: 'createdAt',
        depth: 0,
        limit: 10,
        overrideAccess: true,
      })
      for (const r of docs) {
        if (expired(r, now)) {
          await set(payload, r.id, { status: 'expired' })
          continue
        }
        await set(payload, r.id, { status: 'used', usedAt: now.toISOString() })
        await recordEvent(payload, {
          type: 'spend.used',
          summary: `Ran: ${r.reason}`,
          refCollection: 'hq-spend-approvals',
          refId: r.id,
        })
        return { ok: true, requestId: r.id }
      }
      return { ok: false }
    },
    { ok: false },
  )
}

/** Where a request stands, for Claude. */
export async function spendStatus(payload: Payload, id: number, now: Date = new Date()) {
  const r = await payload.findByID({ collection: 'hq-spend-approvals', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!r) return { requestId: id, status: 'not found' }
  const status = (r.status === 'pending' || r.status === 'approved') && expired(r, now) ? 'expired' : r.status
  return { requestId: r.id, status, reason: r.reason, cost: r.cost ?? null }
}
