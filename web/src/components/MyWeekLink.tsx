'use client'

import Link from 'next/link'
import { useSaved } from '../lib/saved'
import s from './chrome.module.css'

/**
 * The "MY WEEK" nav item with its saved-count badge. The source hid this
 * entirely when nothing was saved, and that behaviour is preserved — but the
 * count lives in localStorage, so the server cannot know it. This renders
 * nothing until after hydration rather than guessing, which keeps the server
 * markup and the first client paint identical.
 */
export function MyWeekLink({
  href,
  label,
  big,
}: {
  href: string
  label: string
  big?: boolean
}) {
  const { ready, saved } = useSaved()
  if (!ready || saved.length === 0) return null

  return (
    <Link
      href={href}
      className={big ? undefined : s.chip}
      style={{
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        gap: big ? 9 : 8,
        fontFamily: 'var(--display)',
        fontSize: big ? 17 : 14,
        ...(big
          ? { minHeight: 48, padding: '12px 16px 9px' }
          : { padding: '9px 12px 7px' }),
        border: '3px solid var(--ink)',
        borderRadius: 3,
        background: 'var(--grad-cream)',
        color: 'var(--ink)',
        boxShadow: `${big ? 4 : 3}px ${big ? 4 : 3}px 0 var(--cyan)`,
      }}
    >
      <span>{label}</span>
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
    </Link>
  )
}
