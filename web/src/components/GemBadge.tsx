/**
 * The Flamingo County Gem mark: a cut diamond drawn the way the mascots are,
 * with a heavy even black outline, flat facets, a cyan rim-light and a white
 * sparkle. The crown is cyan and the pavilion pink, the two city accents the
 * site already runs on, so it reads as ours rather than as jewellery clip-art.
 *
 * The outline is drawn at the mascots' ink weight: about 4.5 px at the hero
 * badge's 44 px, with a cyan rim just outside it like the mascots' contour.
 * The strokes are in viewBox units, so a smaller diamond keeps the proportion.
 *
 * Decorative: the text beside it carries the meaning, so the SVG is hidden from
 * assistive tech.
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
      {/* the cyan rim, just outside the ink outline */}
      <polygon
        points="8,6 24,6 29,12 16,28 3,12"
        fill="none"
        stroke="#16e0f2"
        strokeWidth={5.6}
        strokeLinejoin="round"
      />
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
        strokeWidth={1.7}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* rim-light, inside the left contour */}
      <path d="M5.6 13.6L14.6 24.6" fill="none" stroke="#b9f7fc" strokeWidth={1.2} strokeLinecap="round" />
      {/* ink outline, the mascots' weight */}
      <polygon
        points="8,6 24,6 29,12 16,28 3,12"
        fill="none"
        stroke="#0c0f14"
        strokeWidth={3.3}
        strokeLinejoin="round"
      />
      {/* sparkle */}
      <path
        d="M27.5 0.2L28.8 3.7L32.3 5L28.8 6.3L27.5 9.8L26.2 6.3L22.7 5L26.2 3.7Z"
        fill="#ffffff"
        stroke="#0c0f14"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The badge's height, the same as the city chip beside it; the sticker hangs outside it. */
const BADGE_HEIGHT = 34
/** The diamond is twice the chip text's size and breaks out of the top-left corner. */
const STICKER = 44
const STICKER_LEFT = -14
const STICKER_TOP = -17

/**
 * The chip a gem wears in its listing hero in place of the category chip: the
 * same 4px ink border and display face as the chip beside it, on ink with a
 * cyan inner rim. The diamond is a sticker slapped on its top-left corner,
 * overlapping the border, so the badge stays the chip row's height and the
 * label keeps its room.
 */
export function GemBadge({ label }: { label: string }) {
  return (
    <div
      data-testid="gem-badge"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        height: BADGE_HEIGHT,
        // Clear of the chip before it: the sticker hangs 14px to the left.
        marginLeft: 10,
        background: 'var(--ink)',
        border: '4px solid var(--ink)',
        boxShadow: 'inset 0 0 0 2px var(--cyan)',
        padding: `3px 12px 0 ${STICKER + STICKER_LEFT + 2}px`,
        fontFamily: 'var(--display)',
        fontSize: 16,
        color: 'var(--cyan)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: STICKER_LEFT,
          top: STICKER_TOP,
          transform: 'rotate(-12deg)',
          filter: 'drop-shadow(2px 2px 0 rgba(12,15,20,0.45))',
        }}
      >
        <GemDiamond size={STICKER} />
      </span>
      {label}
    </div>
  )
}
