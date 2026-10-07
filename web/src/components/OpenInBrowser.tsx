'use client'

import { useState } from 'react'
import { chromeIntent, type Webview } from '../lib/webview'
import s from './address.module.css'

/**
 * Inside Facebook, Instagram and the rest, the calendar file goes nowhere and
 * the print dialog never opens. Facebook is where most people will find this
 * page, so instead of two buttons that do nothing, say so and offer the way
 * out: Chrome on Android (an intent link), the copied link for Safari on iPhone.
 */
export function OpenInBrowser({
  webview,
  text,
  openChrome,
  copyLink,
  copied,
}: {
  webview: Webview
  text: string
  openChrome: string
  copyLink: string
  copied: string
}) {
  const [done, setDone] = useState(false)
  return (
    <div className={s.alert} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span>{text}</span>
      <div className={s.actions}>
        {webview.os === 'android' ? (
          <a
            className={s.action}
            href="#"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = chromeIntent(window.location.href)
            }}
          >
            {openChrome}
          </a>
        ) : null}
        <button
          type="button"
          className={`${s.action} ${s.actionAlt}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href)
              setDone(true)
            } catch {
              /* some in-app browsers block the clipboard; the address bar still works */
            }
          }}
        >
          {done ? copied : copyLink}
        </button>
      </div>
    </div>
  )
}
