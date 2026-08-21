'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

/**
 * Saved and "going" events, kept in localStorage under the same keys the static
 * site used (`fc.saved`, `fc.going`) so an existing visitor's picks survive the
 * move. There is no server side to this until there are accounts.
 *
 * A subscribable store rather than per-component reads, so the nav badge, the
 * event page and My Week all move together — including across browser tabs.
 */
const KEY_SAVED = 'fc.saved'
const KEY_GOING = 'fc.going'

type Store = { saved: string[]; going: string[] }

const EMPTY: Store = { saved: [], going: [] }
let cache: Store = EMPTY
let cacheRaw = ''

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function read(): Store {
  if (typeof window === 'undefined') return EMPTY
  const raw = `${localStorage.getItem(KEY_SAVED) ?? ''}|${localStorage.getItem(KEY_GOING) ?? ''}`
  // getSnapshot must return a stable reference or React re-renders forever.
  if (raw === cacheRaw) return cache
  const parse = (k: string): string[] => {
    try {
      const v = JSON.parse(localStorage.getItem(k) ?? '[]')
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  cacheRaw = raw
  cache = { saved: parse(KEY_SAVED), going: parse(KEY_GOING) }
  return cache
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

function write(key: string, next: string[]) {
  localStorage.setItem(key, JSON.stringify(next))
  cacheRaw = ''
  emit()
}

/**
 * The server has no localStorage, so the server snapshot is empty and the real
 * value arrives after hydration. `mounted` lets callers render the empty state
 * on the first client paint too — without it the markup would differ from the
 * server's and React would report a hydration mismatch on every page, since the
 * nav badge is in the layout.
 */
export function useSaved() {
  const store = useSyncExternalStore(subscribe, read, () => EMPTY)
  const [mounted, setMounted] = useState(false)
  // `react-hooks/set-state-in-effect` is right in general, and this is the
  // exception it cannot see: the flag exists precisely to make the first client
  // render match the server's, so the cascading second render is the point, not
  // an accident. Removing it would need `ready` to come from the store itself,
  // which is a hydration change worth making deliberately rather than to
  // silence a lint rule.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  const toggle = useCallback((key: string, id: string) => {
    const current = read()[key === KEY_SAVED ? 'saved' : 'going']
    write(key, current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
  }, [])

  return {
    ready: mounted,
    saved: mounted ? store.saved : EMPTY.saved,
    going: mounted ? store.going : EMPTY.going,
    isSaved: (id: string) => mounted && store.saved.includes(id),
    isGoing: (id: string) => mounted && store.going.includes(id),
    toggleSaved: (id: string) => toggle(KEY_SAVED, id),
    toggleGoing: (id: string) => toggle(KEY_GOING, id),
  }
}
