import type { Payload } from 'payload'

import { buildBrief } from './brief'
import { decideDraft, parseDraftCallback } from './hq'
import { answerCallback, esc, ownerChatId, resolveButtons, sendMessage } from './telegram'

/** The slice of a Telegram `Update` the bot reads. */
export type TelegramUpdate = {
  message?: { chat: { id: number; type?: string }; from?: { id: number }; text?: string }
  callback_query?: {
    id: string
    from: { id: number }
    data?: string
    message?: { chat: { id: number; type?: string }; message_id: number }
  }
}

const HELP = [
  '<b>Flamingo HQ</b>',
  '/brief — the brief, right now',
  '/inbox — new events',
  '/seen — mark every new event seen',
  '/done &lt;id&gt; — mark one event done',
  '/tasks — open tasks',
  '/task &lt;text&gt; — file a task for Claude',
].join('\n')

/**
 * Only the owner, in the owner's own one-to-one chat with the bot. Everyone
 * else is ignored, not refused — no reply tells a stranger the bot is alive.
 *
 * Both the sender *and* the chat must be the owner. Checking the sender alone
 * would let the owner's `/brief` typed in a group, or a button tapped there,
 * be answered into that group. In a private chat Telegram makes the chat id
 * the user's id, so `chat.id === owner` pins it to that one conversation.
 */
export function isOwner(update: TelegramUpdate): boolean {
  const owner = ownerChatId()
  if (!owner) return false
  const from = update.message?.from?.id ?? update.callback_query?.from.id
  const chat = update.message?.chat ?? update.callback_query?.message?.chat
  return (
    from !== undefined &&
    String(from) === owner &&
    chat !== undefined &&
    String(chat.id) === owner &&
    (chat.type === undefined || chat.type === 'private')
  )
}

async function inbox(payload: Payload): Promise<string> {
  const { docs, totalDocs } = await payload.find({
    collection: 'hq-events',
    where: { and: [{ status: { equals: 'new' } }, { type: { not_equals: 'brief.sent' } }] },
    sort: '-createdAt',
    limit: 15,
    depth: 0,
    overrideAccess: true,
  })
  if (!docs.length) return 'Inbox zero. 🎉'
  const lines = docs.map((e) => `<code>#${e.id}</code> ${esc(e.summary)}`)
  if (totalDocs > docs.length) lines.push(`<i>…and ${totalDocs - docs.length} more</i>`)
  return [`<b>New (${totalDocs})</b>`, ...lines].join('\n')
}

async function tasks(payload: Payload): Promise<string> {
  const { docs } = await payload.find({
    collection: 'hq-tasks',
    where: { status: { not_equals: 'done' } },
    sort: 'dueAt',
    limit: 20,
    depth: 0,
    overrideAccess: true,
  })
  if (!docs.length) return 'No open tasks.'
  return [
    '<b>Open tasks</b>',
    ...docs.map((t) => `<code>#${t.id}</code> ${esc(t.title)}${t.assignee === 'claude' ? ' 🤖' : ''}`),
  ].join('\n')
}

async function command(payload: Payload, text: string): Promise<string> {
  const [cmd, ...rest] = text.trim().split(/\s+/)
  const arg = rest.join(' ')
  // `/brief@FlamingoHQBot` in a group; the bare command in a DM.
  switch (cmd.split('@')[0].toLowerCase()) {
    case '/brief':
      // On demand, so not logged as `brief.sent`: asking for it at noon must
      // not shrink tomorrow morning's window.
      return buildBrief(payload)
    case '/inbox':
      return inbox(payload)
    case '/seen': {
      const res = await payload.update({
        collection: 'hq-events',
        where: { status: { equals: 'new' } },
        data: { status: 'seen' },
        overrideAccess: true,
      })
      return `Marked ${res.docs.length} event${res.docs.length === 1 ? '' : 's'} seen.`
    }
    case '/done': {
      const id = Number(arg.replace(/^#/, ''))
      if (!Number.isInteger(id) || id <= 0) return 'Usage: /done &lt;event id&gt;'
      const ok = await payload
        .update({ collection: 'hq-events', id, data: { status: 'done' }, overrideAccess: true })
        .then(() => true)
        .catch(() => false)
      return ok ? `Event #${id} done.` : `No event #${id}.`
    }
    case '/tasks':
      return tasks(payload)
    case '/task': {
      if (!arg) return 'Usage: /task &lt;what needs doing&gt;'
      const task = await payload.create({
        collection: 'hq-tasks',
        data: { title: arg.slice(0, 200), detail: arg.length > 200 ? arg : undefined, assignee: 'claude', status: 'open' },
        overrideAccess: true,
      })
      return `🤖 Filed task #${task.id} for Claude.`
    }
    default:
      return HELP
  }
}

/**
 * Handle one webhook update. Returns nothing — every answer goes out as its
 * own Bot API call, so the webhook can always reply 200 and Telegram never
 * retries an update that was handled.
 */
export async function handleUpdate(payload: Payload, update: TelegramUpdate): Promise<void> {
  if (!isOwner(update)) return

  const cb = update.callback_query
  if (cb) {
    const parsed = parseDraftCallback(cb.data)
    if (!parsed || !cb.message) {
      await answerCallback(cb.id)
      return
    }
    // Answer first: Telegram shows a spinner on the button until it hears back,
    // and a Postiz upload can take a while.
    await answerCallback(cb.id, parsed.action === 'approve' ? 'Scheduling…' : 'Rejecting…')
    const outcome = await decideDraft(payload, parsed.id, parsed.action)
    await resolveButtons(cb.message.chat.id, cb.message.message_id, outcome)
    return
  }

  const text = update.message?.text
  if (!text || !update.message) return
  const reply = text.startsWith('/') ? await command(payload, text) : HELP
  // To the owner's chat by id, never to wherever the update came from.
  await sendMessage(reply)
}
