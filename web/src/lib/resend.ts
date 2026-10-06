/**
 * Email out, through Resend's HTTP API (no SDK — one POST). Everything the site
 * sends comes from hola@, which Zoho receives, so a reply lands in the same inbox.
 *
 * The domain is verified in Resend on `send.` / `resend._domainkey` records, so
 * the root MX and SPF Zoho uses are untouched (MEMBERS.md, "Resend setup").
 */
export const EMAIL_FROM = process.env.AUTH_EMAIL_FROM || 'Flamingo County <hola@flamingocounty.com>'
export const EMAIL_REPLY_TO = 'hola@flamingocounty.com'

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/** Throws when Resend refuses or the key is missing; callers decide whether that matters. */
export async function sendEmail(msg: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, reply_to: EMAIL_REPLY_TO, ...msg, to: [msg.to] }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}
