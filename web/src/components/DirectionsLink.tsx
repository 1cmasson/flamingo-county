'use client'

import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'

/**
 * A directions link: Apple Maps on an iPhone, iPad or Mac, and the site's own
 * trip planner everywhere else. Never Google Maps (owner, Nov 10: it is the
 * competitor).
 *
 * The server renders the planner link for everyone, so the HTML is the same
 * for every visitor and every cache. On an Apple device it swaps to the Apple
 * Maps link once the page hydrates (the server snapshot below is "not Apple").
 * An iPad's Safari says "Macintosh", which the test catches too.
 */
const neverChanges = () => () => {}
const onApple = () => /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent)
const onServer = () => false

export function DirectionsLink({
  other,
  apple,
  className,
  style,
  children,
}: {
  /** Where anyone not on an Apple device goes: a page on this site. */
  other: string
  apple: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const isApple = useSyncExternalStore(neverChanges, onApple, onServer)
  return (
    <a
      href={isApple ? apple : other}
      {...(isApple ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={className}
      style={style}
    >
      {children}
    </a>
  )
}
