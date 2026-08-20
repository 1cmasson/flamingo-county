import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { getCity, getStories, rel } from '../../../../lib/data'
import type { City, Listing } from '../../../../payload-types'
import { PageShell } from '../../../../components/PageShell'
import { MediaSlot } from '../../../../components/MediaSlot'
import s from '../../../../components/chrome.module.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const t = translator(lang)
  return {
    title: `${t('THE STORIES')} ${t('BEHIND THE DOORS')}`,
    description: t(
      'Every listing on Flamingo County is a person who signed a lease and decided to stay. These are the long versions — read them slow, the pictures come to you.',
    ),
    alternates: {
      canonical: routes.stories(lang),
      languages: { en: routes.stories('en'), es: routes.stories('es') },
    },
  }
}

/** Each story's city comes via its listing, one relationship deeper than the query. */
async function cityFor(lang: Lang, story: { listing?: unknown }) {
  const listing = rel<Listing>(story.listing as never)
  const ref = listing ? rel<City>(listing.city) : null
  return ref ? getCity(lang, ref.slug) : null
}

export default async function StoriesPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)

  const stories = await getStories(lang)
  const [feature, ...rest] = stories
  const cities = await Promise.all(stories.map((st) => cityFor(lang, st)))
  const cityOf = (i: number) => cities[i]

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(18px,3vw,26px)',
        }}
      >
        <header
          style={{
            background: 'var(--ink)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--cream)',
            padding: 'clamp(18px,4vw,34px)',
            position: 'relative',
            overflow: 'hidden',
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
            {t('TOLD BY THE OWNERS · WRITTEN BY US')}
          </div>
          <h1
            style={{
              margin: '12px 0 0',
              fontFamily: 'var(--display)',
              fontSize: 'clamp(42px,12vw,104px)',
              lineHeight: 0.86,
              color: 'var(--cream)',
              letterSpacing: '1px',
            }}
          >
            {t('THE STORIES')}
            <br />
            <span style={{ color: 'var(--pink)' }}>{t('BEHIND THE DOORS')}</span>
          </h1>
          <p
            style={{
              margin: '16px 0 0',
              maxWidth: '58ch',
              color: 'var(--cream)',
              fontWeight: 600,
              fontSize: 'clamp(15px,3.6vw,18px)',
              lineHeight: 1.55,
              textWrap: 'pretty',
            }}
          >
            {t(
              'Every listing on Flamingo County is a person who signed a lease and decided to stay. These are the long versions — read them slow, the pictures come to you.',
            )}
          </p>
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                color: 'var(--cyan)',
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '1.4px',
              }}
            >
              {t('NEW ONE EVERY OTHER FRIDAY')}
            </div>
          </div>
        </header>

        {/* --- Featured --- */}
        {feature ? (
          <Link
            href={routes.story(lang, feature.slug)}
            data-stack
            className={s.cardBig}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              cursor: 'pointer',
              background: 'var(--grad-cream)',
              border: '4px solid var(--ink)',
              boxShadow: '9px 9px 0 var(--ink)',
              display: 'grid',
              gridTemplateColumns: '1.05fr 0.95fr',
              gap: 0,
            }}
          >
            <div
              style={{
                position: 'relative',
                minHeight: 'clamp(230px,44vw,420px)',
                borderRight: '4px solid var(--ink)',
              }}
            >
              <MediaSlot media={feature.cover} placeholder={feature.coverHint} priority />
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  background: 'var(--yellow)',
                  border: '3px solid var(--ink)',
                  fontFamily: 'var(--display)',
                  fontSize: 15,
                  padding: '7px 11px 4px',
                  transform: 'rotate(-2deg)',
                  pointerEvents: 'none',
                }}
              >
                {t('FEATURED STORY')}
              </div>
            </div>
            <div
              style={{
                padding: 'clamp(18px,3.5vw,32px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '2px',
                  color: 'var(--magenta)',
                }}
              >
                {feature.kicker}
              </div>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: 'clamp(28px,6.5vw,46px)',
                  lineHeight: 0.94,
                  textWrap: 'balance',
                }}
              >
                {feature.title}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 'clamp(15px,3.6vw,17px)',
                  fontWeight: 600,
                  lineHeight: 1.55,
                  textWrap: 'pretty',
                }}
              >
                {feature.dek}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: 9,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginTop: 2,
                }}
              >
                <div
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--cyan)',
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '1.4px',
                    padding: '6px 9px',
                  }}
                >
                  {cityOf(0)?.name}
                </div>
                <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1.2px' }}>
                  {feature.readTime}
                </div>
              </div>
              <div
                style={{
                  marginTop: 8,
                  alignSelf: 'flex-start',
                  fontFamily: 'var(--display)',
                  fontSize: 18,
                  background: 'var(--grad-pink)',
                  color: 'var(--cream)',
                  border: '4px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--ink)',
                  padding: '12px 18px 9px',
                }}
              >
                {t('READ THE STORY →')}
              </div>
            </div>
          </Link>
        ) : null}

        {rest.length ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                {t('ALSO ON THE SHELF')}
              </h2>
              <div style={{ flex: 1, height: 5, background: 'var(--ink)' }} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,290px),1fr))',
                gap: 'clamp(14px,2.5vw,20px)',
              }}
            >
              {rest.map((st, i) => (
                <Link
                  key={st.id}
                  href={routes.story(lang, st.slug)}
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
                      height: 200,
                      borderBottom: '4px solid var(--ink)',
                    }}
                  >
                    <MediaSlot media={st.cover} placeholder={st.coverHint} />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        background: 'var(--ink)',
                        color: 'var(--cyan)',
                        fontWeight: 800,
                        fontSize: 10,
                        letterSpacing: '1.5px',
                        padding: '6px 9px',
                        pointerEvents: 'none',
                      }}
                    >
                      {cityOf(i + 1)?.name}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '16px 16px 18px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 10,
                        letterSpacing: '1.8px',
                        color: 'var(--magenta)',
                      }}
                    >
                      {st.kicker}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--display)',
                        fontSize: 23,
                        lineHeight: 1.02,
                        textWrap: 'balance',
                      }}
                    >
                      {st.title}
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
                      {st.dek}
                    </p>
                    <div
                      style={{
                        marginTop: 'auto',
                        paddingTop: 12,
                        borderTop: '3px dotted var(--ink)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.2px' }}>
                        {st.readTime}
                      </div>
                      <div
                        style={{
                          marginLeft: 'auto',
                          fontFamily: 'var(--display)',
                          fontSize: 15,
                        }}
                      >
                        {t('READ →')}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </PageShell>
  )
}
