'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Lang } from '../i18n'
import { promoCopy } from '../lib/promoCopy'
import s from './promo.module.css'

/**
 * The staff's half of a coupon (lib/promos.ts): "Staff: mark as used", the
 * business's 4-digit PIN, done. On success the page is re-rendered by the
 * server, which shows the green USED stamp with the time, so what staff see
 * is what is stored.
 */
type Result = { status: string; triesLeft?: number }

export function CouponRedeem({ code, lang }: { code: string; lang: Lang }) {
  const c = promoCopy(lang)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setMessage(null)
    let out: Result
    try {
      const res = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, pin }),
      })
      out = (await res.json()) as Result
    } catch {
      out = { status: 'failed' }
    }
    setPending(false)
    if (out.status === 'redeemed' || out.status === 'used' || out.status === 'ended') {
      router.refresh()
      return
    }
    setPin('')
    setMessage(
      out.status === 'wrong-pin'
        ? c.wrongPin(out.triesLeft ?? 0)
        : out.status === 'locked'
          ? c.locked
          : out.status === 'not-ready'
            ? c.notReady
            : c.failed,
    )
    if (out.status === 'locked') router.refresh()
  }

  if (!open) {
    return (
      <button type="button" className={`${s.btn} ${s.quiet}`} onClick={() => setOpen(true)}>
        {c.staff}
      </button>
    )
  }

  return (
    <form className={s.staff} onSubmit={submit}>
      <label htmlFor="coupon-pin">{c.pinLabel}</label>
      <input
        id="coupon-pin"
        className={s.pin}
        inputMode="numeric"
        pattern="[0-9]{4}"
        maxLength={4}
        autoComplete="off"
        autoFocus
        required
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        aria-describedby={message ? 'coupon-pin-msg' : undefined}
      />
      {message ? (
        <p id="coupon-pin-msg" role="alert" style={{ margin: 0, fontWeight: 800, color: 'var(--yellow)' }}>
          {message}
        </p>
      ) : null}
      <div className={s.row}>
        <button
          type="button"
          className={`${s.btn} ${s.quiet}`}
          onClick={() => {
            setOpen(false)
            setPin('')
            setMessage(null)
          }}
        >
          {c.cancel}
        </button>
        <button type="submit" className={s.btn} disabled={pending || pin.length !== 4}>
          {c.confirm}
        </button>
      </div>
    </form>
  )
}
