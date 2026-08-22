'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { prepare, rankMatches, type Suggestion } from '../lib/search'

/**
 * The type-ahead layer over the search box.
 *
 * It is a layer, not a replacement. The surrounding `<form method="GET">` still
 * does the whole job on its own — this component adds a listbox and an
 * Enter-to-jump path on top of it, and with JavaScript off the form behaves
 * exactly as it did before this existed.
 *
 * All the data arrives as props with the document (11 rows, ~3 KB), so matching
 * is synchronous and local. There is no fetch and deliberately no debounce:
 * debouncing a scan this size would only add latency to something already
 * finished before the next keystroke.
 */
export function SearchSuggest({
  q,
  placeholder,
  listboxLabel,
  items,
}: {
  q: string
  placeholder: string
  listboxLabel: string
  items: Suggestion[]
}) {
  const router = useRouter()
  const uid = useId()
  const wrap = useRef<HTMLDivElement>(null)

  // The input stays uncontrolled — `query` only drives matching. That keeps
  // browser form restoration working, and it is what the ARIA combobox pattern
  // wants: moving the active option must not rewrite what the visitor typed.
  const [query, setQuery] = useState(q)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const prepared = useMemo(() => prepare(items), [items])
  const results = useMemo(() => rankMatches(prepared, query), [prepared, query])
  const show = open && results.length > 0

  const listId = `${uid}-listbox`
  const optId = (i: number) => `${uid}-opt-${i}`

  // Escape and outside-click, in the shape NavMenus.tsx already uses. `setOpen`
  // is the raw useState setter, so the dependency list is honest and this needs
  // no eslint exception.
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [show])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      // preventDefault, or Firefox empties the field instead of just closing.
      if (show) {
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      }
      return
    }
    if (!show) {
      if (e.key === 'ArrowDown' && results.length) {
        e.preventDefault()
        setOpen(true)
        setActive(0)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((a) => (a + 1) % results.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => (a <= 0 ? results.length - 1 : a - 1))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(results.length - 1)
        break
      case 'Tab':
        setOpen(false)
        break
      case 'Enter':
        // Only when a row is highlighted. With nothing highlighted this falls
        // through to the form's native GET submit, which is the existing
        // full-text search — that path must keep working untouched.
        if (active >= 0) {
          e.preventDefault()
          setOpen(false)
          router.push(results[active].href)
        }
        break
    }
  }

  return (
    <div ref={wrap} style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
      <input
        name="q"
        defaultValue={q}
        onChange={(e) => {
          setQuery(e.currentTarget.value)
          // Typing always drops the highlight. It keeps the active index from
          // ever pointing past a shrunken list, which is the thing that would
          // otherwise need an effect to reconcile.
          setActive(-1)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optId(active) : undefined}
        // Without this the browser's own form-history dropdown renders on top
        // of the listbox. The other three matter on iOS.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        style={{
          width: '100%',
          fontSize: 14,
          fontWeight: 600,
          padding: '10px 12px',
          border: '3px solid var(--ink)',
          background: 'var(--grad-cream)',
          color: 'var(--ink)',
          outline: 'none',
        }}
      />

      {/* Rendered even when closed so `aria-controls` always resolves; the
          visibility delay keeps it out of the tab order until it is open. */}
      <div
        id={listId}
        role="listbox"
        aria-label={listboxLabel}
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          zIndex: 60,
          background: 'var(--grad-cream)',
          border: '3px solid var(--ink)',
          boxShadow: '6px 6px 0 var(--ink)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'min(60vh, 420px)',
          overflowY: 'auto',
          transition: `opacity 140ms ease, visibility 0s linear ${show ? '0s' : '140ms'}`,
          opacity: show ? 1 : 0,
          visibility: show ? 'visible' : 'hidden',
          pointerEvents: show ? 'auto' : 'none',
        }}
      >
        {show &&
          results.map((r, i) => (
            <Link
              key={r.id}
              id={optId(i)}
              role="option"
              aria-selected={i === active}
              href={r.href}
              // The whole public subtree is force-dynamic with no loading.tsx,
              // so prefetching would fire a full server render per row.
              prefetch={false}
              tabIndex={-1}
              // Keeps the caret in the input on desktop; a no-op on touch. The
              // tap itself stays a plain anchor activation — suppressing
              // pointerdown here is what actually loses taps and breaks
              // scroll-drag inside the list.
              onMouseDown={(e) => e.preventDefault()}
              onPointerEnter={() => setActive(i)}
              onClick={() => {
                setOpen(false)
                setActive(-1)
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '9px 12px',
                textDecoration: 'none',
                borderTop: i === 0 ? 'none' : '2px dotted var(--ink)',
                // The highlight is driven only by `active`, never by CSS
                // :hover, so there is no sticky-hover to gate behind
                // @media (hover:hover) and nothing to strand after a tap.
                background: i === active ? 'var(--yellow)' : 'transparent',
                color: 'var(--ink)',
              }}
            >
              <span style={{ fontFamily: 'var(--display)', fontSize: 16, lineHeight: 1.1 }}>
                {r.name}
              </span>
              {r.meta ? (
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '1.5px',
                    color: 'var(--magenta)',
                  }}
                >
                  {r.meta}
                </span>
              ) : null}
            </Link>
          ))}
      </div>
    </div>
  )
}
