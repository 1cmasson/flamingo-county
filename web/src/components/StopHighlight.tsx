'use client'

import { useEffect } from 'react'

/**
 * Lights up the stop a listing linked to (`#stop-1234`).
 *
 * CSS `:target` alone isn't enough: a <Link> from the business page arrives by
 * client-side navigation, which sets the hash with pushState — and pushState
 * never updates `:target`. So the stop is marked with an attribute instead,
 * on arrival and on every later hash change, and the stylesheet keys on that.
 */
export function StopHighlight() {
  useEffect(() => {
    const mark = () => {
      document.querySelectorAll('[data-hit]').forEach((el) => el.removeAttribute('data-hit'))
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id.startsWith('stop-')) return
      const el = document.getElementById(id)
      if (!el) return
      el.setAttribute('data-hit', '')
      // A stop folded inside "more stops" opens its fold first.
      const fold = el.closest('details')
      if (fold && !fold.open) fold.open = true
      el.scrollIntoView({ block: 'center' })
    }
    mark()
    window.addEventListener('hashchange', mark)
    return () => window.removeEventListener('hashchange', mark)
  }, [])
  return null
}
