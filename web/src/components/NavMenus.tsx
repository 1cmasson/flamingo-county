'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import s from './chrome.module.css'

/**
 * The active tab is derived from the pathname *in the client*, not passed in.
 *
 * Nav renders in `[lang]/layout.tsx`, and App Router does not re-render a
 * layout on a navigation that leaves its segment unchanged — so a server-
 * computed `on` boolean froze on the first page loaded and the highlight never
 * moved between cities.
 */
export type CityTab = { label: string; href: string }

const tabStyle = (on: boolean, big?: boolean) => ({
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: big ? ('center' as const) : ('flex-start' as const),
  cursor: 'pointer',
  fontFamily: 'var(--display)',
  fontSize: 15,
  ...(big ? { minHeight: 46, padding: '9px 12px 7px' } : { padding: '10px 13px 8px' }),
  border: '3px solid var(--ink)',
  borderRadius: 3,
  background: on ? 'var(--yellow)' : 'var(--grad-cream)',
  color: 'var(--ink)',
  boxShadow: `3px 3px 0 ${on ? 'var(--cyan)' : 'var(--pink)'}`,
})

/**
 * The desktop "LISTINGS" dropdown.
 *
 * The source kept it open until something toggled it; this also closes on
 * Escape and on an outside click, which a menu anchored over page content
 * should do.
 */
export function ListingsMenu({ label, tabs }: { label: string; tabs: CityTab[] }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={wrap} style={{ position: 'relative', flex: '0 0 auto', zIndex: 90 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={s.chip}
        style={{
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          fontFamily: 'var(--display)',
          fontSize: 15,
          padding: '9px 14px 7px',
          border: '3px solid var(--ink)',
          borderRadius: 3,
          background: open ? 'var(--yellow)' : 'var(--grad-cream)',
          color: 'var(--ink)',
          boxShadow: `3px 3px 0 ${open ? 'var(--cyan)' : 'var(--pink)'}`,
        }}
      >
        <span>{label}</span>
        <span
          style={{
            display: 'block',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '7px solid var(--ink)',
            transition: 'transform 240ms cubic-bezier(.2,.8,.25,1)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      <div
        style={{
          position: 'absolute',
          top: 'calc(100% + 10px)',
          left: 0,
          minWidth: 230,
          zIndex: 90,
          background: 'var(--ink)',
          border: '3px solid var(--cyan)',
          boxShadow: '6px 6px 0 rgba(0,0,0,0.45)',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          transformOrigin: 'top left',
          transition: `transform 240ms cubic-bezier(.2,.85,.25,1), opacity 180ms ease, visibility 0s linear ${open ? '0s' : '240ms'}`,
          transform: open ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.96)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={s.chip}
            aria-current={t.href === pathname ? 'page' : undefined}
            style={tabStyle(t.href === pathname)}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

/**
 * The mobile burger and its slide-down panel. The three bars morph into an X,
 * same transforms as the source.
 */
export function BurgerMenu({
  tabs,
  links,
  citiesLabel,
}: {
  tabs: CityTab[]
  links: { href: string; label: string; shadow: string; background: string; badge?: React.ReactNode }[]
  citiesLabel: string
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        style={{
          cursor: 'pointer',
          width: 48,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 11px',
          border: '3px solid var(--ink)',
          borderRadius: 3,
          background: 'var(--grad-cream)',
          boxShadow: '3px 3px 0 var(--pink)',
        }}
      >
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            transition: 'transform 320ms cubic-bezier(.2,.8,.25,1)',
            transform: open ? 'rotate(-90deg)' : 'rotate(0deg)',
          }}
        >
          <div
            style={{
              height: 4,
              background: 'var(--ink)',
              transition: 'transform 320ms cubic-bezier(.2,.8,.25,1)',
              transform: open ? 'translateY(9px) rotate(45deg)' : 'none',
            }}
          />
          <div
            style={{
              height: 4,
              background: 'var(--ink)',
              transition: 'opacity 320ms ease, transform 320ms cubic-bezier(.2,.8,.25,1)',
              opacity: open ? 0 : 1,
              transform: open ? 'scaleX(0.2)' : 'none',
            }}
          />
          <div
            style={{
              height: 4,
              background: 'var(--ink)',
              transition: 'transform 320ms cubic-bezier(.2,.8,.25,1)',
              transform: open ? 'translateY(-9px) rotate(-45deg)' : 'none',
            }}
          />
        </div>
      </button>

      <div
        data-navpanel="1"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          background: 'var(--ink)',
          borderTop: '5px solid var(--cyan)',
          padding: '14px clamp(12px,3vw,22px) 18px',
          flexDirection: 'column',
          gap: 14,
          zIndex: 70,
          transformOrigin: 'top center',
          transition: `transform 320ms cubic-bezier(.2,.8,.25,1), opacity 320ms ease, visibility 0s linear ${open ? '0s' : '320ms'}`,
          transform: open ? 'scaleY(1)' : 'scaleY(0)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--body)',
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: '2.4px',
            color: 'var(--cyan)',
          }}
        >
          {citiesLabel}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.href === pathname ? 'page' : undefined}
              style={tabStyle(t.href === pathname, true)}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div style={{ height: 3, background: 'var(--cyan)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                cursor: 'pointer',
                fontFamily: 'var(--display)',
                fontSize: 17,
                minHeight: 48,
                padding: '12px 16px 9px',
                border: '3px solid var(--ink)',
                borderRadius: 3,
                background: l.background,
                color: 'var(--ink)',
                boxShadow: `4px 4px 0 ${l.shadow}`,
              }}
            >
              <span>{l.label}</span>
              {l.badge}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
