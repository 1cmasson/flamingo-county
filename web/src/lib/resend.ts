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

export type EmailAttachment = { filename: string; content: Buffer }

/**
 * Throws when Resend refuses or the key is missing; callers decide whether that
 * matters. Returns Resend's id for the message.
 */
export async function sendEmail(msg: {
  to: string | string[]
  subject: string
  text: string
  html: string
  cc?: string[]
  bcc?: string[]
  /** e.g. In-Reply-To / References, so a reply threads under the original. */
  headers?: Record<string, string>
  attachments?: EmailAttachment[]
  /** ISO 8601 time for Resend to hold it until (up to 30 days ahead). Left out, it goes now. */
  scheduledAt?: string
}): Promise<string | undefined> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  const { attachments, scheduledAt, ...rest } = msg
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: EMAIL_FROM,
      reply_to: EMAIL_REPLY_TO,
      ...rest,
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString('base64') })) }
        : {}),
    }),
    // A reel or two attached is a few MB of base64 to upload.
    signal: AbortSignal.timeout(attachments?.length ? 60_000 : 10_000),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  const json = (await res.json().catch(() => null)) as { id?: string } | null
  return json?.id
}

/** Stop an email Resend is holding for later. A cancelled email can't be rescheduled. */
export async function cancelScheduledEmail(id: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}
