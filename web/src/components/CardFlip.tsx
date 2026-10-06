'use client'

import { useState } from 'react'
import s from './card.module.css'

/**
 * The business card, drawn on the page, that flips when tapped — the same card
 * the visitor is holding, front (the mascots) and back (the founder; the one
 * place on the site the owner's name and photo appear).
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
  extra,
}: {
  front: React.ReactNode
  back: React.ReactNode
  /** What the button does, read aloud. */
  label: string
  tap: string
  tapBack: string
  /** Shown beside the tap hint — the card page puts "save contact" here. */
  extra?: React.ReactNode
}) {
  const [flipped, setFlipped] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <button type="button" className={s.cardButton} onClick={() => setFlipped((f) => !f)} aria-label={label}>
        <div className={s.flipper} data-flipped={flipped}>
          <div className={`${s.face} ${s.front}`} aria-hidden={flipped}>
            {front}
          </div>
          <div className={`${s.face} ${s.back}`} aria-hidden={!flipped}>
            {back}
          </div>
        </div>
      </button>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <div className={s.hint} aria-hidden="true">
          <span>↻</span>
          <span>{flipped ? tapBack : tap}</span>
        </div>
        {extra}
      </div>
    </div>
  )
}
