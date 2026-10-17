'use client'

import { useEffect, type MouseEvent, type ReactNode } from 'react'
import { USE_SECTIONS } from '../lib/useKinds'

/**
 * The browser half of the address tool's use counter (lib/uses.ts). No
 * cookie, no storage, no id, and never the address: a beacon is an action,
 * the address's municipality and the page's language.
 */
type Use = { action: string; section?: string; area?: string; lang?: string }

function send(use: Use) {
  if (typeof navigator === 'undefined' || navigator.webdriver) return
  const body = JSON.stringify(use)
  if (!navigator.sendBeacon?.('/api/use', new Blob([body], { type: 'application/json' }))) {
    fetch('/api/use', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
      () => undefined,
    )
  }
}

/** Keys already counted in this page load: dev mode runs effects twice, and a re-render is not a new lookup. */
const seen = new Set<string>()

/**
 * Counts one action when it renders, once per `once` key (the address being
 * shown, which stays in the browser), e.g. a lookup.
 */
export function UseOnce({ once, ...use }: Use & { once: string }) {
  useEffect(() => {
    const key = `${use.action}:${once}`
    if (seen.has(key)) return
    seen.add(key)
    send(use)
  }, [once, use.action]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

const SECTIONS = new Set<string>(USE_SECTIONS)

/**
 * Counts taps inside the report, from one listener: an element with
 * `data-use="print"` (or open_chrome, copy_link, map, change) counts as that;
 * any other link or button counts as a `link` in the card around it (the
 * card's heading id: trash, flood, vote…). The calendar button has no
 * `data-use`: its download is counted where the file is served.
 */
export function UseClicks({ area, lang, children }: { area?: string; lang?: string; children?: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const el = (e.target as Element | null)?.closest?.('[data-use], a, button')
    if (!el) return
    const named = el.getAttribute('data-use')
    if (named) return send({ action: named, area, lang })
    const section = el.closest('section[aria-labelledby]')?.getAttribute('aria-labelledby')
    if (section && SECTIONS.has(section)) send({ action: 'link', section, area, lang })
  }
  return (
    <div style={{ display: 'contents' }} onClick={onClick}>
      {children}
    </div>
  )
}
