'use client'

import { useState } from 'react'
import { chromeIntent, type Webview } from '../lib/webview'
import { EmailCodeSignIn, type EmailCodeCopy } from './EmailCodeSignIn'
import s from './chrome.module.css'

export type WebviewCopy = EmailCodeCopy & {
  webviewH: string
  /** `{app}` and `{browser}` are filled in here. */
  webviewP: string
  webviewPUnknown: string
  orBrowser: string
  openChrome: string
  copyLink: string
  copied: string
  hintIos: string
  hintAndroid: string
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

/**
 * What stands in for the Google button inside Instagram, Facebook, TikTok and
 * the rest, where Google refuses to sign anyone in (`disallowed_useragent`):
 * sign in with an emailed code right here, or open the page in Safari / Chrome
 * and use Google there. Used by My Week's account panel and by the sign-in
 * gate on the event buttons.
 *
 * `pageUrl` is read at click time when omitted, so the link copied is the page
 * the visitor is actually on.
 */
export function WebviewPrompt({
  webview,
  pageUrl,
  headingId,
  onSignedIn,
  t,
}: {
  webview: Webview
  pageUrl?: string
  headingId: string
  onSignedIn: () => void
  t: WebviewCopy
}) {
  const [copied, setCopied] = useState(false)
  const browser = webview.os === 'ios' ? 'Safari' : webview.os === 'android' ? 'Chrome' : ''
  const fill = (text: string) =>
    text.replace('{app}', webview.app).replace('{browser}', browser || 'Safari / Chrome')
  const url = () => pageUrl ?? window.location.href

  async function copy() {
    try {
      await navigator.clipboard.writeText(url())
      setCopied(true)
    } catch {
      // Some in-app browsers block the clipboard; the hint below still works.
    }
  }

  return (
    <>
      <div
        id={headingId}
        style={{ fontFamily: 'var(--display)', fontSize: 'clamp(20px,4.6vw,26px)', lineHeight: 1.05 }}
      >
        {fill(t.webviewH)}
      </div>
      <p style={body}>{fill(webview.app ? t.webviewP : t.webviewPUnknown)}</p>
      <EmailCodeSignIn idPrefix={headingId} onSignedIn={onSignedIn} t={t} />
      <p style={{ ...body, marginTop: 6, paddingTop: 12, borderTop: '3px solid var(--ink)', alignSelf: 'stretch' }}>
        {fill(t.orBrowser)}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {webview.os === 'android' && (
          <a
            href={pageUrl ? chromeIntent(pageUrl) : '#'}
            onClick={(e) => {
              if (!pageUrl) {
                e.preventDefault()
                window.location.href = chromeIntent(url())
              }
            }}
            className={s.chipPress}
            style={button('var(--cream)', 'var(--ink)')}
          >
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
      <span
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {copied ? t.copied : ''}
      </span>
    </>
  )
}
