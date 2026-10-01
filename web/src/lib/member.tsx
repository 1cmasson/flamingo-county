'use client'

import { createContext, useContext } from 'react'
import type { Lang } from '../i18n'
import type { Webview } from './webview'

/**
 * Who is looking, as far as the client needs to know — decided on the server
 * in the [lang] layout (session cookie, user agent) and handed down, so the
 * first paint already knows whether to show saved state or ask for sign-in.
 *
 * Saving and going need an account (MEMBERS.md); both buttons call
 * `requireSignIn` rather than acting directly. The calendar file is open to
 * everyone, but 'ics' stays a valid kind so a sign-in already under way when
 * that changed still finishes.
 */
export type Pending = { kind: 'save' | 'going' | 'ics'; slug: string }

export type Member = {
  lang: Lang
  signedIn: boolean
  /** Set only when signed out — decides Google vs "open in your browser". */
  webview: Webview | null
  /**
   * Runs `act` if signed in. Otherwise starts sign-in and, once back, finishes
   * `pending` on its own — or, inside an in-app browser Google refuses, shows
   * the "open this in Safari/Chrome" prompt.
   */
  requireSignIn: (pending: Pending, act: () => void) => void
}

export const MemberContext = createContext<Member>({
  lang: 'es',
  signedIn: false,
  webview: null,
  requireSignIn: () => {},
})

export function useMember() {
  return useContext(MemberContext)
}

/*
 * The interrupted tap rides through Google in the callback URL, not in storage:
 * it survives the redirect in any browser, and a stale one cannot linger and
 * fire on some later visit.
 */
export const PENDING_KIND = 'fc_do'
export const PENDING_SLUG = 'fc_e'

export function pendingFrom(search: string): Pending | null {
  const q = new URLSearchParams(search)
  const kind = q.get(PENDING_KIND)
  const slug = q.get(PENDING_SLUG)
  if (!slug || (kind !== 'save' && kind !== 'going' && kind !== 'ics')) return null
  return { kind, slug }
}

export function withPending(path: string, search: string, p: Pending): string {
  const q = new URLSearchParams(search)
  q.set(PENDING_KIND, p.kind)
  q.set(PENDING_SLUG, p.slug)
  return `${path}?${q}`
}

export function withoutPending(path: string, search: string): string {
  const q = new URLSearchParams(search)
  q.delete(PENDING_KIND)
  q.delete(PENDING_SLUG)
  const rest = q.toString()
  return rest ? `${path}?${rest}` : path
}
