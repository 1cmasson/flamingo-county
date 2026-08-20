import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isLang, translator, type Lang } from '../../../i18n'
import { routes, withQuery } from '../../../lib/routes'
import {
  getCategories,
  getCities,
  getListings,
  getSiteSettings,
  getSpotlights,
  rel,
} from '../../../lib/data'
import type { City, Listing, Media } from '../../../payload-types'
import { PageShell } from '../../../components/PageShell'
import { BusinessCard } from '../../../components/BusinessCard'
import { NewsletterForm } from '../../../components/NewsletterForm'
import { MediaSlot } from '../../../components/MediaSlot'
import { SearchForm } from '../../../components/SearchForm'
import s from '../../../components/chrome.module.css'

type Search = { city?: string; cat?: string; q?: string }

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<Search>
}) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const sp = await searchParams
  const t = translator(lang as Lang)

  const cityKey = sp.city ?? ''
  const cat = sp.cat && sp.cat !== 'all' ? sp.cat : ''
  const q = sp.q ?? ''

  const [cities, categories, settings, allSpots, list] = await Promise.all([
    getCities(lang),
    getCategories(lang),
    getSiteSettings(lang),
    getSpotlights(lang),
    getListings(lang, { city: cityKey || undefined, category: cat || undefined, q: q || undefined }),
  ])

  const city = cities.find((c) => c.slug === cityKey) ?? null
  const spots = city
    ? allSpots.filter((sp2) => rel<City>(sp2.city)?.slug === city.slug)
    : allSpots

  // The hero photo and mascot art come from the city when one is selected, and
  // from site settings otherwise.
  const heroPhoto = city ? rel<Media>(city.photo) : rel<Media>(settings.heroPhoto)
  const heroCastImg = city
    ? rel<Media>(city.cast?.[0]?.image)
    : rel<Media>(settings.heroCast)
  const heroPos = city?.photoPos || (city ? 'center' : 'center 35%')
  const wash = city ? '0.86' : '0.80'
  const heroBg = heroPhoto?.url
    ? `linear-gradient(rgba(22,224,242,${wash}), rgba(22,224,242,${wash})), url("${heroPhoto.url}") ${heroPos}/cover no-repeat`
    : 'var(--cyan)'
  const heroFrameBg = heroPhoto?.url
    ? `linear-gradient(rgba(22,224,242,0.18), rgba(22,224,242,0.18)), url("${heroPhoto.url}") ${heroPos}/cover no-repeat`
    : (city?.castBg ?? settings.heroCastBg ?? '#00feff')

  const chips = [{ slug: '', label: t('EVERYTHING') }, ...categories.map((c) => ({ slug: c.slug, label: c.label ?? c.slug }))]

  return (
    <PageShell>
      <main>
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 0',
          }}
        >
          {/* --- Hero --- */}
          <div
            data-stack
            style={{
              background: heroBg,
              border: '4px solid var(--ink)',
              boxShadow: '5px 5px 0 var(--cyan)',
              padding: 'clamp(16px,3vw,22px)',
              marginBottom: 20,
              display: 'grid',
              gridTemplateColumns: '1.15fr 0.85fr',
              gap: 'clamp(16px,2.5vw,20px)',
              alignItems: 'end',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div
                style={{
                  alignSelf: 'flex-start',
                  background: 'var(--ink)',
                  color: 'var(--yellow)',
                  fontWeight: 800,
                  fontSize: 11,
                  lineHeight: 1.5,
                  letterSpacing: '1.6px',
                  padding: '6px 10px',
                }}
              >
                {t('EVERY BUSINESS. THREE CITIES. ONE LISTING.')}
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--display)',
                  fontSize: 'clamp(28px,6.4vw,48px)',
                  lineHeight: 0.94,
                  letterSpacing: '0.5px',
                  textWrap: 'balance',
                }}
              >
                {t('EAT, HIRE & CELEBRATE')}
                <br />
                {t('WITH THE LOCALS.')}
              </h1>
              <p
                style={{
                  margin: 0,
                  maxWidth: '52ch',
                  fontSize: 15,
                  lineHeight: 1.45,
                  fontWeight: 600,
                  textWrap: 'pretty',
                }}
              >
                {t(
                  'Bars, restaurants, contractors, home cleaning and banquet halls — vouched for by the neighborhoods that use them. Pick a city up top to meet its crew.',
                )}
              </p>
            </div>
            <div
              style={{
                background: heroFrameBg,
                border: '4px solid var(--ink)',
                boxShadow: '5px 5px 0 var(--ink)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                height: 'auto',
                aspectRatio: '4 / 3',
                width: '100%',
                overflow: 'hidden',
              }}
            >
              {heroCastImg?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroCastImg.url}
                  alt={heroCastImg.alt ?? ''}
                  style={{
                    alignSelf: 'flex-end',
                    height: '75%',
                    width: '100%',
                    objectFit: 'contain',
                    objectPosition: 'bottom',
                    filter: 'drop-shadow(3px 3px 0 rgba(12,15,20,0.35))',
                  }}
                />
              ) : null}
            </div>
          </div>

          {/* --- Spotlight --- */}
          {settings.showSpotlight !== false && spots.length ? (
            <div
              style={{
                background: 'var(--ink)',
                border: '4px solid var(--ink)',
                boxShadow: '9px 9px 0 var(--ink)',
                padding: 'clamp(16px,3.5vw,24px)',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    background: 'var(--yellow)',
                    border: '3px solid var(--cream)',
                    fontFamily: 'var(--display)',
                    fontSize: 'clamp(24px,6vw,34px)',
                    padding: '7px 12px 4px',
                    lineHeight: 1,
                  }}
                >
                  {t('SPOTLIGHT')}
                </div>
                <div
                  style={{
                    color: 'var(--cyan)',
                    fontWeight: 800,
                    fontSize: 13,
                    letterSpacing: '1.4px',
                  }}
                >
                  {t('WHERE THE CREWS ARE GOING OUT THIS WEEK')}
                </div>
                <div
                  style={{
                    marginLeft: 'auto',
                    color: 'var(--cream)',
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: '1.6px',
                  }}
                >
                  {city ? t('{city} ONLY').replace('{city}', city.name ?? '') : t('ALL THREE CITIES')}
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    spots.length === 1
                      ? 'minmax(0, 1fr)'
                      : 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
                  gap: 'clamp(14px,2.5vw,20px)',
                }}
              >
                {spots.map((spot) => (
                  <SpotlightCard
                    key={spot.id}
                    lang={lang}
                    spot={spot}
                    solo={spots.length === 1}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* --- Newsletter --- */}
          <div
            data-stack
            style={{
              background: 'var(--grad-cyan)',
              border: '4px solid var(--ink)',
              boxShadow: '9px 9px 0 var(--ink)',
              padding: 'clamp(16px,3.5vw,24px)',
              marginBottom: 20,
              display: 'grid',
              gridTemplateColumns: '1fr 0.9fr',
              gap: 'clamp(14px,3vw,26px)',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div
                style={{
                  alignSelf: 'flex-start',
                  background: 'var(--ink)',
                  color: 'var(--yellow)',
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
                  fontSize: 'clamp(24px,6vw,34px)',
                  lineHeight: 1.02,
                  textWrap: 'balance',
                }}
              >
                {t('DEALS IN YOUR INBOX EVERY FRIDAY')}
              </div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 15, lineHeight: 1.5 }}>
                {t(
                  'One email a week: the spotlight deals, the new listings and where the crews are eating. No spam, ever.',
                )}
              </p>
            </div>
            <NewsletterForm
              lang={lang}
              onLight
              t={{
                ph: t('you@email.com'),
                btn: t('SIGN ME UP'),
                fine: t('FRIDAYS ONLY · ENGLISH OR SPANISH · UNSUBSCRIBE ANYTIME'),
                thanks: t("YOU'RE IN — SEE YOU FRIDAY."),
              }}
            />
          </div>
        </div>

        {/* --- Filters + grid --- */}
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              background: 'var(--grad-cream)',
              border: '4px solid var(--ink)',
              boxShadow: '6px 6px 0 var(--ink)',
              padding: '12px 14px',
            }}
          >
            <div style={{ fontFamily: 'var(--display)', fontSize: 16, marginRight: 6 }}>
              {t('FILTER:')}
            </div>
            {chips.map((c) => {
              const on = (c.slug || '') === cat
              return (
                <Link
                  key={c.slug || 'all'}
                  href={withQuery(routes.home(lang), {
                    city: cityKey,
                    cat: c.slug || undefined,
                    q,
                  })}
                  className={s.chipLift}
                  style={{
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: 13,
                    letterSpacing: '0.6px',
                    padding: '9px 13px',
                    border: '3px solid var(--ink)',
                    borderRadius: 999,
                    background: on
                      ? 'var(--grad-pink)'
                      : 'linear-gradient(160deg,#FFFFFF 0%,#FFF7EA 100%)',
                    color: on ? 'var(--cream)' : 'var(--ink)',
                  }}
                >
                  {c.label}
                </Link>
              )
            })}

            <SearchForm
              lang={lang}
              action={routes.home(lang)}
              hidden={{ city: cityKey, cat }}
              q={q}
              t={{
                placeholder: t('Search a business, dish or trade…'),
                search: lang === 'es' ? 'BUSCAR' : 'SEARCH',
                reset: t('RESET'),
              }}
              resetHref={routes.home(lang)}
              count={`${list.length} ${list.length === 1 ? t('LISTING') : t('LISTINGS')}`}
            />
          </div>

          {list.length ? (
            <div
              style={{
                marginTop: 'clamp(14px,2.5vw,20px)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,265px),1fr))',
                gap: 'clamp(14px,2.5vw,20px)',
              }}
            >
              {list.map((b) => (
                <BusinessCard
                  key={b.id}
                  lang={lang}
                  listing={b}
                  memberBadges={settings.memberBadges !== false}
                  showRatings={settings.showRatings !== false}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                marginTop: 'clamp(14px,2.5vw,20px)',
                background: 'var(--grad-cream)',
                border: '4px solid var(--ink)',
                boxShadow: '7px 7px 0 var(--ink)',
                padding: 30,
                textAlign: 'center',
                fontFamily: 'var(--display)',
                fontSize: 24,
              }}
            >
              {t('NOTHING HERE YET — TRY ANOTHER FILTER.')}
            </div>
          )}

          {/* --- Join band --- */}
          <div
            data-stack
            style={{
              marginTop: 'clamp(18px,3vw,26px)',
              background: 'var(--ink)',
              border: '4px solid var(--ink)',
              boxShadow: '9px 9px 0 var(--cream)',
              padding: 'clamp(16px,3.5vw,24px)',
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
                  color: 'var(--yellow)',
                  lineHeight: 1,
                }}
              >
                {t('OWN A SPOT IN ONE OF THE THREE?')}
              </div>
              <p
                style={{
                  margin: 0,
                  color: 'var(--cream)',
                  fontWeight: 600,
                  fontSize: 15,
                  maxWidth: '60ch',
                  lineHeight: 1.5,
                }}
              >
                {t('Get your listing, your story page and a shot at the weekly spotlight.')}
              </p>
            </div>
            <Link
              href={routes.listYourSpot(lang)}
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 auto',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                justifySelf: 'start',
                fontFamily: 'var(--display)',
                fontSize: 'clamp(17px,4.5vw,20px)',
                padding: '15px 22px 12px',
                border: '4px solid var(--ink)',
                background: 'var(--grad-pink)',
                color: 'var(--cream)',
                boxShadow: '5px 5px 0 var(--yellow)',
              }}
            >
              <span>{t('LIST YOUR SPOT')}</span>
            </Link>
          </div>
        </div>
      </main>
    </PageShell>
  )
}

function SpotlightCard({
  lang,
  spot,
  solo,
  t,
}: {
  lang: Lang
  spot: any
  solo: boolean
  t: (s: string) => string
}) {
  const listing = rel<Listing>(spot.listing)
  const city = rel<City>(spot.city)
  const href = listing && city ? routes.business(lang, city.slug, listing.slug) : '#'

  return (
    <div
      style={{
        background: 'var(--grad-cream)',
        // A cream inner border with an ink ring outside it, rather than the
        // offset shadow every other card uses.
        border: '4px solid var(--cream)',
        boxShadow: '0 0 0 4px var(--ink)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr)',
        gridTemplateRows: solo ? 'clamp(220px,32vw,380px) auto' : 'clamp(165px,20vw,230px) auto',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          minWidth: 0,
          overflow: 'hidden',
          borderBottom: '4px solid var(--ink)',
        }}
      >
        <MediaSlot
          media={spot.image}
          placeholder={
            listing?.imageHint
              ? `${t('Drop the spotlight photo — ')}${listing.imageHint.toLowerCase()}`
              : null
          }
        />
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            right: 10,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 7,
            alignItems: 'flex-start',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'var(--grad-pink)',
              color: 'var(--cream)',
              border: '3px solid var(--ink)',
              fontFamily: 'var(--display)',
              fontSize: 13,
              padding: '5px 9px 3px',
              whiteSpace: 'nowrap',
            }}
          >
            {city?.name}
          </div>
          <div
            style={{
              background: 'var(--yellow)',
              border: '3px solid var(--ink)',
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: '1.4px',
              padding: '6px 8px',
              whiteSpace: 'nowrap',
              flex: '0 0 auto',
            }}
          >
            {t('THIS WEEK')}
          </div>
        </div>
      </div>

      {/* The min-heights keep the three cards' rows aligned when they sit
          side by side — they are load-bearing, not padding. */}
      <div
        style={{
          padding: '15px 16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--display)',
            fontSize: 'clamp(20px,2.1vw,24px)',
            lineHeight: 1.02,
            minHeight: 50,
            overflowWrap: 'anywhere',
          }}
        >
          {listing?.name}
        </div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '1.6px',
            color: 'var(--magenta)',
            minHeight: 16,
            overflowWrap: 'anywhere',
          }}
        >
          {spot.kind}
        </div>
        <div
          style={{
            background: 'var(--yellow)',
            border: '3px solid var(--ink)',
            padding: '9px 11px',
            fontWeight: 800,
            fontSize: 'clamp(14px,1.4vw,15px)',
            lineHeight: 1.25,
            minHeight: 62,
            display: 'flex',
            alignItems: 'center',
            overflowWrap: 'anywhere',
          }}
        >
          {spot.deal}
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.5,
            fontWeight: 600,
            textWrap: 'pretty',
            minHeight: 63,
            overflowWrap: 'anywhere',
          }}
        >
          {spot.blurb}
        </p>
        <Link
          href={href}
          className={s.chipSpot}
          style={{
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            marginTop: 'auto',
            fontFamily: 'var(--display)',
            fontSize: 16,
            padding: '11px 14px 9px',
            border: '4px solid var(--ink)',
            background: 'var(--grad-cyan)',
            color: 'var(--ink)',
            boxShadow: '4px 4px 0 var(--ink)',
          }}
        >
          {t('SEE THE SPOT →')}
        </Link>
      </div>
    </div>
  )
}
