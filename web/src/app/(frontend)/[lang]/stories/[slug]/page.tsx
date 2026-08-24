import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { getCity, getStories, getStory, rel } from '../../../../../lib/data'
import type { City, Listing, Media } from '../../../../../payload-types'
import { PageShell } from '../../../../../components/PageShell'
import { StoryBlocks } from '../../../../../components/StoryBlocks'
import { MediaSlot } from '../../../../../components/MediaSlot'
import { FULL_WIDTH_SIZES } from '../../../../../lib/srcset'
import chrome from '../../../../../components/chrome.module.css'

/**
 * Rendered per request, always.
 *
 * `generateStaticParams` below is kept because it is the way back to static
 * rendering if that is ever wanted (see CMS.md). But this page reads the
 * request header the nav uses for its active section, so Next must not attempt
 * to statically generate it — in a production build whose database is empty at
 * build time, `generateStaticParams` returns nothing and Next falls back to
 * generating on demand, where that header read throws DYNAMIC_SERVER_USAGE and
 * the route 500s. Dev and a locally-seeded build both hide this; the container
 * does not.
 */
export const dynamic = 'force-dynamic'


const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

export async function generateStaticParams() {
  const stories = await getStories('en')
  return stories.flatMap((s) => [
    { lang: 'en', slug: s.slug },
    { lang: 'es', slug: s.slug },
  ])
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLang(lang)) return {}
  const story = await getStory(lang, slug)
  if (!story) return {}
  return {
    title: story.title,
    description: story.dek ?? undefined,
    alternates: {
      canonical: routes.story(lang, slug),
      languages: { en: routes.story('en', slug), es: routes.story('es', slug) },
    },
  }
}

export default async function StoryPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)

  const story = await getStory(lang, slug)
  if (!story) notFound()

  const listing = rel<Listing>(story.listing)
  // story -> listing -> city populates at depth 2, but the city's own mascot
  // upload sits one level deeper than that, so it comes back as a bare id.
  // Re-fetch the city rather than raising depth on the whole story query.
  const cityRef = listing ? rel<City>(listing.city) : null
  const city = cityRef ? await getCity(lang, cityRef.slug) : null
  const mascot = city ? rel<Media>(city.solo) : null

  const others = (await getStories(lang)).filter((s) => s.slug !== slug)

  return (
    <PageShell>
      <div style={{ position: 'relative' }}>
        {/* Scroll progress. Chromium drives it from the root scroller; elsewhere
            the `both` fill leaves it full, which is a harmless resting state. */}
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            height: 10,
            background: 'var(--ink)',
            zIndex: 70,
          }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--yellow)',
              transformOrigin: '0 50%',
              animation: 'barGrow 1s linear both',
              animationTimeline: 'scroll(root block)',
            }}
          />
        </div>

        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: 'clamp(14px,3.5vw,22px) clamp(12px,3.5vw,22px) 0',
          }}
        >
          <Link
            href={routes.stories(lang)}
            className={chrome.chip}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              // Full width, not shrink-wrapped: the source's anchor mixin sets
              // display:flex on a block-level <a>, so it fills the container.
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontFamily: 'var(--display)',
              fontSize: 15,
              padding: '9px 14px 7px',
              border: '4px solid var(--ink)',
              background: 'var(--grad-cream)',
              boxShadow: '4px 4px 0 var(--ink)',
            }}
          >
            {t('← ALL STORIES')}
          </Link>
        </div>

        <article
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            padding: 'clamp(14px,3vw,20px) clamp(12px,3.5vw,22px) 80px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          {/* --- Masthead --- */}
          <header
            style={{
              background: 'var(--ink)',
              border: '4px solid var(--ink)',
              boxShadow: '9px 9px 0 var(--cream)',
              padding: 'clamp(18px,4vw,40px) clamp(18px,4vw,44px) clamp(22px,4vw,40px)',
            }}
          >
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
              {city ? (
                <div
                  style={{
                    background: 'var(--grad-pink)',
                    color: 'var(--cream)',
                    fontFamily: 'var(--display)',
                    fontSize: 15,
                    padding: '7px 11px 4px',
                  }}
                >
                  {city.name}
                </div>
              ) : null}
              <div
                style={{
                  color: 'var(--yellow)',
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '2px',
                }}
              >
                {story.kicker}
              </div>
            </div>
            <h1
              style={{
                margin: '16px 0 0',
                fontFamily: 'var(--display)',
                fontSize: 'clamp(38px,10vw,88px)',
                lineHeight: 0.87,
                color: 'var(--cream)',
                textWrap: 'balance',
              }}
            >
              {story.title}
            </h1>
            <p
              style={{
                margin: '18px 0 0',
                maxWidth: '54ch',
                color: 'var(--cyan)',
                fontWeight: 600,
                fontSize: 'clamp(16px,4vw,21px)',
                lineHeight: 1.5,
                textWrap: 'pretty',
              }}
            >
              {story.dek}
            </p>
            <div
              style={{
                marginTop: 22,
                paddingTop: 16,
                borderTop: '3px dotted #43494f',
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                alignItems: 'center',
                color: 'var(--cream)',
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: '1.4px',
              }}
            >
              <div>{story.byline}</div>
              <div style={{ color: 'var(--yellow)' }}>{story.readTime}</div>
              <div
                data-hide-xs
                style={{
                  marginLeft: 'auto',
                  fontWeight: 600,
                  letterSpacing: '0.4px',
                  color: '#8b939c',
                }}
              >
                {t('SCROLL — THE PICTURES COME WITH YOU')}
              </div>
            </div>
          </header>

          {/* --- Cover --- */}
          <div
            style={{
              position: 'relative',
              border: '4px solid var(--ink)',
              borderTop: 0,
              boxShadow: '9px 9px 0 var(--ink)',
              height: 'clamp(240px,52vw,520px)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                animation: 'clipIn 1s ease-out both',
                animationTimeline: 'view()',
                animationRange: 'entry 0% cover 26%',
              }}
            >
              <MediaSlot
                media={story.cover}
                placeholder={story.coverHint}
                sizes={FULL_WIDTH_SIZES}
                priority
              />
            </div>
          </div>
          <div
            style={{
              background: 'var(--ink)',
              color: 'var(--cream)',
              fontFamily: mono,
              fontSize: 12,
              letterSpacing: '0.6px',
              padding: '9px 14px',
              border: '4px solid var(--ink)',
              borderTop: 0,
              boxShadow: '9px 9px 0 var(--ink)',
            }}
          >
            {story.coverCap}
          </div>

          {/* --- Body, with the mascot rail --- */}
          <div
            data-storygrid
            style={{
              display: 'grid',
              gridTemplateColumns: '74px minmax(0,1fr)',
              gap: 0,
              marginTop: 'clamp(20px,4vw,34px)',
            }}
          >
            <div data-rail style={{ position: 'relative' }} aria-hidden="true">
              <div style={{ position: 'sticky', top: 150, height: 'calc(100vh - 260px)' }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 26,
                    top: 0,
                    bottom: 0,
                    width: 0,
                    borderLeft: '4px dotted var(--ink)',
                  }}
                />
                {mascot?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mascot.url}
                    alt=""
                    style={{
                      position: 'absolute',
                      left: -6,
                      width: 88,
                      height: 'auto',
                      animation: 'walkDown 1s linear both',
                      animationTimeline: 'scroll(root block)',
                      filter: 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))',
                    }}
                  />
                ) : null}
              </div>
            </div>

            <div
              style={{
                background: 'var(--grad-cream)',
                border: '4px solid var(--ink)',
                boxShadow: '10px 10px 0 var(--ink)',
                padding:
                  'clamp(20px,4vw,46px) clamp(18px,4vw,40px) clamp(26px,5vw,52px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'clamp(20px,3.4vw,30px)',
              }}
            >
              <StoryBlocks blocks={story.blocks} />

              <div
                style={{
                  maxWidth: '66ch',
                  margin: '0 auto',
                  width: '100%',
                  background: 'var(--ink)',
                  padding: 'clamp(18px,3.5vw,26px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--display)',
                    fontSize: 'clamp(22px,5vw,30px)',
                    color: 'var(--yellow)',
                    lineHeight: 1.02,
                  }}
                >
                  {t('GO SEE IT YOURSELF.')}
                </div>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--cream)',
                    fontWeight: 600,
                    fontSize: 15,
                    lineHeight: 1.55,
                  }}
                >
                  {story.outro}
                </p>
                {listing && city ? (
                  <Link
                    href={routes.business(lang, city.slug, listing.slug)}
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      alignSelf: 'flex-start',
                      cursor: 'pointer',
                      fontFamily: 'var(--display)',
                      fontSize: 17,
                      padding: '13px 18px 10px',
                      border: '4px solid var(--cream)',
                      background: 'var(--grad-pink)',
                      color: 'var(--cream)',
                    }}
                  >
                    {story.bizCta}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          {/* --- Read another --- */}
          {others.length ? (
            <>
              <div
                style={{
                  marginTop: 'clamp(24px,4vw,40px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
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
                  {t('READ ANOTHER')}
                </h2>
                <div style={{ flex: 1, height: 5, background: 'var(--ink)' }} />
              </div>
              <div
                style={{
                  marginTop: 16,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,270px),1fr))',
                  gap: 'clamp(14px,2.5vw,20px)',
                }}
              >
                {others.map((s) => (
                  <Link
                    key={s.id}
                    href={routes.story(lang, s.slug)}
                    className={chrome.card}
                    style={{
                      textDecoration: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      background: 'var(--grad-cream)',
                      border: '4px solid var(--ink)',
                      boxShadow: '7px 7px 0 var(--ink)',
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      minWidth: 0,
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
                      {s.kicker}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--display)',
                        fontSize: 22,
                        lineHeight: 1.02,
                        textWrap: 'balance',
                      }}
                    >
                      {s.title}
                    </div>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                      {s.dek}
                    </p>
                    <div style={{ marginTop: 8, fontFamily: 'var(--display)', fontSize: 15 }}>
                      {t('READ →')}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </article>
      </div>
    </PageShell>
  )
}
