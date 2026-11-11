'use client'

import { useId, useState, type FormEvent } from 'react'
import type { Lang } from '../i18n'
import { pollOptinWhatsApp, storyPollCopy } from '../lib/storyPollCopy'
import p from './promo.module.css'
import r from './ranking.module.css'
import s from './storyPoll.module.css'

/**
 * "Want to vote every week?", shown under the split once this browser has
 * voted and while the poll is open (StoryPollVote). A WhatsApp number and a
 * consent box the visitor must tick; the server keeps the number with that
 * exact sentence (lib/voteOptins.ts). Nothing is sent to them yet.
 *
 * The small link under it opens WhatsApp with a message to us already
 * written, for people who'd rather write than type their number. Its tap is
 * counted by the site-wide ClickTracker as an `hq-uses` row (tool `poll`,
 * action `whatsapp_optin`, the poll's slug as target).
 */
export function StoryPollOptin({ slug, lang, preview = false }: { slug: string; lang: Lang; preview?: boolean }) {
  const c = storyPollCopy(lang)
  const id = useId()
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!phone.trim()) return setError(c.optinBadPhone)
    if (!consent) return setError(c.optinNeedConsent)
    setPending(true)
    setError(null)
    let ref: string | null = null
    try {
      ref = document.referrer ? new URL(document.referrer).hostname : null
    } catch {
      ref = null
    }
    try {
      const res = await fetch('/api/story-polls/whatsapp-optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          phone,
          consent,
          lang,
          ref,
          utm: new URLSearchParams(window.location.search).get('utm_source'),
          preview,
        }),
      })
      const out = (await res.json()) as { ok: boolean; reason?: string }
      if (out.ok) {
        setDone(true)
        setPhone('')
      } else {
        setError(
          out.reason === 'phone'
            ? c.optinBadPhone
            : out.reason === 'consent'
              ? c.optinNeedConsent
              : out.reason === 'busy'
                ? c.busy
                : out.reason === 'closed'
                  ? c.closedNow
                  : c.failed,
        )
      }
    } catch {
      setError(c.failed)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={s.optin} data-use-tool="poll" data-use-target={slug}>
      <h2 className={p.h2}>{c.optinTitle}</h2>
      {done ? (
        <p className={r.thanks} role="status">
          {c.optinDone}
        </p>
      ) : (
        <form className={r.form} onSubmit={submit} noValidate>
          <p className={s.optinText}>{c.optinText}</p>
          <input
            id={`${id}-phone`}
            className={r.input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={c.optinPhone}
            aria-label={c.optinPhone}
            maxLength={32}
            enterKeyHint="send"
          />
          <label className={s.consent} htmlFor={`${id}-consent`}>
            <input
              id={`${id}-consent`}
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            <span>{c.optinConsent}</span>
          </label>
          <button type="submit" className={`${p.btn} ${p.wa}`} disabled={pending}>
            {pending ? c.sending : c.optinButton}
          </button>
          {error ? (
            <p className={p.error} role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
      {done ? null : (
        <a className={s.optinLink} href={pollOptinWhatsApp(lang)} rel="noopener noreferrer" data-use="whatsapp_optin">
          {c.optinLink}
        </a>
      )}
    </div>
  )
}
