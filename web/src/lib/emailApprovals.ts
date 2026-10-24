import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Payload } from 'payload'

import { hqMediaDir } from '../collections/HqMedia'
import type { HqEmailApproval } from '../payload-types'
import { recordEvent } from './hq'
import { EMAIL_FROM, EMAIL_REPLY_TO, sendEmail, type EmailAttachment } from './resend'
import { esc, MESSAGE_LIMIT, sendMessage, telegramConfigured, type InlineKeyboard } from './telegram'

/**
 * Emails go out only after the owner reads them and taps Send.
 *
 *   1. Claude files the whole email here (`hqRequestEmail`): recipients,
 *      subject, body, the quoted message under a reply, attachments.
 *   2. The owner gets every word of it in Telegram with Send / Don't send.
 *      Nothing is clipped: an email too long to show in one message is refused
 *      at filing, so he never approves text he didn't see.
 *   3. On Send, HQ sends exactly the stored record through Resend, from hola@,
 *      with a blind copy to hola@ so it lands in the Zoho inbox for the record.
 *
 * The tap is the permission: the webhook only acts for the owner's own chat,
 * `hq-email-approvals` is not in the MCP plugin's list and its fields are
 * `humanOnly`, so nothing can change a request between filing and the tap.
 * One request sends at most once: the status goes pending → sending → sent,
 * under a lock, and a failure is never retried on its own (a retry after a
 * timeout could send it twice).
 */

const TTL_MS = 24 * 3_600_000
const MAX_RECIPIENTS = 5
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024 // well under Resend's 40 MB after base64

const EMAIL_RX = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i

const FOOTER_LOGO = 'https://flamingocounty.com/uploads/flamingo-city-favicon-512.png'

const keyboard = (id: number): InlineKeyboard => ({
  inline_keyboard: [
    [
      { text: '✅ Send it', callback_data: `em:a:${id}` },
      { text: "✖️ Don't send", callback_data: `em:d:${id}` },
    ],
  ],
})

export function parseEmailCallback(data: string | undefined): { action: 'send' | 'decline'; id: number } | null {
  const m = /^em:([ad]):(\d+)$/.exec(data ?? '')
  return m ? { action: m[1] === 'a' ? 'send' : 'decline', id: Number(m[2]) } : null
}

function addresses(raw: string | string[] | undefined, what: string): string[] {
  const list = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
  for (const a of list) if (!EMAIL_RX.test(a)) throw new Error(`${what}: "${a}" is not a plain email address.`)
  return [...new Set(list)]
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

type Attachment = { id: number; filename: string; filesize: number }

async function loadAttachments(payload: Payload, ids: unknown[]): Promise<Attachment[]> {
  const out: Attachment[] = []
  for (const raw of ids) {
    const id = typeof raw === 'object' && raw !== null ? Number((raw as { id: unknown }).id) : Number(raw)
    const doc = await payload.findByID({ collection: 'hq-media', id, depth: 0, overrideAccess: true }).catch(() => null)
    if (!doc?.filename) throw new Error(`No HQ media with id ${id} to attach.`)
    out.push({ id, filename: path.basename(doc.filename), filesize: doc.filesize ?? 0 })
  }
  return out
}

/** The Telegram message: the whole email, exactly as it will go out. */
export function preview(
  r: Pick<HqEmailApproval, 'id' | 'to' | 'cc' | 'subject' | 'body' | 'quote' | 'inReplyTo' | 'why'>,
  attachments: Attachment[],
): string {
  return [
    `<b>✉️ Send this email? #${r.id}</b>`,
    ...(r.why ? [`<i>${esc(r.why)}</i>`] : []),
    '',
    `From: ${esc(EMAIL_FROM)}`,
    `To: <b>${esc(r.to)}</b>`,
    ...(r.cc ? [`Cc: <b>${esc(r.cc)}</b>`] : []),
    `Subject: <b>${esc(r.subject)}</b>`,
    ...(r.inReplyTo ? ['<i>A reply in the same thread.</i>'] : []),
    ...(attachments.length ? [`Attached: ${attachments.map((a) => `${esc(a.filename)} (${mb(a.filesize)})`).join(', ')}`] : []),
    '',
    esc(r.body),
    '',
    '<i>+ the Flamingo County logo footer</i>',
    ...(r.quote ? ['', '<i>Quoted underneath:</i>', `<blockquote expandable>${esc(r.quote)}</blockquote>`] : []),
    '',
    '<i>Sends once, from hola@, only when you tap Send. Expires in 24 hours.</i>',
  ].join('\n')
}

function linkify(escaped: string): string {
  return escaped.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}">${u}</a>`)
}

/** Plain text → the email's HTML: paragraphs, links, the logo footer, the quote. */
export function renderEmail(r: Pick<HqEmailApproval, 'body' | 'quote'>): { text: string; html: string } {
  const paras = r.body
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
  const footer = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:6px"><tr>
<td style="padding-right:10px"><img src="${FOOTER_LOGO}" width="56" height="56" alt="Flamingo County" style="display:block;border-radius:50%"></td>
<td style="font-family:Verdana,sans-serif"><div style="color:#FF2E88;font-weight:bold;letter-spacing:1px">FLAMINGO COUNTY</div><div style="color:#555;font-size:12px">Español &amp; English</div></td>
</tr></table>`
  const quote = r.quote
    ? `<blockquote style="margin:24px 0 0;padding-left:12px;border-left:2px solid #ccc;color:#555">${linkify(esc(r.quote.trim())).replace(/\n/g, '<br>')}</blockquote>`
    : ''
  const html = `<div style="font-family:Verdana,sans-serif;font-size:13px;color:#222">\n${paras}\n${footer}\n${quote}\n</div>`
  const text = [
    r.body.trim(),
    '',
    'FLAMINGO COUNTY · Español & English',
    ...(r.quote ? ['', ...r.quote.trim().split('\n').map((l) => `> ${l}`)] : []),
  ].join('\n')
  return { text, html }
}

const set = (payload: Payload, id: number, data: Partial<HqEmailApproval>) =>
  payload.update({ collection: 'hq-email-approvals', id, data, overrideAccess: true })

export type EmailInput = {
  to: string | string[]
  cc?: string | string[]
  subject: string
  body: string
  quote?: string
  inReplyTo?: string
  references?: string
  attachmentIds?: number[]
  why?: string
}

/** File an email for the owner. Sends nothing by itself. */
export async function requestEmail(payload: Payload, input: EmailInput, now: Date = new Date()) {
  const to = addresses(input.to, 'To')
  const cc = addresses(input.cc, 'Cc')
  if (!to.length) throw new Error('Say who it goes to.')
  if (to.length + cc.length > MAX_RECIPIENTS) throw new Error(`At most ${MAX_RECIPIENTS} recipients.`)
  const subject = (input.subject ?? '').trim()
  const body = (input.body ?? '').trim()
  if (!subject) throw new Error('Give it a subject.')
  if (!body) throw new Error('Write the email.')
  if (!telegramConfigured()) throw new Error('Telegram is not configured, so the owner cannot be asked. Nothing was filed.')

  const attachments = await loadAttachments(payload, input.attachmentIds ?? [])
  const total = attachments.reduce((n, a) => n + a.filesize, 0)
  if (total > MAX_ATTACHMENT_BYTES) throw new Error(`Attachments are ${mb(total)}; keep them under ${mb(MAX_ATTACHMENT_BYTES)}.`)

  const fields = {
    to: to.join(', '),
    cc: cc.length ? cc.join(', ') : undefined,
    subject: subject.slice(0, 200),
    body,
    quote: input.quote?.trim() || undefined,
    inReplyTo: input.inReplyTo?.trim() || undefined,
    references: input.references?.trim() || undefined,
    why: input.why?.trim().slice(0, 200) || undefined,
  }
  // Check the size before filing: he must see all of it, and Telegram takes 4096 characters.
  if (preview({ id: 99999, ...fields }, attachments).length > MESSAGE_LIMIT) {
    throw new Error(
      'Too long to show the owner in one Telegram message (4096 characters with the quote). Shorten the body or the quote. Nothing was filed.',
    )
  }

  const request = await payload.create({
    collection: 'hq-email-approvals',
    data: {
      status: 'pending',
      ...fields,
      attachments: attachments.map((a) => a.id),
      expiresAt: new Date(now.getTime() + TTL_MS).toISOString(),
    },
    overrideAccess: true,
  })

  let sent: { message_id: number }
  try {
    sent = await sendMessage(preview(request, attachments), { keyboard: keyboard(request.id) })
  } catch (err) {
    await set(payload, request.id, { status: 'expired' })
    throw new Error(`Could not reach the owner on Telegram, so nothing was filed (${err instanceof Error ? err.message : err}).`)
  }
  await set(payload, request.id, { telegramMessageId: sent.message_id })
  await recordEvent(payload, {
    type: 'email.requested',
    summary: `Claude asked to email ${request.to}: ${request.subject}`,
    refCollection: 'hq-email-approvals',
    refId: request.id,
  })
  return { requestId: request.id, expiresAt: request.expiresAt }
}

const busy = new Set<number>()

const expired = (r: Pick<HqEmailApproval, 'expiresAt'>, now: Date) =>
  Boolean(r.expiresAt && new Date(r.expiresAt).getTime() < now.getTime())

/** The owner's tap. On Send, sends the stored email. Returns the one-line outcome for Telegram. */
export async function decideEmail(payload: Payload, id: number, action: 'send' | 'decline', now: Date = new Date()): Promise<string> {
  // One process serves every request (SQLite pins a single instance), so this stops a double tap.
  if (busy.has(id)) return `#${id} is already being handled.`
  busy.add(id)
  try {
    const r = await payload.findByID({ collection: 'hq-email-approvals', id, depth: 0, overrideAccess: true }).catch(() => null)
    if (!r) return `No email #${id}.`
    if (r.status !== 'pending') return `#${id} is already ${r.status}.`
    if (expired(r, now)) {
      await set(payload, id, { status: 'expired' })
      return `#${id} expired. Claude has to ask again.`
    }
    if (action === 'decline') {
      await set(payload, id, { status: 'declined', decidedAt: now.toISOString() })
      await recordEvent(payload, {
        type: 'email.declined',
        summary: `Not sent: ${r.subject}`,
        refCollection: 'hq-email-approvals',
        refId: id,
      })
      return `✖️ Not sent.`
    }

    await set(payload, id, { status: 'sending', decidedAt: now.toISOString() })
    try {
      const attachments = await loadAttachments(payload, (r.attachments ?? []) as unknown[])
      const files: EmailAttachment[] = []
      for (const a of attachments) files.push({ filename: a.filename, content: await readFile(path.join(hqMediaDir(), a.filename)) })
      const to = addresses(r.to, 'To')
      const cc = addresses(r.cc ?? '', 'Cc')
      const headers: Record<string, string> = {}
      if (r.inReplyTo) headers['In-Reply-To'] = r.inReplyTo
      if (r.references || r.inReplyTo) headers['References'] = r.references || r.inReplyTo!
      const resendId = await sendEmail({
        to,
        ...(cc.length ? { cc } : {}),
        // A copy in the Zoho inbox, since Resend's sends don't show in Zoho's Sent.
        ...(to.includes(EMAIL_REPLY_TO) || cc.includes(EMAIL_REPLY_TO) ? {} : { bcc: [EMAIL_REPLY_TO] }),
        subject: r.subject,
        ...renderEmail(r),
        ...(Object.keys(headers).length ? { headers } : {}),
        ...(files.length ? { attachments: files } : {}),
      })
      await set(payload, id, { status: 'sent', sentAt: new Date().toISOString(), resendId: resendId ?? undefined })
      await recordEvent(payload, {
        type: 'email.sent',
        summary: `Sent to ${r.to}: ${r.subject}`,
        refCollection: 'hq-email-approvals',
        refId: id,
      })
      return `✅ Sent to ${esc(r.to)}.`
    } catch (err) {
      const why = (err instanceof Error ? err.message : String(err)).slice(0, 300)
      await set(payload, id, { status: 'failed', error: why })
      await recordEvent(payload, {
        type: 'email.failed',
        summary: `Email failed: ${r.subject} (${why})`,
        refCollection: 'hq-email-approvals',
        refId: id,
      })
      return `⚠️ Not sent: ${esc(why)}\nCheck hola@ before anything is sent again.`
    }
  } finally {
    busy.delete(id)
  }
}

/** Where an email stands, for Claude. */
export async function emailStatus(payload: Payload, id: number, now: Date = new Date()) {
  const r = await payload.findByID({ collection: 'hq-email-approvals', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!r) return { requestId: id, status: 'not found' }
  const status = r.status === 'pending' && expired(r, now) ? 'expired' : r.status
  return { requestId: r.id, status, to: r.to, subject: r.subject, sentAt: r.sentAt ?? null, error: r.error ?? null }
}
