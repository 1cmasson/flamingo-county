/**
 * The HQ Telegram bot — the always-on messenger half of the ops layer.
 *
 * Deliberately a thin wrapper over the Bot API rather than a framework: the bot
 * only ever talks to one person (TELEGRAM_OWNER_CHAT_ID), it needs six methods,
 * and a dependency would buy nothing but a larger image.
 *
 * Nothing here throws into a visitor's request. Callers on the public path use
 * `notifyOwner`, which logs and swallows; only the webhook and the brief job,
 * which run on the owner's behalf, see real errors.
 */

const API = 'https://api.telegram.org'

/** Telegram's caption limit on photos and videos. Plain messages allow 4096. */
export const CAPTION_LIMIT = 1024
export const MESSAGE_LIMIT = 4096

/** Bot API upload ceilings: photos 10 MB, everything else 50 MB. */
export const PHOTO_UPLOAD_LIMIT = 10 * 1024 * 1024
export const FILE_UPLOAD_LIMIT = 50 * 1024 * 1024

export type InlineButton = { text: string; callback_data: string }
export type InlineKeyboard = { inline_keyboard: InlineButton[][] }

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_OWNER_CHAT_ID)
}

export function ownerChatId(): string | undefined {
  return process.env.TELEGRAM_OWNER_CHAT_ID || undefined
}

/** Escape for `parse_mode: 'HTML'` — the only three characters Telegram cares about. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Trim to Telegram's limit on the *rendered* text. Cuts the raw HTML, so it can
 * only be used on text whose tags close before the cut — callers put the
 * free-form part (a caption, a story) last for exactly that reason.
 */
export function clip(s: string, limit: number): string {
  return s.length <= limit ? s : s.slice(0, limit - 1) + '…'
}

async function call<T = unknown>(method: string, body: Record<string, unknown> | FormData): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')

  const isForm = body instanceof FormData
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body),
    // Uploads of a 50 MB video need longer than a text ping.
    signal: AbortSignal.timeout(isForm ? 60_000 : 10_000),
  })
  const json = (await res.json().catch(() => null)) as
    | { ok: true; result: T }
    | { ok: false; description?: string }
    | null
  if (!json?.ok) {
    const why = json && 'description' in json ? json.description : `HTTP ${res.status}`
    throw new Error(`Telegram ${method} failed: ${why}`)
  }
  return json.result
}

type SentMessage = { message_id: number }

export async function sendMessage(
  text: string,
  opts: { chatId?: string | number; keyboard?: InlineKeyboard } = {},
): Promise<SentMessage> {
  return call<SentMessage>('sendMessage', {
    chat_id: opts.chatId ?? ownerChatId(),
    text: clip(text, MESSAGE_LIMIT),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: opts.keyboard,
  })
}

/**
 * Send a photo or video as an upload, not a URL. HQ media is admin-only, so
 * Telegram could not fetch it by URL anyway — and uploads raise the ceiling
 * from 5/20 MB to 10/50 MB.
 */
export async function sendMedia(args: {
  kind: 'photo' | 'video'
  file: Blob
  filename: string
  caption: string
  keyboard?: InlineKeyboard
  chatId?: string | number
}): Promise<SentMessage> {
  const form = new FormData()
  form.set('chat_id', String(args.chatId ?? ownerChatId()))
  form.set(args.kind, args.file, args.filename)
  form.set('caption', clip(args.caption, CAPTION_LIMIT))
  form.set('parse_mode', 'HTML')
  if (args.keyboard) form.set('reply_markup', JSON.stringify(args.keyboard))
  return call<SentMessage>(args.kind === 'photo' ? 'sendPhoto' : 'sendVideo', form)
}

/**
 * Replace a message's buttons with a one-line outcome. Works for both text
 * messages and media captions by editing only the markup and appending a reply,
 * which avoids having to know which kind the original was.
 */
export async function resolveButtons(
  chatId: string | number,
  messageId: number,
  outcome: string,
): Promise<void> {
  await call('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => undefined) // already edited — a double tap, not an error
  await call('sendMessage', {
    chat_id: chatId,
    text: clip(outcome, MESSAGE_LIMIT),
    parse_mode: 'HTML',
    reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
  })
}

export async function answerCallback(id: string, text?: string): Promise<void> {
  await call('answerCallbackQuery', { callback_query_id: id, text }).catch(() => undefined)
}

/**
 * Fire-and-forget ping for code on a visitor's path. Returns whether it was
 * sent; never throws, never blocks longer than the fetch timeout.
 */
export async function notifyOwner(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false
  try {
    await sendMessage(text)
    return true
  } catch (err) {
    console.error('[hq] Telegram ping failed:', err instanceof Error ? err.message : err)
    return false
  }
}
