'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { union, type Lists } from './savedLists'

/**
 * Saved and "going" events, kept in localStorage under the same keys the static
 * site used (`fc.saved`, `fc.going`) so an existing visitor's picks survive the
 * move.
 *
 * A subscribable store rather than per-component reads, so the nav badge, the
 * event page and My Week all move together — including across browser tabs.
 *
 * For a signed-in member, localStorage stays what the UI reads and the account
 * is kept in step behind it (see *Sync* below and MEMBERS.md). Signed out,
 * nothing here talks to the server.
 */
const KEY_SAVED = 'fc.saved'
const KEY_GOING = 'fc.going'
/** Set once this device's picks have been merged into the account. */
const KEY_SYNCED = 'fc.synced'
/** A local change the account has not acknowledged yet — survives a reload. */
const KEY_DIRTY = 'fc.dirty'

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
  if (syncLang) {
    localStorage.setItem(KEY_DIRTY, '1')
    schedulePush()
  }
}

function adopt(lists: Lists) {
  localStorage.setItem(KEY_SAVED, JSON.stringify(lists.saved))
  localStorage.setItem(KEY_GOING, JSON.stringify(lists.going))
  cacheRaw = ''
  emit()
}

/* --------------------------------------------------------------------- Sync */

/*
 * Three cases when a signed-in page loads:
 *
 *   first sign-in on this device  → union device + account, store it on both.
 *                                   Nothing saved before signing in is lost.
 *   an unsent local change        → push local; it is the newer copy.
 *   otherwise                     → the account copy replaces local.
 *
 * Union happens once per device, never again: after that, unioning would bring
 * back an event removed on another phone. Signing out clears all of it
 * (forgetDevice), so the next sign-in starts from a clean union.
 *
 * Every toggle writes localStorage first — the UI never waits on the network —
 * then pushes the whole list, debounced. A failed push leaves KEY_DIRTY set and
 * is retried on the next toggle, on `online`, or on the next page load.
 */
let syncLang: string | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined

async function api(method: 'GET' | 'PUT', body?: Lists): Promise<Lists | null> {
  const res = await fetch('/api/me/saved', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify({ ...body, lang: syncLang }) : undefined,
    cache: 'no-store',
  })
  // The session has gone (expired, or signed out in another tab). Stop
  // syncing and keep what is on the device.
  if (res.status === 401) {
    syncLang = null
    return null
  }
  if (!res.ok) throw new Error(`sync ${method} ${res.status}`)
  return res.json()
}

async function push() {
  const sent = read()
  const sentRaw = cacheRaw
  try {
    const stored = await api('PUT', sent)
    // Only adopt the server's cleaned copy if nothing was tapped meanwhile;
    // otherwise the newer tap has its own push queued. read() refreshes
    // cacheRaw from storage, which is what makes the comparison meaningful.
    read()
    if (stored && cacheRaw === sentRaw) {
      localStorage.removeItem(KEY_DIRTY)
      adopt(stored)
    }
  } catch {
    // Stays dirty; retried later.
  }
}

function schedulePush() {
  clearTimeout(pushTimer)
  pushTimer = setTimeout(push, 400)
}

export async function startSync(lang: string) {
  if (syncLang) return
  syncLang = lang
  window.addEventListener('online', () => {
    if (syncLang && localStorage.getItem(KEY_DIRTY)) void push()
  })
  // A tap while a request below is in flight has already written localStorage
  // and queued its own push. Adopting the response would overwrite it, so
  // adopt only if the device copy is unchanged since the request went out.
  const snapshot = () => (read(), cacheRaw)
  try {
    if (localStorage.getItem(KEY_SYNCED) !== '1') {
      const account = await api('GET')
      if (!account) return
      const local = read()
      const before = snapshot()
      const merged = { saved: union(local.saved, account.saved), going: union(local.going, account.going) }
      const stored = await api('PUT', merged)
      if (!stored) return
      localStorage.setItem(KEY_SYNCED, '1')
      if (snapshot() === before) {
        localStorage.removeItem(KEY_DIRTY)
        adopt(stored)
      } else {
        // Tapped mid-merge. The queued push sends whatever is local when it
        // fires, so fold the account's picks in first or it would drop them.
        const now = read()
        adopt({ saved: union(now.saved, stored.saved), going: union(now.going, stored.going) })
      }
    } else if (localStorage.getItem(KEY_DIRTY)) {
      await push()
    } else {
      const before = snapshot()
      const account = await api('GET')
      if (account && snapshot() === before) adopt(account)
    }
  } catch {
    // Offline or a server error: the device copy stands until the next load.
  }
}

/** On sign-out: this device keeps nothing of the account. */
export function forgetDevice() {
  syncLang = null
  clearTimeout(pushTimer)
  for (const k of [KEY_SAVED, KEY_GOING, KEY_SYNCED, KEY_DIRTY]) localStorage.removeItem(k)
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
