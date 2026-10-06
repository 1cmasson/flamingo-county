import type { Lang } from '../i18n'
import { requestCopy } from './requestCopy'
import type { RequestKind } from './requestKinds'
import { sendEmail } from './resend'
import { esc } from './telegram'

/**
 * The "we got it" email for a request off the list-your-spot hub. Sent only
 * when the contact they left is an email address; a phone number gets the
 * on-page confirmation and a call.
 *
 * It repeats what they sent back to them, so a typo in the date or the address
 * is caught by the person who knows the right answer — and it comes from hola@,
 * so "just reply to this" reaches the owner's inbox.
 *
 * Anyone can type any address into the form, so this must never be a way to
 * mail strangers someone else's words: it carries no link they gave, and
 * `sendRequest` caps it per address and per hour (`confirmationAllowed`).
 */
const SUBJECT: Record<Lang, Record<RequestKind, string>> = {
  en: {
    listing: 'We got your listing request',
    event: 'We got your event',
    interview: 'We got your interview request',
    story: 'Thanks for the story tip',
  },
  es: {
    listing: 'Recibimos tu solicitud para la ficha',
    event: 'Recibimos tu evento',
    interview: 'Recibimos tu pedido de entrevista',
    story: 'Gracias por el dato',
  },
}

const LINES: Record<Lang, { hi: (name?: string) => string; sent: string; reply: string; sign: string }> = {
  en: {
    hi: (name) => (name ? `Hi ${name},` : 'Hi,'),
    sent: 'Here’s what you sent us:',
    reply: 'If anything changes, or you want to add a flyer or photos, just reply to this email.',
    sign: '— Flamingo County',
  },
  es: {
    hi: (name) => (name ? `Hola, ${name}:` : 'Hola:'),
    sent: 'Esto es lo que nos mandaste:',
    reply: 'Si algo cambia, o quieres mandarnos un flyer o fotos, responde a este correo.',
    sign: '— Flamingo County',
  },
}

export type RequestSummary = {
  kind: RequestKind
  lang: Lang
  to: string
  name?: string
  /** The request's title — business, event name, or the story in one line. */
  title: string
  when?: string
  where?: string
}

/** The form's own label for the title field, per kind (keys into the copy's `f`). */
const TITLE_LABEL: Record<RequestKind, string> = {
  listing: 'businessName',
  event: 'eventName',
  interview: 'whatYouDo',
  story: 'storyLine',
}

export function requestEmail(r: RequestSummary) {
  const kc = requestCopy(r.lang).kinds[r.kind]
  const f = requestCopy(r.lang).f
  const l = LINES[r.lang]
  const details: [string, string][] = [
    [f[TITLE_LABEL[r.kind]], r.title],
    ...(r.when ? [[f.when, r.when] as [string, string]] : []),
    ...(r.where ? [[f.where, r.where] as [string, string]] : []),
  ]
  // sentP is the same promise the page made: what happens next, and when.
  const text = [
    l.hi(r.name),
    '',
    kc.sentP,
    '',
    l.sent,
    ...details.map(([k, v]) => `${k}: ${v}`),
    '',
    l.reply,
    '',
    l.sign,
  ].join('\n')

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#FFF6E5;font-family:Helvetica,Arial,sans-serif;color:#1A1A1A;font-size:15px;line-height:1.5">
<p style="margin:0 0 12px">${esc(l.hi(r.name))}</p>
<p style="margin:0 0 16px;font-weight:600">${esc(kc.sentP)}</p>
<p style="margin:0 0 6px">${esc(l.sent)}</p>
<table style="margin:0 0 16px;border-collapse:collapse">${details
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:12px;font-weight:800;letter-spacing:1px;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`,
    )
    .join('')}</table>
<p style="margin:0 0 16px">${esc(l.reply)}</p>
<p style="margin:0">${esc(l.sign)}</p>
</body></html>`

  return { to: r.to, subject: SUBJECT[r.lang][r.kind], text, html }
}

export async function sendRequestConfirmation(r: RequestSummary): Promise<void> {
  await sendEmail(requestEmail(r))
}
