'use client'

import { useState } from 'react'
import { authClient } from '../lib/authClient'
import s from './chrome.module.css'

export type EmailCodeCopy = {
  emailLabel: string
  sendCode: string
  sentTo: string
  codeLabel: string
  verify: string
  resend: string
  resent: string
  changeEmail: string
  badEmail: string
  badCode: string
  expiredCode: string
  tooMany: string
  sendFailed: string
}

const body: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.5,
  maxWidth: '56ch',
}

const field: React.CSSProperties = {
  width: 'min(340px, 100%)',
  fontSize: 18,
  fontWeight: 700,
  padding: '10px 12px',
  border: '3px solid var(--ink)',
  background: 'var(--cream)',
  color: 'var(--ink)',
}

const label: React.CSSProperties = { fontWeight: 800, fontSize: 12, letterSpacing: '1.5px' }

const primary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  fontFamily: 'var(--display)',
  fontSize: 16,
  padding: '12px 16px 9px',
  border: '4px solid var(--ink)',
  background: 'var(--grad-pink)',
  color: 'var(--cream)',
  boxShadow: '4px 4px 0 var(--ink)',
  cursor: 'pointer',
}

const link: React.CSSProperties = {
  background: 'none',
  border: 0,
  padding: '8px 4px',
  fontWeight: 800,
  fontSize: 13,
  letterSpacing: '1px',
  textDecoration: 'underline',
  color: 'var(--ink)',
  cursor: 'pointer',
}

/**
 * Sign in with a 6-digit code sent to your email — the way in from Instagram,
 * Facebook, TikTok and the rest, whose browsers Google refuses. It never leaves
 * the page, so it works in any of them.
 *
 * The code signs into whichever account owns that address, so someone who
 * joined with Google gets the same account back by typing their Gmail address.
 *
 * `onSignedIn` gets the session already set; the caller reloads (with any
 * pending tap in the URL) so the server-rendered page picks it up.
 *
 * `fixedEmail` is for proving it's you again (before deleting the account):
 * the code has to go to the signed-in address, not to one typed in.
 */
export function EmailCodeSignIn({
  idPrefix,
  fixedEmail,
  onSignedIn,
  t,
}: {
  idPrefix: string
  fixedEmail?: string
  onSignedIn: () => void
  t: EmailCodeCopy
}) {
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function send(again = false) {
    setBusy(true)
    setError('')
    setNotice('')
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' })
    setBusy(false)
    if (error) {
      setError(error.status === 429 ? t.tooMany : error.code === 'INVALID_EMAIL' ? t.badEmail : t.sendFailed)
      return
    }
    setSent(true)
    setCode('')
    if (again) setNotice(t.resent)
  }

  async function verify() {
    setBusy(true)
    setError('')
    setNotice('')
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() })
    if (!error) return onSignedIn()
    setBusy(false)
    setError(
      error.code === 'OTP_EXPIRED'
        ? t.expiredCode
        : error.code === 'TOO_MANY_ATTEMPTS' || error.status === 429
          ? t.tooMany
          : t.badCode,
    )
  }

  const emailId = `${idPrefix}-email`
  const codeId = `${idPrefix}-code`

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (busy) return
        if (sent) void verify()
        else void send()
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', width: '100%' }}
    >
      {!sent && fixedEmail ? (
        <button type="submit" disabled={busy} className={s.chipPress} style={primary}>
          {t.sendCode}
        </button>
      ) : !sent ? (
        <>
          <label htmlFor={emailId} style={label}>
            {t.emailLabel}
          </label>
          <input
            id={emailId}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={field}
          />
          <button type="submit" disabled={busy || !email.trim()} className={s.chipPress} style={{ ...primary, marginTop: 4 }}>
            {t.sendCode}
          </button>
        </>
      ) : (
        <>
          <p style={body}>{t.sentTo.replace('{email}', email.trim())}</p>
          <label htmlFor={codeId} style={label}>
            {t.codeLabel}
          </label>
          <input
            id={codeId}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            style={{ ...field, width: 'min(200px, 100%)', letterSpacing: '6px', fontSize: 24 }}
          />
          <button type="submit" disabled={busy || code.length !== 6} className={s.chipPress} style={{ ...primary, marginTop: 4 }}>
            {t.verify}
          </button>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" onClick={() => void send(true)} disabled={busy} style={link}>
              {t.resend}
            </button>
            {!fixedEmail && (
              <button
                type="button"
                onClick={() => {
                  setSent(false)
                  setCode('')
                  setError('')
                  setNotice('')
                }}
                disabled={busy}
                style={link}
              >
                {t.changeEmail}
              </button>
            )}
          </div>
        </>
      )}
      <p role="alert" style={{ ...body, minHeight: 0 }}>
        {error || notice}
      </p>
    </form>
  )
}
