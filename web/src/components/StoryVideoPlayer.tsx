'use client'

import { useEffect, useRef, useState } from 'react'
import type { Lang } from '../i18n'

export type VideoCut = {
  language: Lang
  url: string
  posterUrl?: string
  credits?: string | null
}

/** Each button in its own language, on both pages: it is for the viewer who speaks that one. */
const WATCH_IN: Record<Lang, string> = { en: 'Watch in English', es: 'Ver en español' }

/**
 * The reel and the words beside it. With both cuts, two buttons swap the
 * English and Spanish cut in place, so an English page can play the Spanish
 * one for someone on the couch without leaving the story.
 *
 * The `<video>` is keyed by language: changing `<source>` alone keeps the media
 * already loaded. A fresh element keeps `preload="none"` honest, so pressing a
 * button loads a poster, not 25 MB. If the old cut was playing, the new one
 * starts where a viewer would expect it to: from the top, playing.
 */
export function StoryVideoPlayer({
  cuts,
  heading,
  note,
  fallback,
  switchLabel,
}: {
  /** The page's own language first; it plays by default. */
  cuts: VideoCut[]
  heading: string
  note: string
  fallback: string
  switchLabel: string
}) {
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLVideoElement>(null)
  const playing = useRef(false)
  const resume = useRef(false)

  useEffect(() => {
    if (resume.current) {
      resume.current = false
      ref.current?.play().catch(() => {})
    }
  }, [active])

  const cut = cuts[active] ?? cuts[0]
  if (!cut) return null

  const choose = (i: number) => {
    if (i === active) return
    resume.current = playing.current
    playing.current = false
    setActive(i)
  }

  return (
    <>
      <video
        key={cut.language}
        ref={ref}
        controls
        playsInline
        preload="none"
        poster={cut.posterUrl}
        lang={cut.language}
        onPlay={() => (playing.current = true)}
        onPause={() => (playing.current = false)}
        onEnded={() => (playing.current = false)}
        style={{
          width: 'min(100%, 340px)',
          aspectRatio: '9 / 16',
          height: 'auto',
          background: '#000',
          border: '4px solid var(--cream)',
          display: 'block',
        }}
      >
        <source src={cut.url} type="video/mp4" />
        {fallback}
      </video>
      <div style={{ flex: '1 1 240px', maxWidth: '46ch', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--display)',
            fontWeight: 400,
            fontSize: 'clamp(26px,6vw,40px)',
            lineHeight: 0.95,
            color: 'var(--yellow)',
          }}
        >
          {heading}
        </h2>
        <p style={{ margin: 0, color: 'var(--cream)', fontWeight: 600, fontSize: 16, lineHeight: 1.5 }}>{note}</p>
        {cuts.length > 1 ? (
          <div role="group" aria-label={switchLabel} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
            {cuts.map((c, i) => {
              const on = i === active
              return (
                <button
                  key={c.language}
                  type="button"
                  lang={c.language}
                  aria-pressed={on}
                  onClick={() => choose(i)}
                  style={{
                    cursor: on ? 'default' : 'pointer',
                    fontFamily: 'var(--body)',
                    fontWeight: 800,
                    fontSize: 14,
                    lineHeight: 1.2,
                    padding: '9px 14px',
                    border: `3px solid ${on ? 'var(--yellow)' : 'var(--cream)'}`,
                    background: on ? 'var(--yellow)' : 'transparent',
                    color: on ? 'var(--ink)' : 'var(--cream)',
                    boxShadow: on ? '4px 4px 0 var(--pink)' : 'none',
                  }}
                >
                  {WATCH_IN[c.language]}
                </button>
              )
            })}
          </div>
        ) : null}
        {cut.credits ? (
          <p style={{ margin: 0, color: '#8b939c', fontWeight: 600, fontSize: 12, lineHeight: 1.5 }}>{cut.credits}</p>
        ) : null}
      </div>
    </>
  )
}
