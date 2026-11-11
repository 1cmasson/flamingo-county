'use client'

import { useState } from 'react'
import type { Lang } from '../i18n'
import { storyPollCopy } from '../lib/storyPollCopy'
import type { PollPhase, PollTally } from '../lib/storyPolls'
import { StoryPollOptin } from './StoryPollOptin'
import p from './promo.module.css'
import s from './storyPoll.module.css'

/**
 * The stories of the weekly vote (lib/storyPolls.ts), numbered like the
 * reel's "comment 1, 2, 3 or 4". While open and before voting, each story is
 * one button and no numbers show, so the split doesn't sway the pick; one
 * tap votes, then every story shows its share. The page passes the split
 * only once this browser has voted (its cookie) or the poll has closed.
 *
 * Once this browser has voted and while the poll is still open, a small box
 * asks them to vote every week by WhatsApp (StoryPollOptin).
 */
export type PollOptionView = {
  key: string
  title: string
  teaser: string | null
  image: { src: string; alt: string } | null
}

type Result = PollTally & { pick: string | null; note: 'voted' | 'already' | null }

export function StoryPollVote({
  slug,
  lang,
  phase,
  options,
  initial,
  winner = null,
  preview = false,
}: {
  slug: string
  lang: Lang
  phase: PollPhase
  options: PollOptionView[]
  /** The split, when this browser already voted (with its pick) or the poll has closed. */
  initial: (PollTally & { pick: string | null }) | null
  /** The winning key, once closed. */
  winner?: string | null
  /** The admin's preview of an unpublished poll: votes go in as tests. */
  preview?: boolean
}) {
  const c = storyPollCopy(lang)
  const [result, setResult] = useState<Result | null>(
    initial ? { ...initial, note: initial.pick && phase === 'open' ? 'already' : null } : null,
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const res = await fetch('/api/story-polls/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          pick,
          lang,
          ref,
          utm: new URLSearchParams(window.location.search).get('utm_source'),
          preview,
        }),
      })
      const out = (await res.json()) as Partial<PollTally> & { ok: boolean; pick?: string; reason?: string }
      if (out.counts && typeof out.total === 'number' && (out.ok || out.reason === 'already')) {
        setResult({ counts: out.counts, total: out.total, pick: out.pick ?? pick, note: out.ok ? 'voted' : 'already' })
      } else {
        setError(out.reason === 'busy' ? c.busy : out.reason === 'closed' ? c.closedNow : c.failed)
      }
    } catch {
      setError(c.failed)
    } finally {
      setPending(false)
    }
  }

  const closed = phase === 'closed'
  const showSplit = Boolean(result) && (closed || phase === 'open')

  return (
    <div className={s.poll}>
      {result?.note ? <p className={p.note}>{result.note === 'voted' ? c.voted : c.alreadyVoted}</p> : null}
      {phase === 'open' && !result ? <p className={p.note}>{c.tapOne}</p> : null}
      <ol className={s.options}>
        {options.map((o, i) => {
          const n = i + 1
          const share = showSplit && result ? (result.total > 0 ? Math.round(((result.counts[o.key] ?? 0) / result.total) * 100) : 0) : null
          const picked = result?.pick === o.key
          const won = closed && winner === o.key
          const inner = (
            <>
              <span className={s.num} aria-hidden>
                {n}
              </span>
              {o.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={s.thumb}
                  src={o.image.src}
                  alt={o.image.alt}
                  width={76}
                  height={76}
                  loading={i < 2 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              ) : (
                <span className={s.thumb} aria-hidden />
              )}
              <span className={s.text}>
                {won ? <span className={s.tag}>{c.winner}</span> : picked ? <span className={s.tag}>{c.yourPick}</span> : null}
                <span className={s.title}>{o.title}</span>
                {share === null ? (
                  o.teaser ? <span className={s.teaser}>{o.teaser}</span> : null
                ) : (
                  <span className={s.meter}>
                    <span className={s.track} aria-hidden>
                      <i className={s.fill} style={{ width: `${share}%` }} />
                    </span>
                    <span className={s.pct}>{share}%</span>
                  </span>
                )}
              </span>
            </>
          )
          return (
            <li key={o.key}>
              {phase === 'open' && !result ? (
                <button type="button" className={s.option} disabled={pending} onClick={() => vote(o.key)} aria-label={c.voteFor(n, o.title)}>
                  {inner}
                </button>
              ) : (
                <div className={`${s.option} ${picked ? s.picked : ''} ${won ? s.won : ''}`}>{inner}</div>
              )}
            </li>
          )
        })}
      </ol>
      {showSplit && result ? (
        <p className={p.meta}>{result.total ? (closed ? c.finalTotal(result.total) : c.total(result.total)) : closed ? c.noVotes : c.total(0)}</p>
      ) : null}
      {phase === 'open' && result ? <StoryPollOptin slug={slug} lang={lang} preview={preview} /> : null}
      {pending ? <p className={p.note}>{c.sending}</p> : null}
      {error ? <p className={p.error}>{error}</p> : null}
    </div>
  )
}
