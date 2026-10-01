import type { Lang } from '../i18n'

/**
 * The sign-in code email, sent through Resend's HTTP API (no SDK — one POST).
 *
 * Without RESEND_API_KEY, outside production, the code is printed to the server
 * log instead, so dev and the e2e suite sign in without sending anything.
 *
 * The code goes in the subject line: it shows in the phone's notification, so
 * someone switching over from Instagram never has to open the email.
 */
const FROM = process.env.AUTH_EMAIL_FROM || 'Flamingo County <hola@flamingocounty.com>'

function copy(lang: Lang, code: string) {
  return lang === 'es'
    ? {
        subject: `${code} es tu código de Flamingo County`,
        text: `Tu código para entrar en Flamingo County es ${code}.\n\nCaduca en 10 minutos. Si no lo pediste tú, ignora este correo.`,
        lead: 'Tu código para entrar en Flamingo County:',
        note: 'Caduca en 10 minutos. Si no lo pediste tú, ignora este correo.',
      }
    : {
        subject: `${code} is your Flamingo County code`,
        text: `Your code to sign in to Flamingo County is ${code}.\n\nIt expires in 10 minutes. If you didn’t ask for it, ignore this email.`,
        lead: 'Your code to sign in to Flamingo County:',
        note: 'It expires in 10 minutes. If you didn’t ask for it, ignore this email.',
      }
}

function html(c: ReturnType<typeof copy>, code: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#FFF6E5;font-family:Helvetica,Arial,sans-serif;color:#1A1A1A">
<p style="margin:0 0 12px;font-size:16px;font-weight:600">${c.lead}</p>
<p style="margin:0 0 16px;font-size:36px;font-weight:800;letter-spacing:6px">${code}</p>
<p style="margin:0;font-size:14px">${c.note}</p>
</body></html>`
}

/**
 * The language of the page the visitor asked from. The request body only
 * carries the email, but the Referer is the page they are on (/es/… or /en/…).
 */
export function langFromReferer(referer: string | null | undefined): Lang {
  try {
    return new URL(referer ?? '').pathname.startsWith('/en') ? 'en' : 'es'
  } catch {
    return 'es'
  }
}

/**
 * Throws when Resend refuses. Better Auth catches and logs that rather than
 * failing the request, so the visitor sees "code sent" either way — the code
 * screen's "send it again" is their way out.
 */
export async function sendSignInCode(email: string, code: string, lang: Lang): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Never print live codes into production logs.
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY is not set')
    console.log(`auth: sign-in code for ${email} is ${code} (RESEND_API_KEY unset, not emailed)`)
    return
  }
  const c = copy(lang, code)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [email], subject: c.subject, text: c.text, html: html(c, code) }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}
