import Link from 'next/link'
import { translator, type Lang } from '../i18n'
import { routes } from '../lib/routes'
import { NewsletterForm } from './NewsletterForm'

/**
 * Ported from Footer.dc.html. Server-rendered apart from the newsletter form.
 *
 * Layout styles stay inline and match the source values so the visual diff
 * against the running static site stays meaningful; only the palette literals
 * are swapped for the tokens in globals.css.
 */
export function Footer({ lang }: { lang: Lang }) {
  const t = translator(lang)

  return (
    <footer
      style={{
        background: 'var(--ink)',
        borderTop: '5px solid var(--cyan)',
        padding: 'clamp(20px,4vw,26px) clamp(12px,3.5vw,22px)',
      }}
    >
      <div
        data-stack
        style={{
          maxWidth: 1280,
          margin: '0 auto 22px',
          display: 'grid',
          gridTemplateColumns: '1fr 0.9fr',
          gap: 'clamp(14px,3vw,26px)',
          alignItems: 'center',
          paddingBottom: 22,
          borderBottom: '3px dotted var(--cyan)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div
            style={{
              alignSelf: 'flex-start',
              background: 'var(--yellow)',
              color: 'var(--ink)',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '2px',
              padding: '6px 10px',
            }}
          >
            {t('NEWSLETTER')}
          </div>
          <div
            style={{
              fontFamily: 'var(--display)',
              fontSize: 'clamp(20px,4.6vw,28px)',
              lineHeight: 1.02,
              color: 'var(--cream)',
              textWrap: 'balance',
            }}
          >
            {t('DEALS IN YOUR INBOX EVERY FRIDAY')}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
          <NewsletterForm
            lang={lang}
            t={{
              ph: t('you@email.com'),
              btn: t('SIGN ME UP'),
              fine: t('FRIDAYS ONLY · ENGLISH OR SPANISH · UNSUBSCRIBE ANYTIME'),
              thanks: t("YOU'RE IN — SEE YOU FRIDAY."),
            }}
          />
        </div>
      </div>

      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          display: 'flex',
          gap: 'clamp(12px,2.5vw,18px)',
          flexWrap: 'wrap',
          alignItems: 'center',
          color: 'var(--cream)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uploads/flamingo-city-mark-76.png"
            alt="Flamingo County"
            style={{ height: 'clamp(38px,9vw,52px)', width: 'auto', display: 'block' }}
          />
          <div
            style={{
              fontFamily: 'var(--body)',
              fontWeight: 800,
              fontSize: 'clamp(11px,2.4vw,14px)',
              letterSpacing: '2.2px',
              color: 'var(--cyan)',
            }}
          >
            FLAMINGOCOUNTY.COM · 305
          </div>
        </div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          {t('Hialeah · Miami Lakes · Little Havana')}
        </div>
        <Link
          href={routes.about(lang)}
          style={{
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '1.6px',
            color: 'var(--cyan)',
            textDecoration: 'none',
          }}
        >
          {t('ABOUT')}
        </Link>
        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--cyan)', marginLeft: 'auto' }}>
          {t('a local listing, run by locals. © 2026')}
        </div>
      </div>
    </footer>
  )
}
