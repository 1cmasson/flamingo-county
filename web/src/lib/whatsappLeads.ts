import type { Payload } from 'payload'

import type { HqLead } from '../payload-types'
import { CLINIC, label, PLACES } from './laCapital'
import { esc, notifyOwner, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'
import { inWindow, sendOut } from './whatsapp'

/**
 * The owner's side of the WhatsApp lines: each lead's alert on Telegram, his
 * replies going back on WhatsApp, and the status buttons he taps as the
 * clinic calls and the person comes in.
 *
 * Until the clinic gives us a staff member's number, every lead goes to the
 * owner's Telegram and nowhere else. A lead's full number shows only once
 * they said yes to it going to the clinic; before that it's masked.
 */

export type LeadMessage = { at: string; from: 'them' | 'bot' | 'us'; body: string }
const KEEP = 60

export function log(lead: Pick<HqLead, 'messages'> | null, ...add: LeadMessage[]): LeadMessage[] {
  const old = (Array.isArray(lead?.messages) ? lead!.messages : []) as LeadMessage[]
  return [...old, ...add].slice(-KEEP)
}

/** "#L12" in an alert: replying to that Telegram message answers lead 12. */
export const leadTag = (id: number | string) => `#L${id}`

/** The last line of every lead alert, and the only thing that makes a reply go out on WhatsApp. */
export const REPLY_HINT = '↩️ Responde a este mensaje y le llega por WhatsApp.'

/**
 * The lead a Telegram reply answers: only a reply to a lead alert, which
 * names exactly one lead. A reply to /leads or to a status line is just a
 * message to the bot, never a WhatsApp to anyone.
 */
export function leadFromText(text: string | undefined): number | null {
  if (!text?.includes(REPLY_HINT)) return null
  const ids = new Set([...text.matchAll(/#L(\d+)\b/g)].map((m) => m[1]))
  return ids.size === 1 ? Number([...ids][0]) : null
}

export const masked = (phone: string) => phone.replace(/^(\+\d)(\d{3})\d+(\d{4})$/, '$1 ($2) •••-$3')

function lastFromThem(lead: Pick<HqLead, 'messages'>, n: number): string {
  const mine = ((Array.isArray(lead.messages) ? lead.messages : []) as LeadMessage[]).filter((m) => m.from === 'them').slice(-n)
  return mine.map((m) => `“${esc(m.body.slice(0, 400))}”`).join('\n')
}

const INTENT: Record<string, string> = { visit: 'Visita', callback: 'Llamada', directions: 'Cómo llegar' }

/** Who, what they asked for, and where they came from. */
export function leadSummary(lead: HqLead): string {
  const consented = Boolean(lead.consentAt)
  const phone = consented ? `<code>${esc(lead.phone)}</code>` : esc(masked(lead.phone))
  const place = lead.place && lead.place in PLACES ? PLACES[lead.place as keyof typeof PLACES].title.es : lead.place === 'any' ? 'cualquiera' : null
  const what = [
    lead.intent ? INTENT[lead.intent] : null,
    place,
    label(lead.when, 'es'),
    label(lead.timeOfDay, 'es'),
    label(lead.travel, 'es'),
  ].filter(Boolean)
  return [
    `<b>${leadTag(lead.id)}</b> · ${esc(lead.whatsappName ?? 'sin nombre')} · ${phone}${lead.test ? ' · prueba' : ''}`,
    what.length ? `📍 ${esc(what.join(' · '))}` : null,
    `vino de ${esc(lead.source ?? 'whatsapp')} (${lead.lang})`,
  ]
    .filter(Boolean)
    .join('\n')
}

export type Alert = 'ready' | 'person' | 'message' | 'cancel'

const HEAD: Record<Alert, string> = {
  ready: `🏥✅ <b>${CLINIC.name}: pedido nuevo</b>`,
  person: '🏥🙋 <b>Quiere hablar con una persona</b>',
  message: '🏥💬 <b>Mensaje</b>',
  cancel: '🏥✖️ <b>Canceló su pedido</b>',
}

/* ---------------------------------------------------------- status taps */

const STATUS = { c: 'called', v: 'visited', n: 'no-show', x: 'closed' } as const
type StatusKey = keyof typeof STATUS
const STATUS_LABEL: Record<(typeof STATUS)[StatusKey], string> = {
  called: '📞 Llamado',
  visited: '✅ Vino',
  'no-show': '❌ No vino',
  closed: '🚫 Cerrar',
}

export const statusKeyboard = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: STATUS_LABEL.called, callback_data: `wl:c:${id}` },
      { text: STATUS_LABEL.visited, callback_data: `wl:v:${id}` },
    ],
    [
      { text: STATUS_LABEL['no-show'], callback_data: `wl:n:${id}` },
      { text: STATUS_LABEL.closed, callback_data: `wl:x:${id}` },
    ],
  ],
})

export function parseLeadStatusCallback(data: string | undefined): { status: (typeof STATUS)[StatusKey]; id: number } | null {
  const m = /^wl:([cvnx]):(\d+)$/.exec(data ?? '')
  return m ? { status: STATUS[m[1] as StatusKey], id: Number(m[2]) } : null
}

/** The owner's status tap on a lead alert. Returns the line to show him. */
export async function setLeadStatus(payload: Payload, id: number, status: (typeof STATUS)[StatusKey]): Promise<string> {
  const lead = await payload.findByID({ collection: 'hq-leads', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!lead) return `No lead ${leadTag(id)}.`
  await payload.update({ collection: 'hq-leads', id, data: { status }, overrideAccess: true })
  return `${leadTag(id)} ${esc(lead.whatsappName ?? '')} → ${STATUS_LABEL[status]}`
}

export async function alertOwner(lead: HqLead, why: Alert): Promise<void> {
  const consent =
    why === 'ready' && lead.consentAt
      ? `\n<i>Dijo que sí a pasar su nombre y número a la clínica (${new Date(lead.consentAt).toLocaleString('es-US', { timeZone: 'America/New_York', dateStyle: 'short', timeStyle: 'short' })}).</i>`
      : ''
  const text = `${HEAD[why]}\n${leadSummary(lead)}${consent}\n\n${lastFromThem(lead, why === 'message' ? 1 : 3)}\n\n<i>${REPLY_HINT}</i>`
  if (why !== 'ready') {
    await notifyOwner(text)
    return
  }
  if (!telegramConfigured()) return
  try {
    await sendMessage(text, { keyboard: statusKeyboard(lead.id) })
  } catch (err) {
    console.error('[whatsapp] lead alert failed:', err instanceof Error ? err.message : err)
  }
}

/* ------------------------------------------------------ owner's replies */

/**
 * Send the owner's words to a lead and log them. The lead stays with a person
 * (step handoff) so the bot doesn't talk over him. Returns the outcome line
 * for Telegram; never throws.
 */
export async function sendToLead(payload: Payload, leadId: number, body: string, now: Date = new Date()): Promise<string> {
  const lead = await payload.findByID({ collection: 'hq-leads', id: leadId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!lead) return `No lead ${leadTag(leadId)}.`
  if (lead.optedOut) return `🚫 ${leadTag(leadId)} wrote BAJA/STOP. Nothing sent.`
  if (!inWindow(lead.lastInboundAt, now))
    return `⏳ ${leadTag(leadId)} wrote over 24 hours ago, and WhatsApp only allows a free reply within 24 hours of their last message. Nothing sent.`
  try {
    await sendOut(lead.phone, { text: body })
  } catch (err) {
    return `❌ Not sent to ${leadTag(leadId)}: ${esc(err instanceof Error ? err.message : String(err))}`
  }
  const withPerson = !['ready', 'called', 'visited', 'no-show', 'closed'].includes(lead.status)
  await payload.update({
    collection: 'hq-leads',
    id: lead.id,
    data: {
      step: 'handoff',
      ...(withPerson ? { status: 'handoff' as const } : {}),
      messages: log(lead, { at: now.toISOString(), from: 'us', body: body.slice(0, 1000) }),
    },
    overrideAccess: true,
  })
  return `✅ Sent to ${esc(lead.whatsappName ?? leadTag(leadId))} ${leadTag(leadId)} on WhatsApp.`
}

/** /leads in Telegram: the counts, then who is waiting. */
export async function leadsReport(payload: Payload): Promise<string> {
  const { docs } = await payload.find({
    collection: 'hq-leads',
    where: { test: { not_equals: true } },
    sort: '-lastInboundAt',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  if (!docs.length) return 'No WhatsApp leads yet.'
  const count = (s: HqLead['status']) => docs.filter((d) => d.status === s).length
  const waiting = docs.filter((d) => d.status === 'handoff' || d.status === 'ready').slice(0, 12)
  const lines = [
    `<b>WhatsApp leads</b> · ${docs.length} · ready ${count('ready')} · with a person ${count('handoff')} · called ${count('called')} · visited ${count('visited')} · no-show ${count('no-show')}`,
    ...waiting.map((d) => `${leadTag(d.id)} ${esc(d.whatsappName ?? 'sin nombre')} · ${d.status}${d.intent ? ` · ${INTENT[d.intent]}` : ''}`),
  ]
  if (waiting.length) lines.push('', '<i>Reply to a lead’s alert to answer it, or /wa &lt;id&gt; &lt;text&gt;.</i>')
  return lines.join('\n')
}
