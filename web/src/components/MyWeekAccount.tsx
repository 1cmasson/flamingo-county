'use client'

import { useState } from 'react'
import { authClient } from '../lib/authClient'
import { forgetDevice } from '../lib/saved'
import { chromeIntent, type Webview } from '../lib/webview'
import s from './chrome.module.css'

export type AccountCopy = {
  pitchH: string
  pitchP: string
  google: string
  signInFailed: string
  webviewH: string
  /** `{app}` and `{browser}` are filled in here. */
  webviewP: string
  webviewPUnknown: string
  openChrome: string
  copyLink: string
  copied: string
  hintIos: string
  hintAndroid: string
  signedInAs: string
  synced: string
  signOut: string
  deleteAccount: string
  confirmH: string
  confirmP: string
  confirmDelete: string
  cancel: string
  deleteFailed: string
  reauth: string
}

const panel: React.CSSProperties = {
  background: 'var(--grad-cream)',
  border: '4px solid var(--ink)',
  boxShadow: '8px 8px 0 var(--ink)',
  padding: 'clamp(16px,3.5vw,24px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  alignItems: 'flex-start',
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--display)',
  fontSize: 'clamp(20px,4.6vw,26px)',
  lineHeight: 1.05,
}

const body: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.5,
  maxWidth: '56ch',
}

function button(bg: string, ink: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    fontFamily: 'var(--display)',
    fontSize: 16,
    padding: '12px 16px 9px',
    border: '4px solid var(--ink)',
    background: bg,
    color: ink,
    boxShadow: '4px 4px 0 var(--ink)',
    cursor: 'pointer',
    textDecoration: 'none',
  }
}

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }

/** Google's mark, as their branding guidelines require on a sign-in button. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" style={{ marginTop: -3 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/**
 * The only place on the site that offers sign-in (MEMBERS.md — My Week only).
 *
 * Three faces: the Google button; the "open this in your browser" prompt when
 * the page is inside an app whose browser Google refuses; and, signed in, who
 * you are with sign-out and delete.
 */
export function MyWeekAccount({
  user,
  webview,
  pageUrl,
  callbackPath,
  t,
}: {
  user: { name: string; email: string } | null
  webview: Webview | null
  pageUrl: string
  callbackPath: string
  t: AccountCopy
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [needsReauth, setNeedsReauth] = useState(false)

  async function signIn() {
    setBusy(true)
    setError('')
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: callbackPath,
      // Cancelling Google's account chooser comes back here, not to Better
      // Auth's own unstyled English error page.
      errorCallbackURL: callbackPath,
    })
    // On success the browser is already navigating to Google.
    if (error) {
      setError(t.signInFailed)
      setBusy(false)
    }
  }

  async function signOut() {
    setBusy(true)
    await authClient.signOut()
    forgetDevice()
    window.location.reload()
  }

  async function deleteAccount() {
    setBusy(true)
    setError('')
    const { error } = await authClient.deleteUser()
    if (error) {
      setBusy(false)
      // Better Auth only deletes from a recent sign-in; an old session has to
      // prove itself again first.
      if (error.code === 'SESSION_EXPIRED') setNeedsReauth(true)
      else setError(t.deleteFailed)
      return
    }
    forgetDevice()
    window.location.reload()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl)
      setCopied(true)
    } catch {
      // Some in-app browsers block the clipboard; the hint below still works.
    }
  }

  if (user) {
    return (
      <section style={panel} aria-labelledby="account-h">
        <div id="account-h" style={heading}>
          {t.signedInAs} {user.name || user.email}
        </div>
        <p style={body}>{t.synced}</p>

        {confirming ? (
          <div
            role="group"
            aria-labelledby="confirm-h"
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}
          >
            <div id="confirm-h" style={{ ...heading, fontSize: 20 }}>
              {t.confirmH}
            </div>
            <p style={body}>{needsReauth ? t.reauth : t.confirmP}</p>
            <div style={row}>
              {needsReauth ? (
                <button type="button" onClick={signIn} disabled={busy} className={s.chipPress} style={button('var(--cream)', 'var(--ink)')}>
                  <GoogleG />
                  {t.google}
                </button>
              ) : (
                <button type="button" onClick={deleteAccount} disabled={busy} className={s.chipPress} style={button('var(--ink)', 'var(--cream)')}>
                  {t.confirmDelete}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                  setNeedsReauth(false)
                }}
                disabled={busy}
                className={s.chipPress}
                style={button('var(--cream)', 'var(--ink)')}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div style={row}>
            <button type="button" onClick={signOut} disabled={busy} className={s.chipPress} style={button('var(--cream)', 'var(--ink)')}>
              {t.signOut}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              style={{
                background: 'none',
                border: 0,
                padding: '12px 4px',
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: '1px',
                textDecoration: 'underline',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              {t.deleteAccount}
            </button>
          </div>
        )}
        {error && (
          <p role="alert" style={{ ...body, color: 'var(--ink)' }}>
            {error}
          </p>
        )}
      </section>
    )
  }

  if (webview) {
    const browser = webview.os === 'ios' ? 'Safari' : webview.os === 'android' ? 'Chrome' : ''
    const p = (webview.app ? t.webviewP : t.webviewPUnknown)
      .replace('{app}', webview.app)
      .replace('{browser}', browser || 'Safari / Chrome')
    return (
      <section style={panel} aria-labelledby="account-h">
        <div id="account-h" style={heading}>
          {t.webviewH.replace('{browser}', browser || 'Safari / Chrome')}
        </div>
        <p style={body}>{p}</p>
        <div style={row}>
          {webview.os === 'android' && (
            <a href={chromeIntent(pageUrl)} className={s.chipPress} style={button('var(--grad-pink)', 'var(--cream)')}>
              {t.openChrome}
            </a>
          )}
          <button type="button" onClick={copy} className={s.chipPress} style={button('var(--cream)', 'var(--ink)')}>
            {copied ? t.copied : t.copyLink}
          </button>
        </div>
        {webview.os !== 'other' && (
          <p style={{ ...body, fontSize: 13 }}>{webview.os === 'ios' ? t.hintIos : t.hintAndroid}</p>
        )}
        <span aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {copied ? t.copied : ''}
        </span>
      </section>
    )
  }

  return (
    <section style={panel} aria-labelledby="account-h">
      <div id="account-h" style={heading}>
        {t.pitchH}
      </div>
      <p style={body}>{t.pitchP}</p>
      <div style={row}>
        <button type="button" onClick={signIn} disabled={busy} className={s.chipPress} style={button('var(--cream)', 'var(--ink)')}>
          <GoogleG />
          {t.google}
        </button>
      </div>
      {error && (
        <p role="alert" style={body}>
          {error}
        </p>
      )}
    </section>
  )
}
