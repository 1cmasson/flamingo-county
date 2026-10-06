'use client'

import { useState } from 'react'
import s from './card.module.css'

/**
 * The business card, drawn on the page, that flips when tapped — the same card
 * the visitor is holding, front (the mascots) and back (the founder).
 *
 * One real button, so it works from the keyboard and reads as one control; the
 * face that is turned away is hidden from assistive tech.
 */
export function CardFlip({
  front,
  back,
  label,
  tap,
  tapBack,
}: {
  front: React.ReactNode
  back: React.ReactNode
  /** What the button does, read aloud. */
  label: string
  tap: string
  tapBack: string
}) {
  const [flipped, setFlipped] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <button type="button" className={s.cardButton} onClick={() => setFlipped((f) => !f)} aria-label={label}>
        <div className={s.flipper} data-flipped={flipped}>
          <div className={s.face} aria-hidden={flipped}>
            {front}
          </div>
          <div className={`${s.face} ${s.back}`} aria-hidden={!flipped}>
            {back}
          </div>
        </div>
      </button>
      <div className={s.hint} aria-hidden="true">
        <span>↻</span>
        <span>{flipped ? tapBack : tap}</span>
      </div>
    </div>
  )
}
