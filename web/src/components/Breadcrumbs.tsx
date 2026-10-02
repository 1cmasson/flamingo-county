import Link from 'next/link'
import s from './chrome.module.css'

const HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

export type Crumb = { name: string; path: string }

/**
 * The visible trail. Pages build one `Crumb[]` and hand the same array to this
 * and to `breadcrumbJsonLd`, so what a reader sees and what search engines are
 * told can't drift apart.
 *
 * It took the place of the single "← ALL LISTINGS" back chip, and keeps that
 * chip's look for the ancestors, so the way back is still a thumb-sized target
 * on a phone. The current page is in the list for screen readers but not drawn:
 * the H1 says it right underneath, and on a phone a long business name wrapped
 * onto a line of its own in small capitals on the pink.
 */
export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label} style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px 10px',
          fontFamily: 'var(--display)',
          fontSize: 15,
          textTransform: 'uppercase',
        }}
      >
        {items.map((it, i) => {
          const last = i === items.length - 1
          return (
            <li key={it.path} style={last ? HIDDEN : { display: 'flex', alignItems: 'center', gap: 10 }}>
              {last ? (
                <span aria-current="page">{it.name}</span>
              ) : (
                <>
                  <Link
                    href={it.path}
                    className={s.chip}
                    style={{
                      textDecoration: 'none',
                      color: 'var(--ink)',
                      whiteSpace: 'nowrap',
                      padding: '9px 14px 7px',
                      border: '4px solid var(--ink)',
                      background: 'var(--grad-cream)',
                      boxShadow: '4px 4px 0 var(--ink)',
                    }}
                  >
                    {it.name}
                  </Link>
                  {i < items.length - 2 ? (
                    // Body face: the display face draws a slash that reads as a "y".
                    <span aria-hidden="true" style={{ fontFamily: 'var(--body)', fontWeight: 800, fontSize: 18 }}>
                      /
                    </span>
                  ) : null}
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
