import Link from 'next/link'
import type { Lang } from '../i18n'
import type { Story } from '../payload-types'
import { routes } from '../lib/routes'
import { StoryArt } from './StoryArt'

/**
 * A titled row of story cards with a link to the whole index: the home page's
 * newest three, and a city page's own stories. The links matter as much as
 * the cards: a story page that nothing links to is one Google finds only in
 * the sitemap, and treats as unimportant.
 */
export function StoryShelf({
  lang,
  title,
  stories,
  t,
  onDark = false,
}: {
  lang: Lang
  title: string
  stories: Story[]
  t: (s: string) => string
  /** On the city page's ink ground, where an ink rule and link would vanish. */
  onDark?: boolean
}) {
  if (!stories.length) return null
  const line = onDark ? 'var(--cream)' : 'var(--ink)'
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2
          style={{
            margin: 0,
            whiteSpace: 'nowrap',
            background: 'var(--ink)',
            color: 'var(--yellow)',
            fontFamily: 'var(--display)',
            fontSize: 22,
            fontWeight: 400,
            padding: '8px 14px 5px',
          }}
        >
          {title}
        </h2>
        <div style={{ flex: 1, minWidth: 8, height: 5, background: line }} />
        <Link
          href={routes.stories(lang)}
          style={{
            color: onDark ? 'var(--yellow)' : 'var(--ink)',
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: '1px',
            whiteSpace: 'nowrap',
          }}
        >
          {t('ALL STORIES →')}
        </Link>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,265px),1fr))',
          gap: 'clamp(14px,2.5vw,20px)',
        }}
      >
        {stories.map((st) => (
          <Link
            key={st.id}
            href={routes.story(lang, st.slug)}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              background: 'var(--grad-cream)',
              border: '4px solid var(--ink)',
              boxShadow: '7px 7px 0 var(--ink)',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'relative', height: 180, borderBottom: '4px solid var(--ink)' }}>
              <StoryArt media={st.cover} label={t('DID YOU KNOW?')} sizes="(max-width: 700px) 100vw, 400px" size="sm" />
            </div>
            <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: '1.8px', color: 'var(--magenta)' }}>
                {st.kicker}
              </div>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: 22,
                  lineHeight: 1.02,
                  textWrap: 'balance',
                }}
              >
                {st.title}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
