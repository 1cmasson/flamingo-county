import React from 'react'
import type { Story } from '../payload-types'
import { translator, type Lang } from '../i18n'
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
export function StoryBlocks({ blocks, lang = 'es' }: { blocks?: Story['blocks']; lang?: Lang }) {
  if (!blocks?.length) return null
  return (
    <>
      {blocks.map((b, i) => (
        <StoryBlock key={b.id ?? i} block={b} lang={lang} />
      ))}
    </>
  )
}

/** An anchor for a subheading, so a section can be linked: "Cómo visitarlo" -> "como-visitarlo". */
export function headingId(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const external = (url: string) => /^https?:\/\//i.test(url)
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function StoryBlock({ block: b, lang }: { block: Block; lang: Lang }) {
  const t = translator(lang)
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
            caption={b.a?.caption}
            shadow="var(--pink)"
            clip="clipIn 1s ease-out both"
            range="entry 4% cover 32%"
          />
          {/* The second frame is nudged down so the pair reads as hand-placed. */}
          <PairHalf
            media={b.b?.image}
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

    case 'quickAnswer':
      return (
        <section
          aria-label={t('SHORT ANSWER')}
          style={{
            ...column,
            background: 'var(--yellow)',
            border: '4px solid var(--ink)',
            boxShadow: '7px 7px 0 var(--ink)',
            padding: 'clamp(16px,3.5vw,24px)',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '2px' }}>{t('SHORT ANSWER')}</div>
          <h2
            style={{
              margin: '8px 0 0',
              fontFamily: 'var(--display)',
              fontWeight: 400,
              fontSize: 'clamp(24px,5.5vw,32px)',
              lineHeight: 1,
              textWrap: 'balance',
            }}
          >
            {b.question}
          </h2>
          <p style={{ margin: '10px 0 0', fontSize: 'clamp(16px,4vw,18px)', fontWeight: 700, lineHeight: 1.55, textWrap: 'pretty' }}>
            {b.answer}
          </p>
        </section>
      )

    case 'heading':
      return (
        <h2
          id={headingId(b.text ?? '')}
          style={{
            ...column,
            margin: 'clamp(8px,2vw,14px) auto 0',
            fontFamily: 'var(--display)',
            fontWeight: 400,
            fontSize: 'clamp(28px,6.5vw,40px)',
            lineHeight: 0.98,
            textWrap: 'balance',
            scrollMarginTop: 120,
          }}
        >
          <span style={{ boxShadow: 'inset 0 -0.32em 0 var(--pink)', paddingBottom: 2 }}>{b.text}</span>
        </h2>
      )

    case 'list': {
      const items = b.items ?? []
      if (b.style === 'timeline') {
        return (
          <ol style={{ ...column, listStyle: 'none', padding: 0, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {items.map((it, i) => (
              <li
                key={it.id ?? i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(64px,auto) 1fr',
                  gap: 14,
                  padding: '12px 0',
                  borderTop: i ? '3px dotted var(--ink)' : 0,
                }}
              >
                <span style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1.1, color: 'var(--magenta)' }}>{it.label}</span>
                <span style={{ fontSize: 'clamp(15px,3.8vw,17px)', fontWeight: 600, lineHeight: 1.55, textWrap: 'pretty' }}>{it.text}</span>
              </li>
            ))}
          </ol>
        )
      }
      const Tag = b.style === 'numbered' ? 'ol' : 'ul'
      return (
        <Tag
          style={{
            ...column,
            margin: '0 auto',
            paddingLeft: '1.4em',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            fontSize: 'clamp(16px,4vw,19px)',
            fontWeight: 600,
            lineHeight: 1.6,
          }}
        >
          {items.map((it, i) => (
            <li key={it.id ?? i} style={{ textWrap: 'pretty' }}>
              {it.label ? <strong>{it.label}: </strong> : null}
              {it.text}
            </li>
          ))}
        </Tag>
      )
    }

    case 'faq':
      return (
        <div style={{ ...column, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(b.items ?? []).map((it, i) => (
            <div key={it.id ?? i} style={{ border: '4px solid var(--ink)', background: 'var(--cream)', padding: '14px 16px' }}>
              <h3 style={{ margin: 0, fontSize: 'clamp(17px,4.2vw,19px)', fontWeight: 800, lineHeight: 1.3 }}>{it.question}</h3>
              <p style={{ margin: '6px 0 0', fontSize: 'clamp(15px,3.8vw,17px)', fontWeight: 600, lineHeight: 1.55, textWrap: 'pretty' }}>
                {it.answer}
              </p>
            </div>
          ))}
        </div>
      )

    case 'links': {
      const items = b.items ?? []
      const sources = b.style !== 'related'
      return (
        <nav aria-label={b.title ?? undefined} style={{ ...column }}>
          {b.title ? (
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '2px', marginBottom: 8 }}>{b.title}</div>
          ) : null}
          {sources ? (
            <ol style={{ margin: 0, paddingLeft: '1.6em', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
              {items.map((it, i) => (
                <li key={it.id ?? i}>
                  <a
                    href={it.url}
                    {...(external(it.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    style={{ color: 'inherit', textDecorationColor: 'var(--pink)', textDecorationThickness: 2 }}
                  >
                    {it.label}
                  </a>
                  {external(it.url) ? <span style={{ fontFamily: mono, fontSize: 12, color: '#5b636c' }}> · {host(it.url)}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {items.map((it, i) => (
                <a
                  key={it.id ?? i}
                  href={it.url}
                  {...(external(it.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  style={{
                    textDecoration: 'none',
                    color: 'var(--ink)',
                    background: 'var(--grad-cream)',
                    border: '4px solid var(--ink)',
                    boxShadow: '4px 4px 0 var(--ink)',
                    fontFamily: 'var(--display)',
                    fontSize: 16,
                    padding: '10px 14px 7px',
                  }}
                >
                  {it.label} →
                </a>
              ))}
            </div>
          )}
        </nav>
      )
    }

    default:
      return null
  }
}

function PairHalf({
  media,
  caption,
  shadow,
  clip,
  range,
  offsetTop,
}: {
  media?: any
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
          <MediaSlot media={media} sizes="(max-width: 700px) 50vw, 300px" />
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
