'use client'

import Link from 'next/link'
import { useSaved } from '../lib/saved'
import type { Lang } from '../i18n'
import { routes } from '../lib/routes'
import s from './chrome.module.css'

export type SavedEvent = {
  slug: string
  title: string
  iso: string
  day: number
  weekday: string
  month: string
  time: string
  venue: string
  cityName: string
  kindLabel: string
  kindBg: string
  kindInk: string
  href: string
  icsHref: string
}

/**
 * The saved-events list.
 *
 * Every event on the site is passed in already rendered as plain data by the
 * server; this only decides which of them to show. That keeps the filtering on
 * the client — where the saved set lives, in localStorage — without shipping a
 * data-fetching layer to the browser.
 *
 * Nothing renders until after hydration. The server cannot know what is saved,
 * so guessing would mean a mismatch on first paint.
 */
export function MyWeekList({
  lang,
  events,
  t,
}: {
  lang: Lang
  events: SavedEvent[]
  t: {
    emptyH: string
    emptyP: string
    browse: string
    saved: string
    going: string
    addCal: string
  }
}) {
  const { ready, saved, going, toggleSaved } = useSaved()

  // Matches the server's empty state so the first client paint is identical.
  if (!ready) return <div style={{ minHeight: 200 }} />

  const mine = events.filter((e) => saved.includes(e.slug))

  if (!mine.length) {
    return (
      <div
        style={{
          background: 'var(--grad-cream)',
          border: '4px solid var(--ink)',
          boxShadow: '8px 8px 0 var(--ink)',
          padding: 'clamp(20px,4vw,34px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--display)',
            fontSize: 'clamp(22px,5vw,30px)',
            lineHeight: 1.05,
          }}
        >
          {t.emptyH}
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, maxWidth: '56ch' }}>
          {t.emptyP}
        </p>
        <Link
          href={routes.events(lang)}
          className={s.chipPress}
          style={{
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            fontFamily: 'var(--display)',
            fontSize: 17,
            padding: '13px 18px 10px',
            border: '4px solid var(--ink)',
            background: 'var(--grad-pink)',
            color: 'var(--cream)',
            boxShadow: '4px 4px 0 var(--ink)',
          }}
        >
          {t.browse}
        </Link>
      </div>
    )
  }

  // Group by day, in date order.
  const days = [...new Set(mine.map((e) => e.iso))].sort()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(16px,3vw,24px)' }}>
      {days.map((iso) => {
        const items = mine.filter((e) => e.iso === iso)
        const first = items[0]
        return (
          <div key={iso} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 9,
                  flex: '0 0 auto',
                  color: 'var(--cream)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--display)',
                    fontSize: 'clamp(28px,5vw,34px)',
                    lineHeight: 0.9,
                    textShadow: '3px 3px 0 var(--ink)',
                  }}
                >
                  {first.day}
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 12,
                    letterSpacing: '2px',
                    textShadow: '2px 2px 0 var(--ink)',
                  }}
                >
                  {first.weekday} · {first.month}
                </div>
              </div>
              <div style={{ flex: 1, height: 4, background: 'var(--ink)' }} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,270px),1fr))',
                gap: 'clamp(12px,2vw,16px)',
              }}
            >
              {items.map((e) => (
                <div
                  key={e.slug}
                  style={{
                    background: 'var(--grad-cream)',
                    border: '4px solid var(--ink)',
                    boxShadow: '6px 6px 0 var(--ink)',
                    padding: '13px 14px 15px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <div
                      style={{
                        background: e.kindBg,
                        color: e.kindInk,
                        border: '2px solid var(--ink)',
                        fontWeight: 800,
                        fontSize: 9.5,
                        letterSpacing: '1.3px',
                        padding: '4px 7px',
                      }}
                    >
                      {e.kindLabel}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.2px' }}>
                      {e.time}
                    </div>
                    {going.includes(e.slug) ? (
                      <div
                        style={{
                          background: 'var(--ink)',
                          color: 'var(--cyan)',
                          fontWeight: 800,
                          fontSize: 9.5,
                          letterSpacing: '1.3px',
                          padding: '4px 7px',
                        }}
                      >
                        {t.going}
                      </div>
                    ) : null}
                  </div>

                  <Link
                    href={e.href}
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      fontFamily: 'var(--display)',
                      fontSize: 19,
                      lineHeight: 1.05,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {e.title}
                  </Link>

                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 10,
                      letterSpacing: '1.2px',
                      color: 'var(--magenta)',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {e.venue} · {e.cityName}
                  </div>

                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: 10,
                      borderTop: '3px dotted var(--ink)',
                      display: 'flex',
                      gap: 7,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSaved(e.slug)}
                      className={s.chipLift}
                      style={{
                        cursor: 'pointer',
                        fontWeight: 800,
                        fontSize: 11,
                        letterSpacing: '1.2px',
                        minHeight: 44,
                        padding: '8px 11px',
                        border: '3px solid var(--ink)',
                        background: 'var(--yellow)',
                        color: 'var(--ink)',
                      }}
                    >
                      {t.saved}
                    </button>
                    <a
                      href={e.icsHref}
                      download={`${e.slug}.ics`}
                      className={s.chipLift}
                      style={{
                        marginLeft: 'auto',
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontWeight: 800,
                        fontSize: 11,
                        letterSpacing: '1.2px',
                        minHeight: 44,
                        padding: '8px 10px',
                        border: '3px solid var(--ink)',
                        background: 'var(--grad-cyan)',
                        color: 'var(--ink)',
                      }}
                    >
                      {t.addCal}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
