'use client'

import { useState, useSyncExternalStore } from 'react'
import type { Lang } from '../i18n'
import { promoCopy } from '../lib/promoCopy'
import { routes } from '../lib/routes'
import s from './promo.module.css'

/**
 * "Get my coupon" on a promotion page (lib/promos.ts). The coupon's page is
 * the durable copy; the code is also remembered in this browser so the same
 * visitor coming back sees their coupon instead of taking another. Inside
 * Instagram's browser that memory often doesn't last, which is why the coupon
 * page pushes "Save it to WhatsApp".
 */
const KEY = (slug: string) => `fc.coupon.${slug}`

function remembered(slug: string): string | null {
  try {
    return localStorage.getItem(KEY(slug))
  } catch {
    // Storage blocked: every visit can take a coupon, which is fine.
    return null
  }
}

/** Nothing to subscribe to: the code is only written just before leaving the page. */
const noSubscribe = () => () => undefined

export function PromoClaim({ slug, lang }: { slug: string; lang: Lang }) {
  const c = promoCopy(lang)
  // The server renders the button; the browser swaps in "Open my coupon" if it has one.
  const mine = useSyncExternalStore(noSubscribe, () => remembered(slug), () => null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function claim() {
    setPending(true)
    setError(null)
    let ref: string | null = null
    try {
      ref = document.referrer ? new URL(document.referrer).hostname : null
    } catch {
      ref = null
    }
    try {
      const res = await fetch('/api/promo/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          lang,
          ref,
          utm: new URLSearchParams(window.location.search).get('utm_source'),
        }),
      })
      const out = (await res.json()) as { ok: boolean; code?: string; reason?: string }
      if (out.ok && out.code) {
        try {
          localStorage.setItem(KEY(slug), out.code)
        } catch {
          // The coupon page is the copy that matters.
        }
        window.location.assign(routes.coupon(lang, slug, out.code))
        return
      }
      setError(
        out.reason === 'busy'
          ? c.busy
          : out.reason === 'ended'
            ? c.ended
            : out.reason === 'full'
              ? c.full
              : out.reason === 'not-ready'
                ? c.soon
                : c.failed,
      )
    } catch {
      setError(c.failed)
    }
    setPending(false)
  }

  if (mine) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className={s.note}>{c.haveOne}</p>
        <a className={s.btn} href={routes.coupon(lang, slug, mine)}>
          🎟️ {c.open}
        </a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button type="button" className={s.btn} onClick={claim} disabled={pending}>
        🎟️ {pending ? c.getting : c.get}
      </button>
      {error ? (
        <p className={s.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={s.note}>{c.free}</p>
    </div>
  )
}
