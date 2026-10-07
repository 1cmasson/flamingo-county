import type { Media } from '../payload-types'
import { MediaSlot } from './MediaSlot'

/**
 * A story's picture, filling whatever frame the caller draws.
 *
 * The cover photo when there is one. Without it, the series mark: the same
 * DID YOU KNOW? / ¿SABÍAS QUE? card the reels open on, drawn in CSS. An empty
 * MediaSlot collapses to nothing, and every caller here draws a fixed-height,
 * bordered frame around it, so a story saved without a cover used to show a
 * blank cream box on the index, on the shelf and under its own masthead.
 */
export function StoryArt({
  media,
  label,
  sizes,
  priority,
  size = 'md',
}: {
  media?: Media | number | string | null
  /** "DID YOU KNOW?" in the page's language. */
  label: string
  sizes?: string
  priority?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  if (media && typeof media === 'object' && media.url) {
    return <MediaSlot media={media} sizes={sizes} priority={priority} />
  }
  const fontSize = { sm: 'clamp(30px,8vw,40px)', md: 'clamp(38px,10vw,64px)', lg: 'clamp(44px,11vw,96px)' }[size]
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        background:
          'radial-gradient(circle at 20% 20%, rgba(255,46,147,0.55) 0 1.5px, transparent 2px) 0 0 / 11px 11px, var(--ink)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--display)',
          fontSize,
          lineHeight: 0.88,
          color: 'var(--yellow)',
          textAlign: 'center',
          transform: 'rotate(-3deg)',
          textShadow: '4px 4px 0 var(--pink)',
          textWrap: 'balance',
        }}
      >
        {label}
      </div>
    </div>
  )
}
