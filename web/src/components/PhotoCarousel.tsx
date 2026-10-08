'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { Media } from '../payload-types'
import type { PhotoCredit as Credit } from '../lib/photoLicense'
import { MediaSlot } from './MediaSlot'
import { PhotoCredit } from './PhotoCredit'

export type CarouselSlide = {
  media: Media
  /** What the photo shows, printed under it (it is also the photo's text alternative). */
  caption: string
  credit: Credit | null
}

/**
 * A listing's photos one at a time, each whole: drawn with `contain` on the
 * ink ground, so an archive photo keeps its own shape instead of being cut to
 * a square tile. Its caption and credit sit under it, since a licensed photo
 * owes its credit wherever it is shown.
 *
 * The track is a native scroll-snap strip, so a swipe, a trackpad or the
 * arrow keys (once it has focus) move it without any script; the buttons and
 * the counter are the only parts that need JavaScript.
 */
export function PhotoCarousel({
  slides,
  label,
  prev,
  next,
  of,
  sizes,
}: {
  slides: CarouselSlide[]
  /** The carousel's name, read aloud ("Photos of Hialeah Park"). */
  label: string
  prev: string
  next: string
  /** The word between the counter's numbers: "2 of 5". */
  of: string
  sizes: string
}) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)

  const onScroll = useCallback(() => {
    const el = track.current
    if (!el || !el.clientWidth) return
    setIndex(Math.max(0, Math.min(slides.length - 1, Math.round(el.scrollLeft / el.clientWidth))))
  }, [slides.length])

  useEffect(() => {
    const el = track.current
    if (!el) return
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onScroll])

  const go = (to: number) => {
    const el = track.current
    if (!el) return
    const i = (to + slides.length) % slides.length
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: i * el.clientWidth, behavior: still ? 'auto' : 'smooth' })
  }

  const current = slides[index]
  const button: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    flex: '0 0 auto',
    cursor: 'pointer',
    fontFamily: 'var(--display)',
    fontSize: 22,
    lineHeight: 1,
    color: 'var(--ink)',
    background: 'var(--yellow)',
    border: '3px solid var(--ink)',
    boxShadow: '3px 3px 0 var(--ink)',
    padding: 0,
  }

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      style={{
        border: '4px solid var(--ink)',
        boxShadow: '6px 6px 0 var(--ink)',
        background: 'var(--ink)',
      }}
    >
      <div
        ref={track}
        data-photo-track
        tabIndex={0}
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          overscrollBehaviorX: 'contain',
        }}
      >
        {slides.map((slide, i) => (
          <figure
            key={slide.media.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} ${of} ${slides.length}`}
            style={{
              flex: '0 0 100%',
              scrollSnapAlign: 'start',
              margin: 0,
              position: 'relative',
              height: 'clamp(240px,48vw,440px)',
            }}
          >
            <MediaSlot media={slide.media} fit="contain" sizes={sizes} />
          </figure>
        ))}
      </div>

      <div
        style={{
          background: 'var(--grad-cream)',
          borderTop: '4px solid var(--ink)',
          padding: '12px clamp(12px,2.4vw,18px) 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} aria-live="polite">
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, lineHeight: 1.4, color: 'var(--ink)' }}>
            {current?.caption}
          </p>
          {current?.credit ? <PhotoCredit credit={current.credit} /> : null}
        </div>
        {slides.length > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button type="button" onClick={() => go(index - 1)} aria-label={prev} style={button}>
              ←
            </button>
            <span style={{ fontFamily: 'var(--display)', fontSize: 16, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
              {index + 1} / {slides.length}
            </span>
            <button type="button" onClick={() => go(index + 1)} aria-label={next} style={button}>
              →
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
