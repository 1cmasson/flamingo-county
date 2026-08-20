import type { Media } from '../payload-types'

/**
 * Replaces `<image-slot>` — a 65 KB custom element built for the Claude Design
 * canvas (drag/drop, reframing, Unsplash attribution), none of which belongs in
 * a Payload-backed site.
 *
 * It renders the real image when the CMS has one, and otherwise reproduces the
 * element's empty state exactly, because that empty state is what the live site
 * shows today: the `.image-slots.state.json` sidecar was never created, so every
 * business photo, event image and story picture is a labelled placeholder.
 *
 * One detail worth stating, since reading image-slot.js alone would get it
 * wrong: the template contains an "or browse files" sub-line, but it is hidden
 * at runtime whenever the canvas host is absent — which is always, on the
 * deployed site. It is not reproduced here.
 */
export function MediaSlot({
  media,
  placeholder,
  fit = 'cover',
  className,
  style,
  sizes,
  priority,
}: {
  media?: Media | number | string | null
  placeholder?: string | null
  fit?: 'cover' | 'contain'
  className?: string
  style?: React.CSSProperties
  sizes?: string
  priority?: boolean
}) {
  const doc = media && typeof media === 'object' ? (media as Media) : null

  if (doc?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={doc.url}
        alt={doc.alt ?? ''}
        width={doc.width ?? undefined}
        height={doc.height ?? undefined}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: fit,
          display: 'block',
          ...style,
        }}
      />
    )
  }

  return (
    <div
      className={className}
      // Decorative: the caption is art direction for whoever fills the slot,
      // not information a reader of the page needs.
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'rgba(127,127,127,.08)',
        font: '13px/1.3 system-ui, -apple-system, sans-serif',
        color: 'var(--ink)',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          textAlign: 'center',
          padding: 12,
          boxSizing: 'border-box',
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.45 }}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        {placeholder ? (
          <div
            style={{
              maxWidth: '90%',
              fontWeight: 500,
              letterSpacing: '.01em',
              opacity: 0.75,
            }}
          >
            {placeholder}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          border: '1.5px dashed currentColor',
          opacity: 0.35,
        }}
      />
    </div>
  )
}
