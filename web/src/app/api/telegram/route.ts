import { timingSafeEqual } from 'crypto'
import { getPayload } from 'payload'
import config from '../../../payload.config'
import { telegramConfigured } from '../../../lib/telegram'
import { handleUpdate, type TelegramUpdate } from '../../../lib/telegramBot'

/**
 * The HQ bot's webhook. Registered with `setWebhook` and a `secret_token`,
 * which Telegram echoes back in `X-Telegram-Bot-Api-Secret-Token` on every
 * call — the only thing separating a real update from anyone who finds this
 * URL. Owner-only filtering happens after that, in `handleUpdate`.
 *
 * Handled updates always get a 200, even when handling threw: a non-2xx makes
 * Telegram redeliver the same update, and a failing approval would then be
 * retried in a loop.
 */
function secretMatches(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? '')
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret || !telegramConfigured()) {
    return Response.json({ error: 'telegram not configured' }, { status: 503 })
  }
  if (!secretMatches(req.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let update: TelegramUpdate
  try {
    update = await req.json()
  } catch {
    return Response.json({ ok: true })
  }

  try {
    await handleUpdate(await getPayload({ config }), update)
  } catch (err) {
    console.error('[hq] telegram update failed:', err)
  }
  return Response.json({ ok: true })
}
