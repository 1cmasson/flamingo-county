import type { Payload, Where } from 'payload'

import { PUBLISHED } from '../fields/shared'
import type { StoryPoll, VoteWhatsappOptin } from '../payload-types'
import { routes } from './routes'
import { absUrl } from './site'
import { esc, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'
import { restConfigured, sendTemplate } from './whatsapp'

/**
 * The weekly vote on WhatsApp, for the numbers in `vote-whatsapp-optins`
 * (lib/voteOptins.ts saves them, with their consent):
 *
 *   - **Welcome.** Right after someone signs up (or signs up again after
 *     BAJA), the approved welcome template confirms it. It's the reply to
 *     what they just asked for, so it needs no tap.
 *   - **"The vote is open."** Never on its own. The hourly `voteBroadcast`
 *     job sends the owner ONE Telegram message per open vote, with how many
 *     numbers would get it and [📣 Enviar a N] [Saltar]. Only his tap sends.
 *
 * Every send is a Meta-approved Utility template (Twilio Content API), so it
 * may go out any time, not only within 24 hours of the person writing.
 * BAJA/STOP (lib/whatsappInbound.ts) sets a row to unsubscribed, and an
 * unsubscribed row is never messaged. Nobody outside the table is.
 *
 * Off with `HQ_VOTE_BROADCAST=off` (the offer; the welcome stays).
 */

/** The approved templates (Twilio Content SIDs, Meta category Utility, approved 2026-11). */
export const VOTE_TEMPLATES = {
  welcome: { es: 'HX8044a12399ea9d1ae5186aecc34a09ca', en: 'HX740372e92f088d517b885d2e30adcb10' },
  /** {{1}} the question, {{2}} the vote link. */
  open: { es: 'HXf57aa9130af2a3630a260a75475d666e', en: 'HX49f260ceb77537a38de8855da29f0946' },
  /** {{1}} the winner, {{2}} the results link. */
  result: { es: 'HX0bce66de6145d5bcee011ff04cd2fd38', en: 'HX6bb4b8ffbab053ae44fef789e4790bc2' },
} as const

export const VOTE_OFFER_EVENT = 'vote.whatsapp.offered'

type Lang = 'es' | 'en'
const langOf = (l: string | null | undefined): Lang => (l === 'en' ? 'en' : 'es')

export function voteBroadcastEnabled(): boolean {
  return !/^(off|false|0|no)$/i.test((process.env.HQ_VOTE_BROADCAST ?? '').trim())
}

/* ------------------------------------------------------------- welcome */

const pending = new Set<Promise<void>>()

/**
 * The welcome for a number that just signed up. Not awaited by the sign-up
 * and never throws into it: a failure is only logged. Test rows get it too,
 * that's how the owner checks it.
 */
export function sendVoteWelcome(phone: string, lang: string | null | undefined): void {
  if (!restConfigured()) return
  const p = sendTemplate(phone, VOTE_TEMPLATES.welcome[langOf(lang)])
    .catch((err) => console.error('[vote whatsapp] welcome failed:', err instanceof Error ? err.message : err))
    .finally(() => pending.delete(p))
  pending.add(p)
}

/** Waits for the welcomes already started. For tests. */
export async function settleVoteWelcomes(): Promise<void> {
  await Promise.all([...pending])
}

/* ------------------------------------------------------------ variables */

/**
 * A template variable: one line (WhatsApp refuses new lines, tabs and runs
 * of spaces in one), never empty.
 */
const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()

/**
 * Something quoted inside the template's own sentence ("La pregunta de esta
 * semana es {{1}}."): Spanish in « », English in curly quotes.
 */
export const quoted = (lang: Lang, s: string) => (lang === 'es' ? `«${oneLine(s)}»` : `“${oneLine(s)}”`)

/** The vote's own page, marked as coming from WhatsApp (counted as source "whatsapp"). */
export const voteLink = (lang: Lang, slug: string) => `${absUrl(routes.storyPoll(lang, slug))}?utm_source=whatsapp`

export function openVars(lang: Lang, question: string, slug: string): Record<string, string> {
  return { '1': quoted(lang, question), '2': voteLink(lang, slug) }
}

/* ------------------------------------------------------------ audience */

/**
 * Who gets "the vote is open" for this poll: active numbers that haven't had
 * it yet, minus the ones that signed up from this very poll (they've voted).
 */
function audienceWhere(pollId: number): Where {
  return {
    and: [
      { status: { equals: 'active' } },
      { or: [{ lastPollSentId: { not_equals: pollId } }, { lastPollSentId: { exists: false } }] },
      { or: [{ poll: { not_equals: pollId } }, { poll: { exists: false } }] },
    ],
  }
}

async function audience(payload: Payload, pollId: number): Promise<VoteWhatsappOptin[]> {
  const { docs } = await payload.find({
    collection: 'vote-whatsapp-optins',
    where: audienceWhere(pollId),
    sort: 'createdAt',
    limit: 5000,
    depth: 0,
    overrideAccess: true,
  })
  return docs
}

type PollInBoth = { poll: StoryPoll; es: StoryPoll; en: StoryPoll }

async function pollInBoth(payload: Payload, id: number): Promise<PollInBoth | null> {
  const get = (locale: Lang) =>
    payload
      .findByID({ collection: 'story-polls', id, locale, fallbackLocale: locale === 'en' ? 'es' : 'en', depth: 0, overrideAccess: true })
      .catch(() => null)
  const [es, en] = await Promise.all([get('es'), get('en')])
  return es && en ? { poll: es, es, en } : null
}

/* --------------------------------------------------------------- offer */

export const offerKeyboard = (pollId: number, n: number): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: `📣 Enviar a ${n}`, callback_data: `vb:s:${pollId}` },
      { text: 'Saltar', callback_data: `vb:k:${pollId}` },
    ],
  ],
})

export function offerText(p: PollInBoth, people: Pick<VoteWhatsappOptin, 'lang' | 'test'>[]): string {
  const es = people.filter((r) => langOf(r.lang) === 'es').length
  const en = people.length - es
  const tests = people.filter((r) => r.test).length
  return [
    `🗳️ <b>Votación abierta: ${esc(p.es.title)}</b>`,
    `«${esc(oneLine(p.es.question ?? ''))}»`,
    '',
    `📱 Suscritos por WhatsApp que aún no la recibieron: <b>${people.length}</b> (ES ${es} · EN ${en}${tests ? ` · ${tests} de prueba` : ''})`,
    'Les llega el aviso aprobado por Meta con el enlace para votar.',
    '',
    '<i>No se envía nada hasta que toques Enviar.</i>',
  ].join('\n')
}

/**
 * One Telegram offer per open vote. The hq-events row is claimed before the
 * send, so a later hour, a retry or a restart finds it and stops; a failed
 * send removes it, so the next hour tries again. A vote nobody would get yet
 * isn't offered (and isn't claimed), so it's offered once someone signs up.
 * Returns how many offers went out.
 */
export async function offerVoteBroadcasts(payload: Payload, now: Date = new Date()): Promise<number> {
  if (!voteBroadcastEnabled() || !telegramConfigured()) return 0
  const at = now.toISOString()
  const { docs } = await payload.find({
    collection: 'story-polls',
    where: { and: [PUBLISHED, { opensAt: { less_than_equal: at } }, { closesAt: { greater_than: at } }] },
    sort: '-opensAt',
    depth: 0,
    limit: 5,
    overrideAccess: true,
  })

  let offered = 0
  for (const open of docs) {
    const ref = String(open.id)
    const seen = await payload.count({
      collection: 'hq-events',
      where: { and: [{ type: { equals: VOTE_OFFER_EVENT } }, { refId: { equals: ref } }] },
      overrideAccess: true,
    })
    if (seen.totalDocs) continue
    const people = await audience(payload, open.id)
    if (!people.length) continue
    const p = await pollInBoth(payload, open.id)
    if (!p) continue

    const claim = await payload.create({
      collection: 'hq-events',
      data: {
        type: VOTE_OFFER_EVENT,
        summary: `Vote on WhatsApp offered: ${p.es.title} (${people.length})`,
        refCollection: 'story-polls',
        refId: ref,
        status: 'seen',
        data: { state: 'offered', audience: people.length },
      },
      overrideAccess: true,
    })
    try {
      await sendMessage(offerText(p, people), { keyboard: offerKeyboard(open.id, people.length) })
    } catch (err) {
      await payload.delete({ collection: 'hq-events', id: claim.id, overrideAccess: true }).catch(() => undefined)
      throw err
    }
    offered++
  }
  return offered
}

/* ------------------------------------------------------------ the tap */

export function parseVoteBroadcastCallback(data: string | undefined): { action: 'send' | 'skip'; pollId: number } | null {
  const m = /^vb:([sk]):(\d+)$/.exec(data ?? '')
  return m ? { action: m[1] === 's' ? 'send' : 'skip', pollId: Number(m[2]) } : null
}

const sending = new Set<number>()

async function markOffer(payload: Payload, pollId: number, data: Record<string, unknown>): Promise<void> {
  const { docs } = await payload.find({
    collection: 'hq-events',
    where: { and: [{ type: { equals: VOTE_OFFER_EVENT } }, { refId: { equals: String(pollId) } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const ev = docs[0]
  const old = ev?.data && typeof ev.data === 'object' && !Array.isArray(ev.data) ? (ev.data as Record<string, unknown>) : {}
  if (ev) await payload.update({ collection: 'hq-events', id: ev.id, data: { status: 'done', data: { ...old, ...data } }, overrideAccess: true })
}

/**
 * The owner's tap on an offer. Send: the open template to every number in
 * the audience, one at a time, each row marked before its send (and put back
 * if Twilio refuses it, so a second tap retries only the failures). A number
 * already sent this vote is never sent it again. Skip: nothing goes out.
 * Returns the line to show him, and `retry` (how many failed) when a new
 * Send button should come with it.
 */
export async function decideVoteBroadcast(
  payload: Payload,
  pollId: number,
  action: 'send' | 'skip',
  now: Date = new Date(),
): Promise<{ text: string; retry: number }> {
  const say = (text: string, retry = 0) => ({ text, retry })
  if (action === 'skip') {
    await markOffer(payload, pollId, { state: 'skipped', at: now.toISOString() })
    return say('⏭️ No se envió. Nadie recibió el aviso de esta votación.')
  }
  if (!restConfigured()) return say('❌ WhatsApp no está configurado en el servidor (TWILIO_*). No se envió nada.')
  if (sending.has(pollId)) return say('⏳ Ya se está enviando.')
  const p = await pollInBoth(payload, pollId)
  if (!p) return say('❌ No encontré esa votación.')
  if (p.poll.closesAt && new Date(p.poll.closesAt).getTime() <= now.getTime()) return say('🔒 Esa votación ya cerró. No se envió nada.')

  sending.add(pollId)
  let sent = 0
  let failed = 0
  try {
    for (const row of await audience(payload, pollId)) {
      // Re-read: a BAJA may have come in while the others were sending.
      const fresh = await payload.findByID({ collection: 'vote-whatsapp-optins', id: row.id, depth: 0, overrideAccess: true }).catch(() => null)
      if (!fresh || fresh.status !== 'active' || fresh.lastPollSentId === pollId) continue
      const lang = langOf(fresh.lang)
      const before = { lastPollSentId: fresh.lastPollSentId ?? null, lastPollSentAt: fresh.lastPollSentAt ?? null }
      await payload.update({
        collection: 'vote-whatsapp-optins',
        id: fresh.id,
        data: { lastPollSentId: pollId, lastPollSentAt: now.toISOString() },
        overrideAccess: true,
        depth: 0,
      })
      try {
        await sendTemplate(fresh.phone, VOTE_TEMPLATES.open[lang], openVars(lang, p[lang].question ?? p[lang].title, p.poll.slug))
        sent++
      } catch (err) {
        failed++
        console.error('[vote whatsapp] open failed for …' + fresh.phone.slice(-4) + ':', err instanceof Error ? err.message : err)
        await payload.update({ collection: 'vote-whatsapp-optins', id: fresh.id, data: before, overrideAccess: true, depth: 0 }).catch(() => undefined)
      }
    }
  } finally {
    sending.delete(pollId)
  }
  await markOffer(payload, pollId, { state: 'sent', at: now.toISOString(), sent, failed })
  if (!sent && !failed) return say('✅ Ya les había llegado a todos. No se envió nada nuevo.')
  return say(`📣 Enviado a ${sent}${failed ? ` · ❌ fallaron ${failed}. El botón de abajo reintenta solo esos.` : '.'}`, failed)
}
