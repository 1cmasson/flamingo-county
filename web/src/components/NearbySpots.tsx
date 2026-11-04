import Link from 'next/link'
import type { Lang } from '../i18n'
import type { Category, City, Listing } from '../payload-types'
import { rel } from '../lib/data'
import { routes } from '../lib/routes'
import type { RankedSpot } from '../lib/spotRank'
import s from './chrome.module.css'

/**
 * "Near here": the listed businesses closest to an event's venue, as small
 * cards that lead to each business's page. Name, kind and distance only.
 *
 * Every card is `data-use="spot"` with the listing as its target, so the
 * site-wide click tracker counts the tap for that business with the page it
 * came from; that count is what a partner is shown. Renders nothing when no
 * business is close enough (lib/spotRank.ts).
 */
export function NearbySpots({
  lang,
  title,
  spots,
  t,
}: {
  lang: Lang
  title: string
  spots: RankedSpot<Listing>[]
  t: (s: string) => string
}) {
  if (!spots.length) return null
  return (
    <section
      style={{
        background: 'var(--yellow)',
        border: '4px solid var(--ink)',
        boxShadow: '8px 8px 0 var(--ink)',
        padding: 'clamp(16px,3vw,22px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--display)',
          fontSize: 'clamp(20px,4.6vw,26px)',
          fontWeight: 400,
          lineHeight: 1,
        }}
      >
        {title}
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))',
          gap: 12,
        }}
      >
        {spots.map(({ item: l, meters, walk }) => {
          const city = rel<City>(l.city)
          if (!city) return null
          const away =
            walk <= 20 ? `${walk} ${t('min walk')}` : `${(meters / 1000).toFixed(1)} km`
          return (
            <Link
              key={l.id}
              href={routes.business(lang, city.slug, l.slug)}
              data-use="spot"
              data-use-target={l.slug}
              className={s.cardCyan}
              style={{
                textDecoration: 'none',
                color: 'var(--ink)',
                background: 'var(--grad-cream)',
                border: '4px solid var(--ink)',
                boxShadow: '5px 5px 0 var(--ink)',
                padding: '12px 13px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 7,
                minWidth: 0,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: '1.3px', color: 'var(--magenta)' }}>
                {rel<Category>(l.category)?.label} · {away}
              </div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 18, lineHeight: 1.06, overflowWrap: 'anywhere' }}>
                {l.name}
              </div>
              {l.tag ? (
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{l.tag}</div>
              ) : null}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
