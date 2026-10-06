'use client'

import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'

/**
 * A directions link that opens the phone's own map: Apple Maps on an iPhone,
 * iPad or Mac, Google Maps everywhere else (Android's built-in map).
 *
 * The server renders the Google link for everyone, so the HTML is the same for
 * every visitor and every cache, and a crawler sees one stable map link. On an
 * Apple device it swaps to the Apple Maps link once the page hydrates (the
 * server snapshot below is "not Apple"). An iPad's Safari says "Macintosh",
 * which the test catches too.
 */
const neverChanges = () => () => {}
const onApple = () => /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent)
const onServer = () => false

export function DirectionsLink({
  google,
  apple,
  className,
  style,
  children,
}: {
  google: string
  apple: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const isApple = useSyncExternalStore(neverChanges, onApple, onServer)
  return (
    <a href={isApple ? apple : google} target="_blank" rel="noopener noreferrer" className={className} style={style}>
      {children}
    </a>
  )
}
