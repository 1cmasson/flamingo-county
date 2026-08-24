import React from 'react'
import type { Story } from '../payload-types'
import { MediaSlot } from './MediaSlot'

type Block = NonNullable<Story['blocks']>[number]

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const column = { maxWidth: '66ch', margin: '0 auto', width: '100%' } as const

/**
 * Renders a story body.
 *
 * In the source these seven shapes were positional tuples decoded at render
 * time — `['q', text, by]`, `['img', hint, cap, ar]`, `['pair', [h,c], [h,c]]`
 * — with seven `<sc-if>` branches switching on booleans derived from index 0.
 * They are named Payload blocks now, so this is a straight switch on blockType.
 *
 * The scroll-driven animations are kept verbatim: `animation-timeline: view()`
 * with an `animation-range`, which Chromium runs as a scroll effect and other
 * engines fall back on by applying the `both` fill — i.e. the finished state
 * shows immediately. That degradation is graceful, so it is left as CSS rather
 * than reimplemented with IntersectionObserver.
 */
export function StoryBlocks({ blocks }: { blocks?: Story['blocks'] }) {
  if (!blocks?.length) return null
  return (
    <>
      {blocks.map((b, i) => (
        <StoryBlock key={b.id ?? i} block={b} />
      ))}
    </>
  )
}

function StoryBlock({ block: b }: { block: Block }) {
  switch (b.blockType) {
    case 'dropCap': {
      const text = b.text ?? ''
      // The source split the first character out to float it as a drop cap.
      const first = text.slice(0, 1)
      const rest = text.slice(1)
      return (
        <div
          style={{
            ...column,
            fontSize: 'clamp(17px,4.2vw,20px)',
            lineHeight: 1.65,
            fontWeight: 600,
            textWrap: 'pretty',
          }}
        >
          <span
            style={{
              float: 'left',
              fontFamily: 'var(--display)',
              fontSize: 'clamp(58px,13vw,86px)',
              lineHeight: 0.74,
              padding: '8px 12px 0 0',
              color: 'var(--pink)',
            }}
          >
            {first}
          </span>
          {rest}
        </div>
      )
    }

    case 'paragraph':
      return (
        <p
          style={{
            ...column,
            margin: '0 auto',
            fontSize: 'clamp(16px,4vw,19px)',
            lineHeight: 1.7,
            fontWeight: 600,
            textWrap: 'pretty',
            animation: 'riseIn 0.7s ease-out both',
            animationTimeline: 'view()',
            animationRange: 'entry 0% entry 70%',
          }}
        >
          {b.text}
        </p>
      )

    case 'pullQuote':
      return (
        <figure
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 'min(100%,600px)',
            margin: 0,
            background: 'var(--yellow)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            padding: 'clamp(18px,3.5vw,28px)',
            animation: 'tiltIn 0.8s ease-out both',
            animationTimeline: 'view()',
            animationRange: 'entry 0% cover 22%',
          }}
        >
          <blockquote
            style={{
              margin: 0,
              fontFamily: 'var(--display)',
              fontSize: 'clamp(22px,5.5vw,34px)',
              lineHeight: 1.08,
              textWrap: 'balance',
            }}
          >
            “{b.text}”
          </blockquote>
          {b.attribution ? (
            <figcaption
              style={{
                marginTop: 12,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '1.6px',
                color: 'var(--magenta)',
              }}
            >
              {b.attribution}
            </figcaption>
          ) : null}
        </figure>
      )

    case 'image':
      return (
        <figure
          style={{
            width: '100%',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            animation: 'riseIn 0.8s ease-out both',
            animationTimeline: 'view()',
            animationRange: 'entry 0% cover 20%',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: b.aspectRatio ?? '16 / 9',
              border: '4px solid var(--ink)',
              boxShadow: '8px 8px 0 var(--cyan)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                animation: 'clipIn 1.1s ease-out both',
                animationTimeline: 'view()',
                animationRange: 'entry 4% cover 34%',
              }}
            >
              <MediaSlot
                media={b.image}
                placeholder={b.hint}
                sizes="(max-width: 700px) 100vw, 620px"
              />
            </div>
          </div>
          {b.caption ? (
            <figcaption
              style={{
                fontFamily: mono,
                fontSize: 12,
                lineHeight: 1.5,
                padding: '10px 2px 0',
                letterSpacing: '0.4px',
              }}
            >
              {b.caption}
            </figcaption>
          ) : null}
        </figure>
      )

    case 'imagePair':
      return (
        <div
          data-stack
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'clamp(12px,2.4vw,18px)',
            animation: 'riseIn 0.8s ease-out both',
            animationTimeline: 'view()',
            animationRange: 'entry 0% cover 20%',
          }}
        >
          <PairHalf
            media={b.a?.image}
            hint={b.a?.hint}
            caption={b.a?.caption}
            shadow="var(--pink)"
            clip="clipIn 1s ease-out both"
            range="entry 4% cover 32%"
          />
          {/* The second frame is nudged down so the pair reads as hand-placed. */}
          <PairHalf
            media={b.b?.image}
            hint={b.b?.hint}
            caption={b.b?.caption}
            shadow="var(--cyan)"
            clip="clipIn 1.2s ease-out both"
            range="entry 6% cover 38%"
            offsetTop
          />
        </div>
      )

    case 'calloutNote':
      return (
        <aside
          style={{
            ...column,
            background: 'var(--grad-cyan)',
            border: '4px solid var(--ink)',
            padding: '16px 18px',
            animation: 'riseIn 0.7s ease-out both',
            animationTimeline: 'view()',
            animationRange: 'entry 0% entry 80%',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '2px' }}>{b.title}</div>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.55,
              textWrap: 'pretty',
            }}
          >
            {b.text}
          </p>
        </aside>
      )

    case 'sectionBreak':
      return (
        <div
          style={{ ...column, display: 'flex', alignItems: 'center', gap: 14 }}
          role="separator"
        >
          <div style={{ flex: 1, height: 4, background: 'var(--ink)' }} />
          <div
            aria-hidden="true"
            style={{
              fontFamily: 'var(--display)',
              fontSize: 20,
              color: 'var(--pink)',
              letterSpacing: '4px',
            }}
          >
            ● ● ●
          </div>
          <div style={{ flex: 1, height: 4, background: 'var(--ink)' }} />
        </div>
      )

    default:
      return null
  }
}

function PairHalf({
  media,
  hint,
  caption,
  shadow,
  clip,
  range,
  offsetTop,
}: {
  media?: any
  hint?: string | null
  caption?: string | null
  shadow: string
  clip: string
  range: string
  offsetTop?: boolean
}) {
  return (
    <figure style={{ display: 'flex', flexDirection: 'column', margin: 0 }}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '4 / 5',
          border: '4px solid var(--ink)',
          boxShadow: `6px 6px 0 ${shadow}`,
          overflow: 'hidden',
          ...(offsetTop ? { marginTop: 'clamp(0px,3vw,34px)' } : {}),
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            animation: clip,
            animationTimeline: 'view()',
            animationRange: range,
          }}
        >
          <MediaSlot media={media} placeholder={hint} sizes="(max-width: 700px) 50vw, 300px" />
        </div>
      </div>
      {caption ? (
        <figcaption
          style={{ fontFamily: mono, fontSize: 11.5, lineHeight: 1.5, padding: '9px 2px 0' }}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}
