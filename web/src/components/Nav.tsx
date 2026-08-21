import Link from 'next/link'
import { translator, type Lang } from '../i18n'
import { routes } from '../lib/routes'
import type { City } from '../payload-types'
import { getCities, getListings, rel } from '../lib/data'
import { Tooltip } from './Tooltip'
import { LangToggle } from './LangToggle'
import { ListingsMenu, BurgerMenu, type CityTab } from './NavMenus'
import { MyWeekLink } from './MyWeekLink'
import s from './chrome.module.css'

/** "ABOUT" is special-cased in the source rather than living in the dictionary. */
export const aboutLabel = (lang: Lang) => (lang === 'es' ? 'NOSOTROS' : 'ABOUT')

const linkChip = (shadow: string) => ({
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
  whiteSpace: 'nowrap' as const,
  cursor: 'pointer',
  fontFamily: 'var(--display)',
  fontSize: 15,
  padding: '9px 16px 7px',
  border: '3px solid var(--ink)',
  borderRadius: 3,
  background: 'var(--grad-cream)',
  color: 'var(--ink)',
  boxShadow: `3px 3px 0 ${shadow}`,
})

/**
 * Ported from Nav.dc.html. Server-rendered apart from three islands: the
 * listings dropdown, the burger panel and the language toggle. The hover
 * tooltips that each needed their own state flag are CSS now.
 *
 * EVENTS and STORIES are deliberately absent — both sections are still routed
 * and rendered, but there is no live content for them yet, so they stay out of
 * the nav until there is.
 *
 * The tabs carry no active flag: `NavMenus` derives it from the pathname on the
 * client, because a layout does not re-render on a navigation within its own
 * segment and a server-computed flag went stale.
 */
export async function Nav({ lang }: { lang: Lang }) {
  const t = translator(lang)
  const [cities, listings] = await Promise.all([getCities(lang), getListings(lang)])

  const tabs: CityTab[] = [
    { label: t('ALL LISTINGS'), href: routes.home(lang) },
    ...cities.map((c) => ({
      label: t(c.name ?? c.slug),
      href: routes.city(lang, c.slug),
    })),
  ]

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        background: 'var(--ink)',
        borderBottom: '5px solid var(--cyan)',
      }}
    >
      <nav
        style={{
          position: 'relative',
          maxWidth: 1280,
          margin: '0 auto',
          padding: '10px clamp(12px,3vw,22px)',
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(10px,2vw,18px)',
          flexWrap: 'nowrap',
        }}
      >
        <Link
          href={routes.home(lang)}
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uploads/flamingo-city-mark-76.png"
            alt=""
            style={{
              width: 'clamp(40px,9vw,50px)',
              height: 'clamp(40px,9vw,50px)',
              display: 'block',
              flex: '0 0 auto',
            }}
          />
          <div style={{ lineHeight: 1 }}>
            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: 'clamp(18px,4.6vw,24px)',
                color: 'var(--cream)',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
              }}
            >
              FLAMINGO COUNTY
            </div>
            <div
              style={{
                fontFamily: 'var(--body)',
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: '2.4px',
                color: 'var(--cyan)',
              }}
            >
              FLAMINGOCOUNTY.COM · 305
            </div>
          </div>
        </Link>

        {/* --- Desktop bar --- */}
        <div
          data-navdesk="1"
          style={{ alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'nowrap' }}
        >
          <ListingsMenu label={t('LISTINGS')} tabs={tabs} />

          <div
            style={{ width: 3, height: 30, background: 'var(--cyan)', margin: '0 6px', flex: '0 0 auto' }}
          />

          <Tooltip text={lang === 'es' ? 'READ IT IN ENGLISH!' : '¡LÉELO EN ESPAÑOL!'} rotate={-1.5}>
            <LangToggle lang={lang} />
          </Tooltip>

          <MyWeekLink href={routes.myWeek(lang)} label={t('MY WEEK')} />

          <Link href={routes.about(lang)} className={s.chip} style={linkChip('var(--pink)')}>
            {aboutLabel(lang)}
          </Link>

          <Tooltip text={t('GET YOUR SHOP ON THE MAP')} align="right" rotate={-1.6}>
            <Link
              href={routes.listYourSpot(lang)}
              className={`${s.chip} ${s.chipJoin}`}
              style={{
                ...linkChip('var(--cream)'),
                background: 'var(--cyan)',
              }}
            >
              {t('LIST YOUR SPOT')}
            </Link>
          </Tooltip>
        </div>

        {/* --- Mobile bar --- */}
        <div
          data-navburger="1"
          style={{ marginLeft: 'auto', alignItems: 'center', gap: 8, flex: '0 0 auto' }}
        >
          <LangToggle lang={lang} small />
          <BurgerMenu
            citiesLabel={t('CITIES')}
            tabs={tabs}
            links={[
              {
                href: routes.about(lang),
                label: aboutLabel(lang),
                shadow: 'var(--pink)',
                background: 'var(--grad-cream)',
              },
              {
                href: routes.listYourSpot(lang),
                label: t('LIST YOUR SPOT'),
                shadow: 'var(--cream)',
                background: 'var(--cyan)',
              },
            ]}
          />
        </div>
      </nav>

      <Ticker
        lead={
          listings.length
            ? [t('NOW ON THE LISTING'), `${listings.length} ${t('LOCAL SPOTS')}`]
            : [t('NOW ON THE LISTING'), t('MEMBER SPOTLIGHTS EVERY FRIDAY')]
        }
        items={listings
          .map((b) => {
            const c = rel<City>(b.city)
            return c ? { label: b.name ?? b.slug, href: routes.business(lang, c.slug, b.slug) } : null
          })
          .filter(Boolean) as { label: string; href: string }[]}
      />
    </div>
  )
}

/**
 * The marquee.
 *
 * It used to be one hardcoded sentence claiming 412 local spots and a banquet
 * hall vertical, neither of which existed. It runs on the listings collection
 * now: the count is real, and every name is a link to that business.
 *
 * Two rules the `tick` keyframe imposes. It translates by -50%, so the run has
 * to be duplicated *exactly* or the loop jumps — and the duplicate is a visual
 * artefact, so it is hidden from assistive tech and taken out of the tab order.
 * And its duration was tuned to the old string's length, so it is computed from
 * the item count instead of pinned at 34s.
 */
function Ticker({
  lead,
  items,
}: {
  lead: string[]
  items: { label: string; href: string }[]
}) {
  const seconds = Math.max(24, (lead.length + items.length) * 5)

  const run = (dup: boolean) => (
    <span aria-hidden={dup ? true : undefined}>
      {lead.map((l) => (
        <span key={l} style={{ padding: '0 14px' }}>
          {l}&#160;·
        </span>
      ))}
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          tabIndex={dup ? -1 : undefined}
          style={{ color: 'inherit', textDecoration: 'none', padding: '0 14px' }}
        >
          {it.label}&#160;·
        </Link>
      ))}
    </span>
  )

  return (
    <div
      className="ticker"
      style={{
        background: 'var(--yellow)',
        borderTop: '3px solid var(--ink)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <div
        className="ticker-run"
        style={{
          display: 'inline-block',
          animationDuration: `${seconds}s`,
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: '1.4px',
          padding: '6px 0',
        }}
      >
        {run(false)}
        {run(true)}
      </div>
    </div>
  )
}
