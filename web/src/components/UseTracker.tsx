'use client'

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { linkKind, USE_SECTIONS } from '../lib/useKinds'

/**
 * The browser half of the site's use counter (lib/uses.ts). No cookie, no
 * storage, no id, and never an address: a beacon is what happened, where on
 * the site (`tool`, the page's path), and which public page it was about.
 */
type Use = {
  tool?: string
  action: string
  section?: string
  area?: string
  target?: string
  network?: string
  term?: string
  results?: number
  lang?: string
}

function send(use: Use) {
  if (typeof navigator === 'undefined' || navigator.webdriver) return
  const body = JSON.stringify({ tool: 'address', ...use, path: window.location.pathname })
  if (!navigator.sendBeacon?.('/api/use', new Blob([body], { type: 'application/json' }))) {
    fetch('/api/use', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
      () => undefined,
    )
  }
}

/** Keys already counted in this page load: dev mode runs effects twice, and a re-render is not a new use. */
const seen = new Set<string>()

function sendOnce(key: string, use: Use) {
  if (seen.has(key)) return
  seen.add(key)
  send(use)
}

/**
 * Counts one use when it renders, once per `once` key (the address or search
 * being shown, which stays in the browser), e.g. a lookup or a search.
 */
export function UseOnce({ once, ...use }: Use & { once: string }) {
  useEffect(() => {
    sendOnce(`${use.tool ?? 'address'}:${use.action}:${once}`, use)
  }, [once, use.action]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/**
 * Counts one use the first time this spot scrolls into view, e.g. the end of a
 * story. Renders an empty marker; nothing is sent if it is never reached.
 */
export function UseWhenSeen(use: Use & { target: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      sendOnce(`${use.tool}:${use.action}:${use.target}`, use)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [use.target]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} aria-hidden="true" style={{ height: 1 }} />
}

const SECTIONS = new Set<string>(USE_SECTIONS)

/**
 * Counts taps inside the address report, from one listener: an element with
 * `data-use="print"` (or open_chrome, copy_link, map, change) counts as that;
 * any other link or button counts as a `link` in the card around it (the
 * card's heading id: trash, flood, vote…). The calendar button has no
 * `data-use`: its download is counted where the file is served. Marked
 * `data-use-local`, so the site-wide `ClickTracker` leaves these taps alone.
 */
export function UseClicks({ area, lang, children }: { area?: string; lang?: string; children?: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element | null)?.closest?.('[data-use], a, button')
    if (!el) return
    const named = el.getAttribute('data-use')
    if (named) return send({ tool: 'address', action: named, area, lang })
    const section = el.closest('section[aria-labelledby]')?.getAttribute('aria-labelledby')
    if (section && SECTIONS.has(section)) send({ tool: 'address', action: 'link', section, area, lang })
  }
  return (
    <div style={{ display: 'contents' }} data-use-local="" onClick={onClick}>
      {children}
    </div>
  )
}

/** What a tap was, in the page's context; null when it isn't one we count. */
export function clickUse(target: EventTarget | null, ownHost: string): Use | null {
  const el = (target as Element | null)?.closest?.('[data-use], a[href]')
  if (!el || el.closest('[data-use-local]')) return null
  // The page (or a card on it) says what it is about.
  const ctx = el.closest('[data-use-tool]')
  const tool = ctx?.getAttribute('data-use-tool') ?? 'page'
  const about = ctx?.getAttribute('data-use-target') || undefined
  const named = el.getAttribute('data-use')
  if (named) return { tool, action: named, target: about }
  const kind = linkKind(el.getAttribute('href') ?? '', ownHost)
  return kind ? { tool, target: about, ...kind } : null
}

/**
 * One listener for the whole site, mounted next to `Pageview`: taps on phone
 * numbers, maps, social profiles and other sites, plus any control marked
 * `data-use` (an event's going / save / calendar). Links inside the site are
 * left to the page view. Captures, so a link that navigates away still counts.
 */
export function ClickTracker() {
  useEffect(() => {
    const onClick = (e: globalThis.MouseEvent) => {
      const use = clickUse(e.target, window.location.hostname)
      if (use) send(use)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
