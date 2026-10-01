'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n'
import { authClient } from '../lib/authClient'
import {
  MemberContext,
  pendingFrom,
  withPending,
  withoutPending,
  type Member,
  type Pending,
} from '../lib/member'
import { routes } from '../lib/routes'
import { addTo, startSync } from '../lib/saved'
import type { Webview } from '../lib/webview'
import { WebviewPrompt, type WebviewCopy } from './WebviewPrompt'
import s from './chrome.module.css'

/**
 * Signed-in state for the whole public site, plus the sign-in gate on saving,
 * going and the calendar file (MEMBERS.md). Rendered once, in the [lang]
 * layout, which has already read the session and the user agent.
 *
 * A signed-out tap goes straight to Google with the tap recorded in the
 * callback URL (`?fc_do=save&fc_e=<slug>`). Back on the same page, signed in,
 * this finishes it — after the first sync, so the account's merged list is in
 * place before the tap is added to it. Inside an in-app browser Google
 * refuses, the tap opens a dialog instead: sign in with an emailed code there
 * (the tap then finishes the same way), or open the page in Safari / Chrome.
 */
export function MemberProvider({
  lang,
  signedIn,
  webview,
  t,
  children,
}: {
  lang: Lang
  signedIn: boolean
  webview: Webview | null
  t: WebviewCopy & { close: string }
  children: React.ReactNode
}) {
  // The tap that opened the in-app-browser dialog, finished after a code sign-in.
  const [prompting, setPrompting] = useState<Pending | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const pending = pendingFrom(window.location.search)
    const clean = () =>
      window.history.replaceState(
        window.history.state,
        '',
        withoutPending(window.location.pathname, window.location.search) + window.location.hash,
      )

    if (!signedIn) {
      // A pending tap only means anything once signed in (a cancelled sign-in
      // returns without one). Drop it rather than leave it in a shared URL.
      if (pending) clean()
      return
    }

    let cancelled = false
    void (async () => {
      await startSync(lang)
      if (cancelled || !pending) return
      clean()
      if (pending.kind === 'save') addTo('saved', pending.slug)
      else if (pending.kind === 'going') addTo('going', pending.slug)
      else window.location.assign(routes.eventIcs(lang, pending.slug))
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn, lang])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (prompting && !d.open) d.showModal()
    if (!prompting && d.open) d.close()
  }, [prompting])

  const requireSignIn = useCallback(
    (pending: Pending, act: () => void) => {
      if (signedIn) return act()
      if (webview) return setPrompting(pending)
      const { pathname, search } = window.location
      void authClient.signIn.social({
        provider: 'google',
        callbackURL: withPending(pathname, search, pending),
        // Cancelling Google's chooser comes back to the same page, tap dropped.
        errorCallbackURL: withoutPending(pathname, search),
      })
    },
    [signedIn, webview],
  )

  const value = useMemo<Member>(
    () => ({ lang, signedIn, webview, requireSignIn }),
    [lang, signedIn, webview, requireSignIn],
  )

  return (
    <MemberContext.Provider value={value}>
      {children}
      {webview && !signedIn && (
        <dialog
          ref={dialog}
          aria-labelledby="gate-h"
          onClose={() => setPrompting(null)}
          onClick={(e) => {
            // A tap on the backdrop (the dialog element itself) closes it.
            if (e.target === e.currentTarget) setPrompting(null)
          }}
          style={{
            width: 'min(520px, calc(100vw - 32px))',
            padding: 0,
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            background: 'var(--grad-cream)',
            color: 'var(--ink)',
          }}
        >
          <div
            style={{
              padding: 'clamp(16px,3.5vw,24px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <WebviewPrompt
              webview={webview}
              headingId="gate-h"
              onSignedIn={() => {
                // A code sign-in happens in place, so reload with the tap in
                // the URL — the effect above then syncs and finishes it, the
                // same as coming back from Google.
                const { pathname, search } = window.location
                window.location.assign(prompting ? withPending(pathname, search, prompting) : pathname + search)
              }}
              t={t}
            />
            <button
              type="button"
              onClick={() => setPrompting(null)}
              className={s.chipPress}
              style={{
                alignSelf: 'flex-end',
                fontFamily: 'var(--display)',
                fontSize: 15,
                padding: '10px 14px 7px',
                border: '3px solid var(--ink)',
                background: 'var(--cream)',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              {t.close}
            </button>
          </div>
        </dialog>
      )}
    </MemberContext.Provider>
  )
}
