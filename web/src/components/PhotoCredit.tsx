import type { CSSProperties } from 'react'

import type { PhotoCredit as Credit } from '../lib/photoLicense'

/**
 * "Foto: Phillip Pessar · CC BY 2.0 · recortada", with the name linking to the
 * photo's description page and the licence to its deed. Creative Commons asks
 * for exactly this wherever the photo is used: who made it, under what
 * licence (linked), where it came from, and whether it was changed.
 *
 * Plain links, no script. Callers place it outside any other link, since
 * anchors cannot nest.
 */
export function PhotoCredit({ credit, style }: { credit: Credit; style?: CSSProperties }) {
  const link = { color: 'inherit', textDecorationThickness: '1px', textUnderlineOffset: '2px' } as const
  const parts = [
    credit.license
      ? credit.licenseUrl
        ? <a key="l" href={credit.licenseUrl} rel="license noopener" target="_blank" style={link}>{credit.license}</a>
        : credit.license
      : null,
    credit.cropped,
    credit.derivative,
  ].filter(Boolean)
  return (
    <p
      data-photo-credit
      style={{
        margin: 0,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.4,
        letterSpacing: '0.2px',
        color: 'var(--ink)',
        opacity: 0.72,
        ...style,
      }}
    >
      {credit.lead}:{' '}
      {credit.sourceUrl ? (
        <a href={credit.sourceUrl} rel="noopener" target="_blank" style={link}>
          {credit.credit}
        </a>
      ) : (
        credit.credit
      )}
      {parts.map((p, i) => (
        <span key={i}> · {p}</span>
      ))}
    </p>
  )
}
