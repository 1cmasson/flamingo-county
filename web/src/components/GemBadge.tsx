/**
 * The Flamingo County Gem mark: a cut diamond drawn the way the mascots are,
 * with a heavy even black outline, flat facets, a thin cyan rim-light down the
 * left edge and a white sparkle. The crown is cyan and the pavilion pink, the
 * two city accents the site already runs on, so it reads as ours rather than
 * as jewellery clip-art.
 *
 * Decorative: the badge's text carries the meaning, so the SVG is hidden from
 * assistive tech. Sized in px so it sits on the same baseline as the chip text.
 */
export function GemDiamond({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      style={{ flex: '0 0 auto', display: 'block', overflow: 'visible' }}
    >
      {/* crown */}
      <polygon points="3,12 8,6 11,12" fill="#7cf0fa" />
      <polygon points="8,6 16,6 11,12" fill="#16e0f2" />
      <polygon points="16,6 21,12 11,12" fill="#b9f7fc" />
      <polygon points="16,6 24,6 21,12" fill="#16e0f2" />
      <polygon points="24,6 29,12 21,12" fill="#04aebe" />
      {/* pavilion */}
      <polygon points="3,12 11,12 16,28" fill="#ff63ac" />
      <polygon points="11,12 21,12 16,28" fill="#ff2e88" />
      <polygon points="21,12 29,12 16,28" fill="#de1468" />
      {/* facet lines */}
      <path
        d="M3 12H29M8 6L11 12L16 6L21 12L24 6M11 12L16 28M21 12L16 28"
        fill="none"
        stroke="#0c0f14"
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* rim-light, inside the left contour */}
      <path d="M5.2 13.4L14.6 25" fill="none" stroke="#16e0f2" strokeWidth={1.3} strokeLinecap="round" />
      {/* outline */}
      <polygon
        points="8,6 24,6 29,12 16,28 3,12"
        fill="none"
        stroke="#0c0f14"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      {/* sparkle */}
      <path
        d="M27.5 0.8L28.6 3.9L31.7 5L28.6 6.1L27.5 9.2L26.4 6.1L23.3 5L26.4 3.9Z"
        fill="#ffffff"
        stroke="#0c0f14"
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The chip a gem wears in its listing hero in place of the category chip:
 * the same 4px ink border, padding and display face as the chip beside it,
 * on ink with a cyan inner rim so it reads as the special one in the row.
 */
export function GemBadge({ label }: { label: string }) {
  return (
    <div
      data-testid="gem-badge"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--ink)',
        border: '4px solid var(--ink)',
        boxShadow: 'inset 0 0 0 2px var(--cyan)',
        padding: '5px 12px 2px 9px',
        fontFamily: 'var(--display)',
        fontSize: 16,
        color: 'var(--cyan)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ marginTop: -3 }}>
        <GemDiamond size={22} />
      </span>
      {label}
    </div>
  )
}
