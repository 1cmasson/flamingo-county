'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Counts a page view on `/api/view` for the site's own visit counter
 * (lib/visits.ts). No cookie, no storage, no id: each beacon is a path, plus,
 * on the first page of a visit, where the visitor came from.
 *
 * The first view of a page load is the visit's entry, unless the visitor came
 * from another page of this site (a full reload after the language toggle, a
 * sign-in redirect). Client-side navigations after it are plain page views:
 * `document.referrer` still names the original site then, and counting it
 * again would credit Google with every click inside the site.
 */
let loaded = false
let lastPath: string | null = null

export function Pageview() {
  const pathname = usePathname()

  useEffect(() => {
    // Dev mode runs effects twice; the same path twice in a row is one view.
    if (!pathname || pathname === lastPath) return
    lastPath = pathname
    if (navigator.webdriver) return

    const first = !loaded
    loaded = true
    let ref: string | null = null
    let sameSite = false
    if (first && document.referrer) {
      try {
        ref = new URL(document.referrer).hostname
        sameSite = ref === window.location.hostname
      } catch {
        ref = null
      }
    }
    const entry = first && !sameSite
    const body = JSON.stringify({
      path: pathname,
      entry,
      ref: entry ? ref : null,
      utm: entry ? new URLSearchParams(window.location.search).get('utm_source') : null,
    })
    const blob = new Blob([body], { type: 'application/json' })
    if (!navigator.sendBeacon?.('/api/view', blob)) {
      fetch('/api/view', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
        () => undefined,
      )
    }
  }, [pathname])

  return null
}
