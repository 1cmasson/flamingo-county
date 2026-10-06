import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { getAboutPage, getCities, getListings, getSiteSettings, rel } from '../../../../lib/data'
import { buildSrcSet } from '../../../../lib/srcset'
import { cardCopy } from '../../../../lib/cardCopy'
import { FOUNDER, SOCIAL } from '../../../../lib/site'
import type { City, Media } from '../../../../payload-types'
import { PageShell } from '../../../../components/PageShell'
import { CardFlip } from '../../../../components/CardFlip'
import s from '../../../../components/card.module.css'

/**
 * Where the business card's QR code lands (through /go/card, so scans count as
 * their own campaign in the growth review).
 *
 * The page opens on the card itself — the one in their hand: the mascots'
 * bust on the front, the founder on the back (the only place on the site his
 * name and photo appear), with "save contact" under it — and then, in the
 * order the owner cares about: get interviewed, birthday shoutout, the free
 * buses, the listings, what the site is, where to follow.
 *
 * Every fact here is read, not written: the intro is the About page's, the
 * cities and their counts come from the database. Kept out of the sitemap —
 * it is a door for people holding a card, not a page to rank.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = cardCopy(lang)
  return {
    title: c.title,
    description: c.description,
    robots: { index: false, follow: true },
    alternates: {
      canonical: routes.card(lang),
      languages: { en: routes.card('en'), es: routes.card('es') },
    },
  }
}

const word = (text: string, from = 0) =>
  [...text].map((ch, i) => (
    <span key={i} style={{ ['--i' as string]: from + i }}>
      {ch}
    </span>
  ))

export default async function CardPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)
  const c = cardCopy(lang)

  const [about, settings, cities, listings] = await Promise.all([
    getAboutPage(lang),
    getSiteSettings(lang),
    getCities(lang),
    getListings(lang),
  ])

  const counts = new Map<string, number>()
  for (const b of listings) {
    const slug = rel<City>(b.city)?.slug
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  // The three mascots' bust, the same art as the home page's hero.
  const cast = rel<Media>(settings.heroCast)
  // The founder appears on the back of the card and nowhere else on the site.
  const portrait = rel<Media>(about.photo)
  const hub = (type: string) => `${routes.listYourSpot(lang)}?type=${type}`

  const front = (
    <>
      <div className={s.panel}>
        {cast?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={s.cast}
            src={cast.url}
            srcSet={buildSrcSet(cast)}
            sizes="(max-width: 560px) 90vw, 480px"
            alt=""
            width={cast.width ?? undefined}
            height={cast.height ?? undefined}
            fetchPriority="high"
          />
        ) : null}
      </div>
      <div className={s.frontText}>
        <div className={s.wordmark}>
          {word('FLAMINGO')}
          <br />
          {word('COUNTY', 8)}
        </div>
        <div className={s.tagline}>{c.tagline}</div>
      </div>
    </>
  )

  const back = (
    <>
      <div className={`${s.panel} ${s.panelClip}`}>
        {portrait?.url ? (
          <div className={s.portrait}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={portrait.url}
              srcSet={buildSrcSet(portrait)}
              sizes="200px"
              alt=""
              width={portrait.width ?? undefined}
              height={portrait.height ?? undefined}
              loading="lazy"
            />
          </div>
        ) : null}
      </div>
      <div>
        <div className={s.name}>
          CARLOS
          <br />
          MASSON
        </div>
        <div className={s.role}>{c.founder}</div>
        <div className={s.contact}>
          {FOUNDER.email}
          <br />
          <span style={{ color: 'var(--magenta)' }}>flamingocounty.com</span>
        </div>
      </div>
    </>
  )

  const section = { display: 'flex', flexDirection: 'column' as const, gap: 14 }

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 820,
          margin: '0 auto',
          padding: '0 clamp(14px,4vw,24px) 80px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(26px,5vw,40px)',
          overflowX: 'clip',
        }}
      >
        {/* --- The card, in their hand and on the screen --- */}
        <section className={s.stage}>
          <div className={s.rays} aria-hidden="true" />
          <CardFlip
            front={front}
            back={back}
            extra={
              <a href="/contact.vcf" className={s.save}>
                <span aria-hidden="true">＋</span>
                {c.saveContact}
              </a>
            }
            label={`${c.tap} — Flamingo County`}
            tap={c.tap}
            tapBack={c.tapBack}
          />
          <h1
            style={{
              margin: '22px 0 0',
              textAlign: 'center',
              fontFamily: 'var(--display)',
              fontWeight: 400,
              fontSize: 'clamp(40px,12vw,76px)',
              lineHeight: 0.9,
              color: 'var(--yellow)',
              WebkitTextStroke: '2px var(--ink)',
              textShadow: '4px 4px 0 var(--ink)',
            }}
          >
            {c.hello}
          </h1>
          <p
            style={{
              margin: '12px auto 0',
              maxWidth: '44ch',
              textAlign: 'center',
              background: 'var(--ink)',
              color: 'var(--cream)',
              fontWeight: 600,
              fontSize: 16,
              lineHeight: 1.5,
              padding: '12px 16px',
              boxShadow: '5px 5px 0 var(--yellow)',
              textWrap: 'pretty',
            }}
          >
            {c.intro}
          </p>
        </section>

        {/* --- The two asks that matter most --- */}
        <section style={section} aria-labelledby="card-do">
          <h2
            id="card-do"
            className={s.tab}
            style={{ alignSelf: 'flex-start', margin: 0, fontWeight: 400 }}
          >
            {c.doH}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))',
              gap: 18,
            }}
          >
            <Link
              href={hub('interview')}
              className={s.bigAsk}
              style={{ background: 'var(--grad-pink)' }}
            >
              <span className={`${s.askIcon} ${s.live}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/icons/mic.svg" alt="" />
              </span>
              <span>
                <span
                  className={s.askH}
                  style={{ color: 'var(--cream)', textShadow: '2px 2px 0 var(--ink)' }}
                >
                  {c.interviewH}
                </span>
                <span className={s.askP} style={{ display: 'block', color: 'var(--cream)' }}>
                  {c.interviewP}
                </span>
                <span className={s.go}>{c.start}</span>
              </span>
            </Link>

            <Link
              href={hub('shoutout')}
              className={s.bigAsk}
              style={{ background: 'var(--yellow)' }}
            >
              <span className={s.confetti} aria-hidden="true">
                {[
                  ['8%', 'var(--pink)', '0s'],
                  ['22%', 'var(--cyan)', '0.5s'],
                  ['41%', '#fff', '1.1s'],
                  ['63%', 'var(--pink)', '0.3s'],
                  ['80%', 'var(--cyan)', '0.8s'],
                  ['93%', '#fff', '1.4s'],
                ].map(([left, bg, d]) => (
                  <i key={left} style={{ left, background: bg, ['--d' as string]: d }} />
                ))}
              </span>
              <span className={s.askIcon}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/icons/cake.svg" alt="" />
              </span>
              <span style={{ position: 'relative' }}>
                <span className={s.askH}>{c.shoutoutH}</span>
                <span className={s.askP} style={{ display: 'block' }}>
                  {c.shoutoutP}
                </span>
                <span className={s.go}>{c.start}</span>
              </span>
            </Link>
          </div>
        </section>

        {/* --- Ride free, and the spots --- */}
        <section
          className={s.reveal}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))',
            gap: 18,
          }}
        >
          <Link
            href={routes.freeRides(lang)}
            className={`${s.bigAsk} ${s.roadWrap}`}
            style={{ background: 'var(--grad-cyan)', display: 'block' }}
          >
            <span className={s.askH}>{c.ridesH}</span>
            <span className={s.askP} style={{ display: 'block' }}>
              {c.ridesP}
            </span>
            <div className={s.road} aria-hidden="true">
              <svg
                className={s.bus}
                width="52"
                height="26"
                viewBox="0 0 52 26"
                style={{ fontSize: 0 }}
              >
                <rect
                  x="1.5"
                  y="1.5"
                  width="49"
                  height="18"
                  rx="5"
                  fill="#ff2e88"
                  stroke="#0c0f14"
                  strokeWidth="3"
                />
                <rect
                  x="7"
                  y="6"
                  width="8"
                  height="6"
                  fill="#fff6e5"
                  stroke="#0c0f14"
                  strokeWidth="2"
                />
                <rect
                  x="19"
                  y="6"
                  width="8"
                  height="6"
                  fill="#fff6e5"
                  stroke="#0c0f14"
                  strokeWidth="2"
                />
                <rect
                  x="31"
                  y="6"
                  width="8"
                  height="6"
                  fill="#fff6e5"
                  stroke="#0c0f14"
                  strokeWidth="2"
                />
                <circle cx="13" cy="21" r="4" fill="#0c0f14" />
                <circle cx="39" cy="21" r="4" fill="#0c0f14" />
              </svg>
            </div>
            <span className={s.go}>{t('FREE RIDES')}</span>
          </Link>

          <Link
            href={routes.home(lang)}
            className={s.bigAsk}
            style={{ background: '#fff', display: 'block' }}
          >
            <span className={s.askH}>{c.spotsH}</span>
            <span className={s.askP} style={{ display: 'block' }}>
              {c.spotsP.replace('{n}', String(listings.length))}
            </span>
            <span className={s.go}>{t('ALL LISTINGS')}</span>
          </Link>
        </section>

        <div className={s.marquee} aria-hidden="true">
          <div>
            {[0, 1].map((k) => (
              <span key={k}>
                {Array.from({ length: 3 }, () =>
                  cities.map((x) => `${t(x.name ?? x.slug)} ✦ `).join(''),
                ).join('')}
              </span>
            ))}
          </div>
        </div>

        {/* --- What this is, and the cities --- */}
        <section className={s.reveal} style={section} aria-labelledby="card-what">
          <h2
            id="card-what"
            className={s.tab}
            style={{ alignSelf: 'flex-start', margin: 0, fontWeight: 400 }}
          >
            {c.whatH}
          </h2>
          {about.intro ? (
            <p
              style={{
                margin: 0,
                background: 'var(--grad-cream)',
                border: '4px solid var(--ink)',
                borderRadius: 14,
                boxShadow: '6px 6px 0 var(--ink)',
                padding: 'clamp(16px,4vw,22px)',
                fontWeight: 600,
                fontSize: 17,
                lineHeight: 1.55,
                textWrap: 'pretty',
              }}
            >
              {about.intro}
            </p>
          ) : null}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))',
              gap: 16,
            }}
          >
            {cities.map((city, i) => {
              const m = rel<Media>(city.solo)
              const n = counts.get(city.slug) ?? 0
              return (
                <Link
                  key={city.slug}
                  href={routes.city(lang, city.slug)}
                  className={s.city}
                  style={{
                    background: city.accent ?? 'var(--cyan)',
                    ['--d' as string]: `${i * 0.4}s`,
                  }}
                >
                  <span
                    style={{ position: 'relative', zIndex: 1, display: 'block', maxWidth: '60%' }}
                  >
                    <span
                      style={{
                        display: 'block',
                        fontFamily: 'var(--display)',
                        fontSize: 24,
                        lineHeight: 1,
                      }}
                    >
                      {t(city.name ?? city.slug)}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        marginTop: 10,
                        background: 'var(--ink)',
                        color: 'var(--cream)',
                        fontWeight: 800,
                        fontSize: 11,
                        letterSpacing: '1.4px',
                        padding: '5px 8px',
                      }}
                    >
                      {n ? c.citySpots.replace('{n}', String(n)) : c.soon}
                    </span>
                  </span>
                  {m?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.url}
                      srcSet={buildSrcSet(m)}
                      sizes="90px"
                      alt=""
                      width={m.width ?? undefined}
                      height={m.height ?? undefined}
                      loading="lazy"
                    />
                  ) : null}
                </Link>
              )
            })}
          </div>
        </section>

        {/* --- Follow --- */}
        <section className={s.reveal} style={section} aria-labelledby="card-follow">
          <h2
            id="card-follow"
            className={s.tab}
            style={{ alignSelf: 'flex-start', margin: 0, fontWeight: 400 }}
          >
            {c.followH}
          </h2>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
            {c.followP}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))',
              gap: 14,
            }}
          >
            <a href={SOCIAL.instagram} className={s.social} target="_blank" rel="noopener">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
              </svg>
              INSTAGRAM
            </a>
            <a href={SOCIAL.tiktok} className={s.social} target="_blank" rel="noopener">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M14 3v12a4 4 0 1 1-4-4" />
                <path d="M14 3c.6 2.8 2.6 4.6 5.5 4.8" />
              </svg>
              TIKTOK
            </a>
            <a href={SOCIAL.facebook} className={s.social} target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M14 8.5V7c0-.8.4-1.2 1.3-1.2H17V2.3h-2.6C11.5 2.3 10 4 10 6.7v1.8H7.5V12H10v9.7h4V12h2.7l.5-3.5z" />
              </svg>
              FACEBOOK
            </a>
          </div>
        </section>

      </main>
    </PageShell>
  )
}
