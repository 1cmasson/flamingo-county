'use client'

import { useEffect } from 'react'
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

/**
 * Reports real Core Web Vitals from actual visitors to `/api/vitals`.
 * Fire-and-forget via `sendBeacon` — it has to survive the page unloading
 * (several of these fire on visibility change / navigation away, not on
 * load), and must never block or delay anything the visitor is doing.
 */
function report(metric: Metric) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    path: window.location.pathname,
  })
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/vitals', body)
  } else {
    fetch('/api/vitals', { method: 'POST', body, keepalive: true })
  }
}

export function WebVitals() {
  useEffect(() => {
    onCLS(report)
    onFCP(report)
    onINP(report)
    onLCP(report)
    onTTFB(report)
  }, [])
  return null
}
