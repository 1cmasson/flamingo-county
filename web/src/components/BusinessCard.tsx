import Link from 'next/link'
import type { City, Listing, Category, Media } from '../payload-types'
import { rel } from '../lib/data'
import { routes } from '../lib/routes'
import type { Lang } from '../i18n'
import { MediaSlot } from './MediaSlot'
import s from './chrome.module.css'

/**
 * The business card, used on Home, City and the "also in" rails.
 *
 * The declarations come from City.dc.html:76, not Home.dc.html:136. Home's copy
 * of this card had the button anchor-reset pasted onto it —
 * `align-items:center; justify-content:center; white-space:nowrap; flex:0 0 auto`
 * — and since the dc-runtime resolved duplicate properties last-wins, those
 * survived. The visible symptoms were a tagline that would not wrap and an
 * image block that shrink-wrapped instead of filling the card. City's version
 * is the one that was written for a card, so it is the one reproduced here.
 */
export function BusinessCard({
  lang,
  listing,
  memberBadges = true,
  showRatings = true,
  t,
}: {
  lang: Lang
  listing: Listing
  memberBadges?: boolean
  showRatings?: boolean
  t: (s: string) => string
}) {
  const city = rel<City>(listing.city)
  const category = rel<Category>(listing.category)
  const mascot = city ? rel<Media>(city.solo) : null
  const hero = Array.isArray(listing.gallery) ? rel<Media>(listing.gallery[0]) : null

  return (
    <Link
      href={city ? routes.business(lang, city.slug, listing.slug) : '#'}
      className={s.card}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        cursor: 'pointer',
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '7px 7px 0 var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 168,
          borderBottom: '4px solid var(--ink)',
          overflow: 'hidden',
        }}
      >
        <MediaSlot
          media={hero}
          placeholder={listing.imageHint ? `${t('Drop: ')}${listing.imageHint}` : null}
        />
        <div
          style={{
            position: 'absolute',
            top: 9,
            left: 9,
            display: 'flex',
            gap: 6,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'var(--ink)',
              color: 'var(--cyan)',
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: '1.4px',
              padding: '5px 8px',
            }}
          >
            {city?.name}
          </div>
          {listing.member && memberBadges ? (
            <div
              style={{
                background: 'var(--yellow)',
                color: 'var(--ink)',
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: '1.4px',
                padding: '5px 8px',
                border: '2px solid var(--ink)',
              }}
            >
              {t('MEMBER')}
            </div>
          ) : null}
        </div>
        {/* Deliberately taller than its 168px frame — the mascot is cropped by
            the overflow, which is how it reads as leaning into the card. */}
        {mascot?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mascot.url}
            alt=""
            style={{
              position: 'absolute',
              right: 8,
              top: 54,
              height: 170,
              width: 'auto',
              pointerEvents: 'none',
              filter: 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))',
            }}
          />
        ) : null}
      </div>

      <div
        style={{
          padding: '15px 15px 17px',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          flex: 1,
        }}
      >
        <div style={{ fontFamily: 'var(--display)', fontSize: 21, lineHeight: 1.03 }}>
          {listing.name}
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: '1.5px',
            color: 'var(--magenta)',
          }}
        >
          {category?.label} · {listing.hood}
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, fontWeight: 600, textWrap: 'pretty' }}>
          {listing.tag}
        </p>
        <div
          style={{
            marginTop: 'auto',
            paddingTop: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            borderTop: '3px dotted var(--ink)',
          }}
        >
          {showRatings && typeof listing.rating === 'number' ? (
            <div
              style={{
                background: 'var(--ink)',
                color: 'var(--yellow)',
                fontWeight: 800,
                fontSize: 12,
                padding: '5px 8px',
              }}
            >
              ★ {listing.rating.toFixed(1)}
            </div>
          ) : null}
          <div style={{ fontWeight: 800, fontSize: 12 }}>{listing.price}</div>
          <div style={{ marginLeft: 'auto', fontFamily: 'var(--display)', fontSize: 14 }}>
            {t('DETAILS →')}
          </div>
        </div>
      </div>
    </Link>
  )
}
