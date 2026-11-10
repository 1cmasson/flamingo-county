'use client'

import { useSyncExternalStore } from 'react'
import { APPLE_DEVICE } from '../lib/walkLink'

const neverChanges = () => () => {}
const onApple = () => APPLE_DEVICE.test(navigator.userAgent)
const onServer = () => false

/** On an Apple device (iPadOS Safari says "Macintosh"); false on the server and on first paint. */
export function useAppleDevice(): boolean {
  return useSyncExternalStore(neverChanges, onApple, onServer)
}
