import Link from 'next/link'
import { translator, type Lang } from '../i18n'
import { routes } from '../lib/routes'
import { getCities } from '../lib/data'
import type { ActiveSection } from '../lib/active'
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
 * listings dropdown, the burger panel and the language toggle. The four hover
 * tooltips that each needed their own state flag are CSS now.
 *
 * `active` marks the current section so the matching chip gets the cyan shadow.
 */
export async function Nav({
  lang,
  active,
  city,
}: {
  lang: Lang
  active?: ActiveSection
  city?: string
}) {
  const t = translator(lang)
  const cities = await getCities(lang)

  const on = (k: string) => k === city || (k === 'all' && active === 'home')
  const tabs: CityTab[] = [
    { label: t('ALL LISTINGS'), href: routes.home(lang), on: on('all') },
    ...cities.map((c) => ({
      label: t(c.name ?? c.slug),
      href: routes.city(lang, c.slug),
      on: on(c.slug),
    })),
  ]

  // The source lights EVENTS for both the index and a single event, and
  // STORIES likewise — see evSh/storiesSh in Nav.dc.html.
  const sh = (...keys: ActiveSection[]) =>
    active && keys.includes(active) ? 'var(--cyan)' : 'var(--pink)'

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

          <Tooltip text={t('FREE THINGS TO DO THIS WEEKEND')} rotate={-1.4}>
            <Link href={routes.events(lang)} className={s.chip} style={linkChip(sh('events', 'event'))}>
              {t('EVENTS')}
            </Link>
          </Tooltip>

          <MyWeekLink href={routes.myWeek(lang)} label={t('MY WEEK')} />

          <Tooltip text={t('THE LONG READS — NEW ONE EVERY OTHER FRIDAY')} rotate={1.4}>
            <Link href={routes.stories(lang)} className={s.chip} style={linkChip(sh('stories', 'story'))}>
              {t('STORIES')}
            </Link>
          </Tooltip>

          <Link href={routes.about(lang)} className={s.chip} style={linkChip('var(--pink)')}>
            {aboutLabel(lang)}
          </Link>

          <Tooltip text={t('GET YOUR SHOP ON THE MAP — FREE')} align="right" rotate={-1.6}>
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
                href: routes.events(lang),
                label: t('EVENTS'),
                shadow: sh('events', 'event'),
                background: 'var(--grad-cream)',
              },
              {
                href: routes.stories(lang),
                label: t('STORIES'),
                shadow: sh('stories', 'story'),
                background: 'var(--grad-cream)',
              },
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

      <Ticker text={t(TICKER)} />
    </div>
  )
}

const TICKER =
  'NOW ON THE LISTING · 412 LOCAL SPOTS · HIALEAH · MIAMI LAKES · LITTLE HAVANA · MEMBER SPOTLIGHTS EVERY FRIDAY · NEW: BANQUET HALLS · '

/**
 * The marquee. The `tick` keyframe translates by -50%, so the text has to be
 * duplicated for the loop to be seamless — the source did the same, joined by
 * a pair of non-breaking spaces.
 */
function Ticker({ text }: { text: string }) {
  const gap = '  '
  const run = text + gap
  return (
    <div
      style={{
        background: 'var(--yellow)',
        borderTop: '3px solid var(--ink)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          animation: 'tick 34s linear infinite',
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: '1.4px',
          padding: '6px 0',
        }}
      >
        <span aria-hidden="true">{run + run}</span>
      </div>
    </div>
  )
}
