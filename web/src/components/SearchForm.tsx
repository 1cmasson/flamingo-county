import Link from 'next/link'
import type { Lang } from '../i18n'
import s from './chrome.module.css'

/**
 * The listing search.
 *
 * The source ran this on React state — a controlled input, an onKeyDown handler
 * and a click handler that rewrote `location`. A plain GET form does the same
 * job with no JavaScript at all: the browser serialises the fields into the
 * query string, and the page is a server component that already reads its
 * filters from `searchParams`. Enter-to-submit comes free.
 *
 * `hidden` rides along as hidden inputs so a search does not silently drop the
 * scope it was made in — today that is only `?city=` on the home page.
 */
export function SearchForm({
  action,
  hidden,
  q,
  t,
  resetHref,
  count,
}: {
  lang: Lang
  action: string
  hidden: Record<string, string | undefined>
  q: string
  t: { placeholder: string; search: string; reset: string }
  resetHref: string
  count: string
}) {
  return (
    <form
      method="GET"
      action={action}
      style={{
        width: '100%',
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <input
        name="q"
        defaultValue={q}
        placeholder={t.placeholder}
        aria-label={t.placeholder}
        style={{
          flex: '1 1 240px',
          minWidth: 0,
          fontSize: 14,
          fontWeight: 600,
          padding: '10px 12px',
          border: '3px solid var(--ink)',
          background: 'var(--grad-cream)',
          color: 'var(--ink)',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        className={s.chipPress}
        style={{
          cursor: 'pointer',
          fontFamily: 'var(--display)',
          fontSize: 14,
          padding: '10px 14px 8px',
          border: '3px solid var(--ink)',
          background: 'var(--grad-cyan)',
          color: 'var(--ink)',
          boxShadow: '3px 3px 0 var(--ink)',
        }}
      >
        {t.search}
      </button>
      <Link
        href={resetHref}
        className={s.chipPress}
        style={{
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          fontFamily: 'var(--display)',
          fontSize: 14,
          padding: '10px 14px 8px',
          border: '3px solid var(--ink)',
          background: 'var(--grad-pink)',
          color: 'var(--cream)',
          boxShadow: '3px 3px 0 var(--ink)',
        }}
      >
        {t.reset}
      </Link>
      <div style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 13, letterSpacing: '1px' }}>
        {count}
      </div>
    </form>
  )
}
