import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { getAboutPage, getCities, getListings, getSiteSettings, rel } from '../../../../lib/data'
import { castBg } from '../../../../lib/castBg'
import type { City, Media } from '../../../../payload-types'
import { PageShell } from '../../../../components/PageShell'
import s from '../../../../components/chrome.module.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const about = await getAboutPage(lang)
  return {
    title: [about.h1a, about.h1b].filter(Boolean).join(' '),
    description: about.intro ?? undefined,
    alternates: {
      canonical: routes.about(lang),
      languages: { en: routes.about('en'), es: routes.about('es') },
    },
  }
}

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)

  // All of this used to be inline L(en, es) pairs inside About.dc.html, in
  // neither fc-data.js nor the dictionary — the one body of copy nobody could
  // edit without opening a component.
  const [about, cities, settings, listings] = await Promise.all([
    getAboutPage(lang),
    getCities(lang),
    getSiteSettings(lang),
    getListings(lang),
  ])

  // A city with nothing published gets a COMING SOON ribbon rather than a card
  // that leads somewhere empty. Same zero-listing test the city page uses.
  const covered = new Set(
    listings.map((b) => rel<City>(b.city)?.slug).filter(Boolean) as string[],
  )

  const portrait = rel<Media>(about.photo)
  const backdrop = rel<Media>(cities.find((c) => c.slug === 'hialeah')?.photo)

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(18px,3vw,24px)',
        }}
      >
        <header
          style={{
            background: 'var(--ink)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--cream)',
            padding: 'clamp(18px,4vw,36px)',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: 'var(--yellow)',
              color: 'var(--ink)',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '2px',
              padding: '6px 10px',
            }}
          >
            {about.kicker}
          </div>
          <h1
            style={{
              margin: '14px 0 0',
              fontFamily: 'var(--display)',
              fontSize: 'clamp(36px,9vw,76px)',
              lineHeight: 0.9,
              color: 'var(--cream)',
              textWrap: 'balance',
            }}
          >
            {about.h1a}
            <br />
            <span style={{ color: 'var(--cyan)' }}>{about.h1b}</span>
          </h1>
          <p
            style={{
              margin: '18px 0 0',
              maxWidth: '60ch',
              color: 'var(--cream)',
              fontWeight: 600,
              fontSize: 'clamp(15px,3.6vw,18px)',
              lineHeight: 1.55,
              textWrap: 'pretty',
            }}
          >
            {about.intro}
          </p>
        </header>

        {/* --- Founder --- */}
        <section
          data-stack
          style={{
            background: 'var(--grad-cream)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            padding: 'clamp(16px,3.5vw,26px)',
            display: 'grid',
            gridTemplateColumns: '250px 1fr',
            gap: 22,
            alignItems: 'start',
          }}
        >
          <div
            style={{
              width: '100%',
              aspectRatio: '3/4',
              border: '4px solid var(--ink)',
              backgroundColor: 'var(--pink)',
              // A pink wash over the Hialeah street photo, which the source
              // referenced directly; it comes off the city record now.
              backgroundImage: backdrop?.url
                ? `linear-gradient(rgba(255,46,136,0.62),rgba(255,46,136,0.62)), url('${backdrop.url}')`
                : undefined,
              backgroundPosition: 'center, center 45%',
              backgroundSize: 'cover, cover',
              backgroundRepeat: 'no-repeat',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {portrait?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={portrait.url}
                alt={portrait.alt ?? ''}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  objectFit: 'contain',
                  objectPosition: 'bottom',
                  display: 'block',
                }}
              />
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'inline-flex',
                alignSelf: 'flex-start',
                background: 'var(--ink)',
                color: 'var(--yellow)',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '1.8px',
                padding: '5px 9px',
              }}
            >
              {about.founderKicker}
            </div>
            {[about.founderP1, about.founderP2].filter(Boolean).map((p, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.6,
                  maxWidth: '64ch',
                  textWrap: 'pretty',
                }}
              >
                {p}
              </p>
            ))}
            <div style={{ marginTop: 4, fontFamily: 'var(--display)', fontSize: 20 }}>
              {about.founderSig}
            </div>
            <div
              style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1px', color: '#7A6A4E' }}
            >
              {about.founderTag}
            </div>
          </div>
        </section>

        {/* --- The cities --- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))',
            gap: 'clamp(14px,2.5vw,20px)',
          }}
        >
          {cities.map((c) => {
            const mascot = rel<Media>(c.solo)
            const soon = !covered.has(c.slug)
            return (
              <Link
                key={c.id}
                href={routes.city(lang, c.slug)}
                className={s.card}
                style={{
                  textDecoration: 'none',
                  color: 'var(--ink)',
                  background: c.accent ?? 'var(--pink)',
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
                    background: castBg(c),
                    borderBottom: '4px solid var(--ink)',
                    height: 220,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {soon ? (
                    <div
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        background: 'var(--ink)',
                        color: 'var(--yellow)',
                        fontWeight: 800,
                        fontSize: 10,
                        letterSpacing: '1.6px',
                        padding: '5px 9px',
                      }}
                    >
                      {t('COMING SOON')}
                    </div>
                  ) : null}
                  {mascot?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mascot.url}
                      alt=""
                      style={{
                        maxHeight: '100%',
                        maxWidth: '100%',
                        width: 'auto',
                        objectFit: 'contain',
                        objectPosition: 'bottom',
                      }}
                    />
                  ) : null}
                </div>
                <div
                  style={{
                    padding: '16px 16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1 }}>
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 11,
                      letterSpacing: '1.6px',
                      color: 'var(--ink)',
                    }}
                  >
                    {c.sub}
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: 1.5,
                      textWrap: 'pretty',
                    }}
                  >
                    {c.blurb}
                  </p>
                  <div style={{ marginTop: 6, fontFamily: 'var(--display)', fontSize: 16 }}>
                    {t('SEE THE CITY →')}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* --- How it works --- */}
        <section
          style={{
            background: 'var(--grad-cream)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            padding: 'clamp(18px,3.5vw,28px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2
              style={{
                margin: 0,
                background: 'var(--ink)',
                color: 'var(--yellow)',
                fontFamily: 'var(--display)',
                fontSize: 22,
                fontWeight: 400,
                padding: '8px 14px 5px',
              }}
            >
              {about.howH}
            </h2>
            <div style={{ flex: 1, minWidth: 60, height: 5, background: 'var(--ink)' }} />
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))',
              gap: 'clamp(12px,2vw,18px)',
            }}
          >
            {(about.steps ?? []).map((st, i) => (
              <div
                key={st.id ?? i}
                style={{
                  border: '4px solid var(--ink)',
                  background: st.bg ?? 'var(--grad-cream)',
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontFamily: 'var(--display)', fontSize: 38, lineHeight: 0.9 }}>
                  {st.n}
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 19, lineHeight: 1.06 }}>
                  {st.t}
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1.45,
                    textWrap: 'pretty',
                  }}
                >
                  {st.d}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* --- CTA --- */}
        <section
          data-stack
          style={{
            background: 'var(--grad-pink)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--ink)',
            padding: 'clamp(16px,3.5vw,26px)',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 20,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: 'clamp(24px,6vw,34px)',
                lineHeight: 1,
                color: 'var(--cream)',
                textWrap: 'balance',
              }}
            >
              {about.ctaH}
            </div>
            <p
              style={{
                margin: 0,
                color: 'var(--cream)',
                fontWeight: 600,
                fontSize: 15,
                lineHeight: 1.5,
                maxWidth: '58ch',
                textWrap: 'pretty',
              }}
            >
              {about.ctaP}
            </p>
          </div>
          <Link
            href={routes.listYourSpot(lang)}
            className={s.cardBig}
            style={{
              textDecoration: 'none',
              color: 'var(--ink)',
              justifySelf: 'start',
              display: 'inline-flex',
              alignItems: 'center',
              fontFamily: 'var(--display)',
              fontSize: 'clamp(17px,4.5vw,20px)',
              padding: '15px 22px 12px',
              border: '4px solid var(--ink)',
              background: 'var(--yellow)',
              boxShadow: '5px 5px 0 var(--ink)',
            }}
          >
            {about.ctaBtn}
          </Link>
        </section>

        {/* --- Reach me --- */}
        <section
          style={{
            background: 'var(--ink)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--cream)',
            padding: 'clamp(16px,3vw,24px)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 18,
            alignItems: 'center',
            color: 'var(--cream)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--display)',
              fontSize: 22,
              fontWeight: 400,
              color: 'var(--yellow)',
            }}
          >
            {about.reachH}
          </h2>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{about.reachP}</div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '1.6px',
              color: 'var(--cyan)',
              marginLeft: 'auto',
            }}
          >
            <a href={`mailto:${settings.contactEmail}`} style={{ color: 'inherit' }}>
              {settings.contactEmail?.toUpperCase()}
            </a>
            {' · '}
            <a
              href={`tel:${(settings.contactPhone ?? '').replace(/[^\d+]/g, '')}`}
              style={{ color: 'inherit' }}
            >
              {settings.contactPhone}
            </a>
          </div>
        </section>
      </main>
    </PageShell>
  )
}
