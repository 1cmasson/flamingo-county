'use client'

import { useState, type FormEvent } from 'react'
import type { Lang } from '../i18n'
import { rankingCopy } from '../lib/rankingCopy'
import s from './ranking.module.css'
import p from './promo.module.css'

/**
 * The nomination form on a ranking that is nominating (lib/rankingNominations.ts):
 * the place, and its street if they know it. After sending, a thank-you, the new
 * count, and a way to name one more. The server caps each address per day.
 */
export function RankingNominate({ slug, lang, preview = false }: { slug: string; lang: Lang; preview?: boolean }) {
  const c = rankingCopy(lang)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ name: string; count: number } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError(c.nameMissing)
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
      const res = await fetch('/api/rankings/nominate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name,
          area,
          lang,
          ref,
          utm: new URLSearchParams(window.location.search).get('utm_source'),
          preview,
        }),
      })
      const out = (await res.json()) as { ok: boolean; count?: number; reason?: string }
      if (out.ok) {
        setSent({ name: name.trim(), count: out.count ?? 0 })
        setName('')
        setArea('')
      } else {
        setError(
          out.reason === 'invalid' ? c.nameInvalid : out.reason === 'busy' ? c.nominateBusy : out.reason === 'closed' ? c.nominateClosed : c.failed,
        )
      }
    } catch {
      setError(c.failed)
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className={s.form}>
        <p className={s.thanks}>{c.nominated(sent.name)}</p>
        <p className={p.note}>{c.nominationCount(sent.count)}</p>
        <button type="button" className={`${p.btn} ${p.quiet}`} onClick={() => setSent(null)}>
          {c.nominateAnother}
        </button>
      </div>
    )
  }

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <label className={s.label} htmlFor="nominate-name">
        {c.nameLabel}
      </label>
      <input
        id="nominate-name"
        className={s.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={c.namePlaceholder}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="next"
      />
      <label className={s.label} htmlFor="nominate-area">
        {c.areaLabel}
      </label>
      <input
        id="nominate-area"
        className={s.input}
        value={area}
        onChange={(e) => setArea(e.target.value)}
        placeholder={c.areaPlaceholder}
        maxLength={80}
        autoComplete="off"
        enterKeyHint="send"
      />
      <button type="submit" className={p.btn} disabled={pending}>
        {pending ? c.sending : c.nominateHere}
      </button>
      {error ? <p className={p.error}>{error}</p> : null}
      <p className={p.note}>{c.nominateNote}</p>
    </form>
  )
}
