import type { CSSProperties } from 'react'

/**
 * The one look every nav button shares: white face, ink border, pink offset
 * shadow. It used to be set per component — cream gradients everywhere, a cyan
 * shadow on MY WEEK and FREE RIDES, cyan again on the open dropdown — and the
 * bar read as three different kinds of button. Change it here, not at a call site.
 *
 * LIST YOUR SPOT is the one exception, on purpose: it is the secondary call to
 * action and keeps its cyan face (see `chipJoin` in chrome.module.css).
 *
 * Hover (yellow face) lives in `.chip`. Open and current state keep the yellow
 * face as their cue, with the same pink shadow.
 */
export const NAV_BG = '#fff'
export const NAV_ON_BG = 'var(--yellow)'
export const NAV_SHADOW = 'var(--pink)'

export const navChip = (on = false, shadow = 3): CSSProperties => ({
  border: '3px solid var(--ink)',
  borderRadius: 3,
  background: on ? NAV_ON_BG : NAV_BG,
  color: 'var(--ink)',
  boxShadow: `${shadow}px ${shadow}px 0 ${NAV_SHADOW}`,
})
