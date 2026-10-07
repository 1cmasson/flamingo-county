'use client'

import s from './address.module.css'

/** Opens the browser's print dialog; the page's print styles make it the fridge sheet. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className={`${s.action} ${s.actionAlt}`} onClick={() => window.print()}>
      <span aria-hidden="true">🖨️</span> {label}
    </button>
  )
}
