'use client'

import Link from 'next/link'
import { useSaved } from '../lib/saved'
import s from './chrome.module.css'

/**
 * The saved-event count shown next to MY WEEK, in the desktop bar and the
 * burger menu. The count lives in localStorage, so the server cannot know it:
 * this renders nothing until after hydration rather than guessing, which keeps
 * the server markup and the first client paint identical.
 */
export function MyWeekCount({ big }: { big?: boolean }) {
  const { ready, saved } = useSaved()
  if (!ready || saved.length === 0) return null

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: big ? 24 : 22,
        height: big ? 24 : 22,
        padding: big ? '0 6px' : '0 5px',
        background: 'var(--ink)',
        color: 'var(--cream)',
        fontSize: big ? 14 : 13,
        lineHeight: 1,
      }}
    >
      {saved.length}
    </span>
  )
}

/**
 * The "MY WEEK" nav item. The source hid it until something was saved, which
 * meant nobody could find the page before using it — so it is always here now,
 * and only the count badge waits for a save.
 */
export function MyWeekLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className={s.chip}
      style={{
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        gap: 8,
        fontFamily: 'var(--display)',
        fontSize: 14,
        padding: '9px 12px 7px',
        border: '3px solid var(--ink)',
        borderRadius: 3,
        background: 'var(--grad-cream)',
        color: 'var(--ink)',
        boxShadow: '3px 3px 0 var(--cyan)',
      }}
    >
      <span>{label}</span>
      <MyWeekCount />
    </Link>
  )
}
