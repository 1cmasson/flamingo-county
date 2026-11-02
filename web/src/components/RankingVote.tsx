'use client'

import { useState, useSyncExternalStore } from 'react'
import type { Lang } from '../i18n'
import { rankingCopy } from '../lib/rankingCopy'
import type { Stage } from '../lib/rankings'
import s from './ranking.module.css'
import p from './promo.module.css'

/**
 * One head-to-head in an open round (lib/rankings.ts). Before voting it shows
 * two buttons and no numbers, so the count doesn't sway the vote; after, the
 * split. The browser remembers today's vote on this matchup; inside
 * Instagram's browser that memory may not last, and the server's per-address
 * cap is the backstop.
 */
type Side = { key: string; name: string }

const miamiDay = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const KEY = (slug: string, stage: Stage, index: number) => `fc.vote.${slug}.${stage}.${index}`

/** Storage can be blocked (some in-app browsers, private mode): then nothing is remembered. */
function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function remembered(key: string): [number, number] | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const v = JSON.parse(raw) as { day: string; votes: [number, number] }
    return v.day === miamiDay() ? v.votes : null
  } catch {
    return null
  }
}

const noSubscribe = () => () => undefined

export function RankingVote({
  slug,
  lang,
  stage,
  index,
  a,
  b,
}: {
  slug: string
  lang: Lang
  stage: Stage
  index: number
  a: Side
  b: Side
}) {
  const c = rankingCopy(lang)
  const key = KEY(slug, stage, index)
  const earlier = useSyncExternalStore(noSubscribe, () => stored(key), () => null)
  const [fresh, setFresh] = useState<[number, number] | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const votes = fresh ?? (earlier ? remembered(key) : null)

  async function vote(pick: string) {
    setPending(true)
    setError(null)
    let ref: string | null = null
    try {
      ref = document.referrer ? new URL(document.referrer).hostname : null
    } catch {
      ref = null
    }
    try {
      const res = await fetch('/api/rankings/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          matchup: index,
          pick,
          lang,
          ref,
          utm: new URLSearchParams(window.location.search).get('utm_source'),
        }),
      })
      const out = (await res.json()) as { ok: boolean; votes?: [number, number]; reason?: string }
      if (out.ok && out.votes) {
        try {
          localStorage.setItem(key, JSON.stringify({ day: miamiDay(), votes: out.votes }))
        } catch {
          // Storage blocked: the vote still counted.
        }
        setFresh(out.votes)
      } else {
        setError(out.reason === 'busy' ? c.busy : out.reason === 'closed' ? c.closed : c.failed)
      }
    } catch {
      setError(c.failed)
    } finally {
      setPending(false)
    }
  }

  if (votes) {
    const total = votes[0] + votes[1] || 1
    return (
      <div className={s.game}>
        {[a, b].map((side, i) => (
          <div key={side.key} className={s.side}>
            <i className={s.bar} style={{ width: `${Math.round((votes[i] / total) * 100)}%` }} aria-hidden />
            <span>{side.name}</span>
            <span className={s.count}>{Math.round((votes[i] / total) * 100)}%</span>
          </div>
        ))}
        <p className={p.note}>{c.voted}</p>
      </div>
    )
  }

  return (
    <div className={s.game}>
      <button type="button" className={s.side} disabled={pending} onClick={() => vote(a.key)} aria-label={c.voteFor(a.name)}>
        <span>{a.name}</span>
      </button>
      <p className={s.vs}>VS</p>
      <button type="button" className={s.side} disabled={pending} onClick={() => vote(b.key)} aria-label={c.voteFor(b.name)}>
        <span>{b.name}</span>
      </button>
      {pending ? <p className={p.note}>{c.sending}</p> : null}
      {error ? <p className={p.error}>{error}</p> : null}
    </div>
  )
}
