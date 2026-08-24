import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import {
  getCity,
  getListing,
  getListings,
  getListYourSpotPage,
  getSiteSettings,
  getStoryForListing,
  rel,
} from '../../../../../lib/data'
import type { Category, City, Media } from '../../../../../payload-types'
import { PageShell } from '../../../../../components/PageShell'
import { MediaSlot } from '../../../../../components/MediaSlot'
import { FULL_WIDTH_SIZES } from '../../../../../lib/srcset'
import s from '../../../../../components/chrome.module.css'

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


export async function generateStaticParams() {
  const listings = await getListings('en')
  return listings.flatMap((b) => {
    const city = rel<City>(b.city)
    if (!city) return []
    return [
      { lang: 'en', city: city.slug, business: b.slug },
      { lang: 'es', city: city.slug, business: b.slug },
    ]
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string; business: string }>
}): Promise<Metadata> {
  const { lang, city, business } = await params
  if (!isLang(lang)) return {}
  const doc = await getListing(lang, business)
  if (!doc) return {}
  return {
    title: doc.name,
    description: doc.tag ?? undefined,
    alternates: {
      canonical: routes.business(lang, city, business),
      languages: {
        en: routes.business('en', city, business),
        es: routes.business('es', city, business),
      },
    },
  }
}

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ lang: string; city: string; business: string }>
}) {
  const { lang, city: citySlug, business } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)

  const listing = await getListing(lang, business)
  if (!listing) notFound()

  const listingCity = rel<City>(listing.city)
  // The city must match the path, or /en/hialeah/el-gallo would render a
  // Little Havana business under a Hialeah URL.
  if (!listingCity || listingCity.slug !== citySlug) notFound()

  const [city, settings, lys, story] = await Promise.all([
    getCity(lang, citySlug),
    getSiteSettings(lang),
    getListYourSpotPage(lang),
    getStoryForListing(lang, listing.id),
  ])

  const category = rel<Category>(listing.category)
  const mascot = city ? rel<Media>(city.solo) : null
  const gallery = (Array.isArray(listing.gallery) ? listing.gallery : []).map((g) => rel<Media>(g))

  const d = listing.detail ?? {}
  const storyParas = (d.story ?? []).map((p) => p.text).filter(Boolean)
  /**
   * Hours print only when they are trustworthy.
   *
   * Researched listings carry the confidence their sources actually supported,
   * and 7 of 11 are below `high` — two of those have three sources that flatly
   * disagree. Printing a schedule we know is contested is how a directory earns
   * angry calls from owners, so anything under `high` shows the phone number
   * and an invitation to call instead. An EMPTY confidence means authored
   * design content rather than a failed verification, so it still prints.
   */
  const hoursConfidence = d.hoursConfidence ?? null
  const hoursTrusted = hoursConfidence === null || hoursConfidence === 'high'
  const allHours = d.hours ?? []
  const hours = hoursTrusted ? allHours : []
  const hoursUnconfirmed = !hoursTrusted && allHours.length > 0
  const hasVisit = Boolean(d.address || d.phone || d.site || hours.length || hoursUnconfirmed)
  // Services are page copy shared by every non-food listing, not per-business
  // data — the source hardcoded the same four for all of them.
  // "Estimates on request · Licensed & insured · Warranty on the work" is
  // trade copy. The source gated it on "not a restaurant", which was fine when
  // the taxonomy had contractors and cleaners in it — but the taxonomy is
  // restaurants and bars now, and that gate printed contractor language on a
  // taproom. Gated on the trade categories by name instead, so it renders
  // nowhere today and comes back correctly if those categories return.
  const TRADE_CATEGORIES = ['contract', 'clean']
  const services = TRADE_CATEGORIES.includes(category?.slug ?? '') ? (lys.services ?? []) : []

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: 'clamp(14px,3.5vw,22px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(16px,3vw,22px)',
        }}
      >
        <Link
          href={routes.city(lang, citySlug)}
          className={s.chip}
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            alignSelf: 'flex-start',
            fontFamily: 'var(--display)',
            fontSize: 15,
            padding: '9px 14px 7px',
            border: '4px solid var(--ink)',
            background: 'var(--grad-cream)',
            boxShadow: '4px 4px 0 var(--ink)',
          }}
        >
          {t('← ALL LISTINGS')}
        </Link>

        {/* --- Masthead --- */}
        <div
          style={{
            background: 'var(--grad-cream)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--ink)',
          }}
        >
          <div
            style={{
              position: 'relative',
              height: 'clamp(190px,42vw,330px)',
              borderBottom: '4px solid var(--ink)',
            }}
          >
            <MediaSlot
              media={gallery[0]}
              placeholder={t('Drop the hero shot — dining room, bar, storefront')}
              sizes={FULL_WIDTH_SIZES}
              priority
            />
            <div
              style={{
                position: 'absolute',
                left: 18,
                bottom: 18,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  background: 'var(--yellow)',
                  border: '4px solid var(--ink)',
                  padding: '8px 12px 5px',
                  fontFamily: 'var(--display)',
                  fontSize: 16,
                }}
              >
                {city?.name}
              </div>
              <div
                style={{
                  background: 'var(--grad-pink)',
                  border: '4px solid var(--ink)',
                  padding: '8px 12px 5px',
                  fontFamily: 'var(--display)',
                  fontSize: 16,
                  color: 'var(--cream)',
                }}
              >
                {category?.label}
              </div>
            </div>
            {mascot?.url ? (
              <div
                style={{
                  position: 'absolute',
                  right: 16,
                  bottom: -30,
                  background: city?.castBg ?? 'var(--cyan)',
                  border: '4px solid var(--ink)',
                  width: 'clamp(84px,17vw,132px)',
                  height: 'clamp(84px,17vw,132px)',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mascot.url} alt="" style={{ height: '91%', width: 'auto' }} />
              </div>
            ) : null}
          </div>
          <div
            style={{
              padding: 'clamp(18px,3.5vw,24px) clamp(16px,3.5vw,26px) 26px',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 14,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontSize: 'clamp(30px,7vw,52px)',
                lineHeight: 0.94,
                maxWidth: '24ch',
              }}
            >
              {listing.name}
            </h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {settings.showRatings !== false && typeof listing.rating === 'number' ? (
                <div
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--yellow)',
                    fontWeight: 800,
                    fontSize: 13,
                    padding: '7px 10px',
                  }}
                >
                  ★ {listing.rating.toFixed(1)} · {listing.reviews} {t('REVIEWS')}
                </div>
              ) : null}
              <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '1px' }}>
                {listing.hood}
              </div>
              {listing.member && settings.memberBadges !== false ? (
                <div
                  style={{
                    background: 'var(--yellow)',
                    border: '3px solid var(--ink)',
                    fontWeight: 800,
                    fontSize: 12,
                    padding: '6px 9px',
                  }}
                >
                  {t('VERIFIED MEMBER')}
                </div>
              ) : null}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 'clamp(16px,4vw,19px)',
                fontWeight: 600,
                lineHeight: 1.45,
                maxWidth: '70ch',
                textWrap: 'pretty',
              }}
            >
              {listing.tag}
            </p>
          </div>
        </div>

        <div
          data-stack
          style={{
            display: 'grid',
            gridTemplateColumns: '1.55fr 0.85fr',
            gap: 'clamp(16px,3vw,22px)',
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(16px,3vw,22px)' }}>
            {/* The story panel only appears when an owner has actually given us
                one. The static site synthesised three paragraphs from the array
                index for every listing without real copy; those are not
                imported, so 13 of 14 listings legitimately have none. */}
            {storyParas.length || d.quote ? (
              <section
                style={{
                  background: 'var(--grad-cyan)',
                  border: '4px solid var(--ink)',
                  boxShadow: '8px 8px 0 var(--ink)',
                  padding: 'clamp(16px,3.5vw,24px)',
                }}
              >
                <h2
                  style={{
                    display: 'inline-block',
                    margin: '0 0 14px',
                    background: 'var(--ink)',
                    color: 'var(--yellow)',
                    fontFamily: 'var(--display)',
                    fontSize: 22,
                    fontWeight: 400,
                    padding: '7px 12px 4px',
                  }}
                >
                  {t('THE STORY')}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {storyParas.map((p, i) => (
                    <p
                      key={i}
                      style={{
                        margin: 0,
                        fontSize: 16,
                        lineHeight: 1.6,
                        fontWeight: 600,
                        textWrap: 'pretty',
                      }}
                    >
                      {p}
                    </p>
                  ))}
                </div>
                {d.quote ? (
                  <figure
                    style={{
                      margin: '18px 0 0',
                      background: 'var(--grad-cream)',
                      border: '4px solid var(--ink)',
                      padding: 16,
                      display: 'flex',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{ fontFamily: 'var(--display)', fontSize: 44, lineHeight: 0.8 }}
                    >
                      “
                    </div>
                    <div>
                      <blockquote
                        style={{
                          margin: 0,
                          fontSize: 16,
                          fontWeight: 800,
                          lineHeight: 1.4,
                          textWrap: 'pretty',
                        }}
                      >
                        {d.quote}
                      </blockquote>
                      {d.quoteBy ? (
                        <figcaption
                          style={{
                            fontWeight: 800,
                            fontSize: 12,
                            letterSpacing: '1.4px',
                            marginTop: 6,
                            color: 'var(--magenta)',
                          }}
                        >
                          {d.quoteBy}
                        </figcaption>
                      ) : null}
                    </div>
                  </figure>
                ) : null}
                {story ? (
                  <Link
                    href={routes.story(lang, story.slug)}
                    className={s.chipStory}
                    style={{
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: '0 0 auto',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      marginTop: 16,
                      fontFamily: 'var(--display)',
                      fontSize: 17,
                      padding: '13px 18px 10px',
                      border: '4px solid var(--ink)',
                      background: 'var(--ink)',
                      color: 'var(--yellow)',
                      boxShadow: '5px 5px 0 var(--cream)',
                    }}
                  >
                    {t('READ THE FULL STORY →')}
                  </Link>
                ) : null}
              </section>
            ) : null}


            {services.length ? (
              <section
                style={{
                  background: 'var(--grad-cream)',
                  border: '4px solid var(--ink)',
                  boxShadow: '8px 8px 0 var(--ink)',
                  padding: 24,
                }}
              >
                <h2
                  style={{
                    display: 'inline-block',
                    margin: '0 0 16px',
                    background: 'var(--grad-pink)',
                    color: 'var(--cream)',
                    fontFamily: 'var(--display)',
                    fontSize: 22,
                    fontWeight: 400,
                    padding: '7px 12px 4px',
                  }}
                >
                  {t('WHAT THEY DO')}
                </h2>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))',
                    gap: 12,
                  }}
                >
                  {services.map((sv, i) => (
                    <div
                      key={sv.id ?? i}
                      style={{
                        border: '3px solid var(--ink)',
                        padding: 12,
                        background: 'var(--grad-cyan)',
                      }}
                    >
                      <div
                        style={{ fontFamily: 'var(--display)', fontSize: 17, lineHeight: 1.1 }}
                      >
                        {sv.text}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,135px),1fr))',
                gap: 'clamp(10px,2vw,14px)',
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    height: 'clamp(130px,22vw,170px)',
                    border: '4px solid var(--ink)',
                    boxShadow: '6px 6px 0 var(--ink)',
                  }}
                >
                  <MediaSlot
                    media={gallery[i + 1]}
                    placeholder={listing.imageHint ? `${t('Drop: ')}${listing.imageHint}` : null}
                    // Three-up under the main column, so ~250px on a desktop.
                    sizes="(max-width: 700px) 33vw, 250px"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* --- Sidebar --- */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {hasVisit ? (
              <section
                style={{
                  background: 'var(--ink)',
                  border: '4px solid var(--ink)',
                  boxShadow: '8px 8px 0 var(--cream)',
                  padding: 20,
                  color: 'var(--cream)',
                }}
              >
                <h2
                  style={{
                    margin: '0 0 12px',
                    fontFamily: 'var(--display)',
                    fontSize: 22,
                    fontWeight: 400,
                    color: 'var(--yellow)',
                  }}
                >
                  {t('VISIT')}
                </h2>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 9,
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {d.address ? <div>{d.address}</div> : null}
                  {d.phone ? (
                    <a href={`tel:${d.phone.replace(/[^\d+]/g, '')}`} style={{ color: 'inherit' }}>
                      {d.phone}
                    </a>
                  ) : null}
                  {d.site ? (
                    <a
                      href={`https://${d.site}`}
                      rel="noopener noreferrer"
                      style={{ color: 'var(--cyan)', fontWeight: 800 }}
                    >
                      {d.site}
                    </a>
                  ) : null}
                </div>
                {hours.length ? (
                  <div
                    style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    {hours.map((h, i) => (
                      <div
                        key={h.id ?? i}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          fontWeight: 600,
                          fontSize: 13,
                          borderBottom: '2px dotted #43494f',
                          paddingBottom: 5,
                        }}
                      >
                        <span>{h.d}</span>
                        <span style={{ fontWeight: 800, color: 'var(--yellow)' }}>{h.t}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {hoursUnconfirmed ? (
                  <div
                    style={{
                      marginTop: 16,
                      fontWeight: 600,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: '#c9ced4',
                    }}
                  >
                    {t('Hours vary by source — call to confirm.')}
                  </div>
                ) : null}
                {d.cta && d.phone ? (
                  <a
                    href={`tel:${d.phone.replace(/[^\d+]/g, '')}`}
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      marginTop: 16,
                      width: '100%',
                      fontFamily: 'var(--display)',
                      fontSize: 17,
                      padding: '13px 14px 10px',
                      border: '4px solid var(--cream)',
                      background: 'var(--grad-pink)',
                      color: 'var(--cream)',
                    }}
                  >
                    {d.cta}
                  </a>
                ) : null}
              </section>
            ) : null}

            {d.crewLine ? (
              <section
                style={{
                  background: 'var(--yellow)',
                  border: '4px solid var(--ink)',
                  boxShadow: '8px 8px 0 var(--ink)',
                  padding: 18,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: 'var(--display)',
                    fontSize: 20,
                    fontWeight: 400,
                    lineHeight: 1.05,
                  }}
                >
                  {t('GOING WITH THE CREW?')}
                </h2>
                <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
                  {d.crewLine}
                </p>
                {mascot?.url ? (
                  <div
                    style={{
                      marginTop: 12,
                      background: city?.castBg ?? 'var(--cyan)',
                      border: '3px solid var(--ink)',
                      height: 200,
                      display: 'flex',
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mascot.url} alt="" style={{ height: '95%', width: 'auto' }} />
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </PageShell>
  )
}
