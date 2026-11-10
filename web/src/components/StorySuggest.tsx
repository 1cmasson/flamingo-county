'use client'

import { useState, type FormEvent } from 'react'
import type { Lang } from '../i18n'
import { storyPollCopy } from '../lib/storyPollCopy'
import r from './ranking.module.css'
import p from './promo.module.css'

/**
 * "Suggest a story", under the weekly vote (lib/storySuggestions.ts): one
 * line of text. Not a fifth option; ideas for next week's. After sending, a
 * thank-you and a way to send one more. The server caps each address per day.
 */
export function StorySuggest({ slug, lang, preview = false }: { slug: string; lang: Lang; preview?: boolean }) {
  const c = storyPollCopy(lang)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) {
      setError(c.suggestMissing)
      return
    }
    setPending(true)
    setError(null)
    let ref: string | null = null
    try {
      ref = document.referrer ? new URL(document.referrer).hostname : null
    } catch {
      ref = null
    }
    try {
      const res = await fetch('/api/story-polls/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          text,
          lang,
          ref,
          utm: new URLSearchParams(window.location.search).get('utm_source'),
          preview,
        }),
      })
      const out = (await res.json()) as { ok: boolean; reason?: string }
      if (out.ok) {
        setSent(true)
        setText('')
      } else {
        setError(out.reason === 'invalid' ? c.suggestInvalid : out.reason === 'busy' ? c.suggestBusy : c.failed)
      }
    } catch {
      setError(c.failed)
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className={r.form}>
        <p className={r.thanks}>{c.suggested}</p>
        <button type="button" className={`${p.btn} ${p.quiet}`} onClick={() => setSent(false)}>
          {c.suggestAnother}
        </button>
      </div>
    )
  }

  return (
    <form className={r.form} onSubmit={submit} noValidate>
      <label className={r.label} htmlFor="suggest-story">
        {c.suggestLabel}
      </label>
      <input
        id="suggest-story"
        className={r.input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={c.suggestPlaceholder}
        maxLength={140}
        autoComplete="off"
        enterKeyHint="send"
      />
      <button type="submit" className={`${p.btn} ${p.quiet}`} disabled={pending}>
        {pending ? c.sending : c.suggestSend}
      </button>
      {error ? <p className={p.error}>{error}</p> : null}
      <p className={p.note}>{c.suggestNote}</p>
    </form>
  )
}
