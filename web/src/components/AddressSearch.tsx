'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import s from './address.module.css'

type Suggestion = { slug: string; label: string; zip: string }

export type AddressSearchCopy = {
  placeholder: string
  inputLabel: string
  listLabel: string
  go: string
  locate: string
  locating: string
  isThisIt: string
  yesThis: string
  noLocation: string
  notNear: string
  noMatch: string
  privacy: string
}

/**
 * The address box: type a few characters and pick the city's own spelling of
 * the address from a list, the way a map app does it. Built for someone who
 * types slowly and with mistakes: "5410 west 6th lane" and "5410 6 ln" both
 * find 5410 W 6th Ln, and the house number alone narrows it fast.
 *
 * The list comes from /api/address/suggest. The box is a plain GET form too,
 * so Enter with nothing picked still goes somewhere useful: the first match.
 */
export function AddressSearch({ lang, copy, initial = '' }: { lang: string; copy: AddressSearchCopy; initial?: string }) {
  const router = useRouter()
  const uid = useId()
  const wrap = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState(initial)
  const [fetched, setFetched] = useState<Suggestion[]>([])
  const [searched, setSearched] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [locating, setLocating] = useState(false)
  const [found, setFound] = useState<Suggestion | null>(null)
  const [note, setNote] = useState('')

  const href = (r: Suggestion) => `/${lang}/address?a=${r.slug}`
  const listId = `${uid}-list`
  const optId = (i: number) => `${uid}-opt-${i}`
  // Under two characters there is nothing to ask for, and the last answer no longer applies.
  const results = query.trim().length >= 2 ? fetched : []
  const show = open && results.length > 0

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/address/suggest?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        const json = (await res.json()) as { results: Suggestion[] }
        setFetched(json.results)
        setSearched(q)
        setActive(-1)
      } catch {
        /* a newer keystroke took over */
      }
    }, 120)
    return () => {
      clearTimeout(t)
      ctl.abort()
    }
  }, [query])

  useEffect(() => {
    if (!show) return
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [show])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (show) {
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      }
      return
    }
    if (e.key === 'ArrowDown' && results.length) {
      e.preventDefault()
      setOpen(true)
      setActive((a) => (a + 1) % results.length)
    } else if (e.key === 'ArrowUp' && results.length) {
      e.preventDefault()
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1))
    } else if (e.key === 'Enter') {
      const pick = results[active >= 0 ? active : 0]
      if (pick) {
        e.preventDefault()
        setOpen(false)
        router.push(href(pick))
      }
    }
  }

  function locate() {
    setNote('')
    setFound(null)
    if (!('geolocation' in navigator)) return setNote(copy.noLocation)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch('/api/address/near', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
          })
          const json = (await res.json()) as { result: Suggestion | null }
          if (json.result) setFound(json.result)
          else setNote(copy.notNear)
        } catch {
          setNote(copy.noLocation)
        } finally {
          setLocating(false)
        }
      },
      () => {
        setLocating(false)
        setNote(copy.noLocation)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  }

  const noMatch = searched.length >= 4 && searched === query.trim() && results.length === 0

  return (
    <div className={s.search}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (results[0]) router.push(href(results[0]))
        }}
      >
        <div ref={wrap} style={{ position: 'relative' }}>
          <label htmlFor={`${uid}-input`} className={s.srOnly}>
            {copy.inputLabel}
          </label>
          <input
            id={`${uid}-input`}
            className={s.input}
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value)
              setOpen(true)
              setActive(-1)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={copy.placeholder}
            role="combobox"
            aria-expanded={show}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={show && active >= 0 ? optId(active) : undefined}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="search"
            inputMode="text"
          />
          <div id={listId} role="listbox" aria-label={copy.listLabel} className={s.list} data-open={show ? '1' : '0'}>
            {show &&
              results.map((r, i) => (
                <Link
                  key={r.slug}
                  id={optId(i)}
                  role="option"
                  aria-selected={i === active}
                  href={href(r)}
                  prefetch={false}
                  tabIndex={-1}
                  className={s.option}
                  data-active={i === active ? '1' : '0'}
                  onMouseDown={(e) => e.preventDefault()}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => setOpen(false)}
                >
                  <span className={s.optionLabel}>{r.label}</span>
                  <span className={s.optionZip}>HIALEAH · {r.zip}</span>
                </Link>
              ))}
          </div>
        </div>
        <div className={s.searchRow}>
          <button type="submit" className={s.goBtn} disabled={!results.length}>
            {copy.go}
          </button>
          <button type="button" className={s.locateBtn} onClick={locate} disabled={locating}>
            <span aria-hidden="true">📍</span> {locating ? copy.locating : copy.locate}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {noMatch ? <p className={s.note}>{copy.noMatch}</p> : null}
        {note ? <p className={s.note}>{note}</p> : null}
        {found ? (
          <div className={s.found}>
            <span className={s.foundQ}>{copy.isThisIt}</span>
            <span className={s.optionLabel}>
              {found.label} · {found.zip}
            </span>
            <Link href={href(found)} className={s.goBtn} prefetch={false}>
              {copy.yesThis}
            </Link>
          </div>
        ) : null}
      </div>
      <p className={s.privacy}>{copy.privacy}</p>
    </div>
  )
}
