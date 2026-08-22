import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import {
  applySearch,
  getCities,
  getCity,
  getListings,
  getSiteSettings,
  rel,
} from '../../../../lib/data'
import { castBg } from '../../../../lib/castBg'
import type { City, Media } from '../../../../payload-types'
import { PageShell } from '../../../../components/PageShell'
import { BusinessCard } from '../../../../components/BusinessCard'
import { SearchForm } from '../../../../components/SearchForm'

/**
 * Rendered per request, always.
 *
 * `generateStaticParams` below is kept because it is the way back to static
 * rendering if that is ever wanted (see CMS.md). It cannot be relied on today:
 * in a production build whose database is empty at build time it returns
 * nothing and Next falls back to generating on demand. This page also reads
 * `searchParams` for its search box, which is dynamic in its own right.
 */
export const dynamic = 'force-dynamic'


/** #RRGGBB -> rgba(r,g,b,a), as the source did inline. */
function rgba(hex: string | null | undefined, a: number) {
  if (!hex) return `rgba(0,0,0,${a})`
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export async function generateStaticParams() {
  const cities = await getCities('en')
  return cities.flatMap((c) => [
    { lang: 'en', city: c.slug },
    { lang: 'es', city: c.slug },
  ])
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string }>
}): Promise<Metadata> {
  const { lang, city } = await params
  if (!isLang(lang)) return {}
  const doc = await getCity(lang, city)
  if (!doc) return {}
  return {
    title: doc.name,
    description: doc.blurb ?? undefined,
    alternates: {
      canonical: routes.city(lang, city),
      languages: { en: routes.city('en', city), es: routes.city('es', city) },
    },
  }
}

export default async function CityPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; city: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { lang, city: slug } = await params
  if (!isLang(lang)) notFound()
  const q = (await searchParams).q ?? ''
  const t = translator(lang as Lang)

  // A city page only exists for a city we have, so anything else is a 404
  // rather than an empty page — this route sits at /[lang]/[city] and would
  // otherwise match every unrecognised path.
  const city = await getCity(lang, slug)
  if (!city) notFound()

  // The city page is the browse surface now: every listing in the city, not a
  // curated three. The fetch is unfiltered and `?q=` is applied in memory, so
  // `total` — the unsearched count that lets the hero button and the empty
  // state tell "no listings yet" apart from "no search results" — is just the
  // length of what we already have, rather than the second query this used to
  // fire alongside the first.
  const [settings, all] = await Promise.all([
    getSiteSettings(lang),
    getListings(lang, { city: slug }),
  ])
  const { list, suggestions } = applySearch(all, lang, q)
  const total = all.length
  const soon = total === 0

  const photo = rel<Media>(city.photo)
  const pos = city.photoPos || 'center'
  const heroBg = photo?.url
    ? `linear-gradient(${rgba(city.accent, 0.86)}, ${rgba(city.accent, 0.86)}), url("${photo.url}") ${pos}/cover no-repeat`
    : (city.accent ?? 'var(--pink)')
  const castFrameBg = photo?.url
    ? `linear-gradient(rgba(22,224,242,0.18), rgba(22,224,242,0.18)), url("${photo.url}") ${pos}/cover no-repeat`
    : (city.castBg ?? 'var(--cyan)')

  const cast = city.cast ?? []
  const isGroup = Boolean(cast[0]?.group)
  // Yellow-accented cities would put a yellow button on a yellow wash, so they
  // flip to pink. Same rule as the source.
  const cityBtn = city.accent === '#FFD400' ? 'var(--grad-pink)' : 'var(--yellow)'

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(18px,3vw,24px)',
        }}
      >
        <div
          data-stack
          style={{
            background: heroBg,
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--ink)',
            padding: 'clamp(16px,3.5vw,26px)',
            display: 'grid',
            gridTemplateColumns: '1fr 0.9fr',
            gap: 20,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'inline-flex',
                alignSelf: 'flex-start',
                background: 'var(--ink)',
                color: 'var(--cyan)',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '2px',
                padding: '6px 10px',
              }}
            >
              {t('CITY PAGE')}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontSize: 'clamp(36px,9vw,62px)',
                lineHeight: 0.9,
              }}
            >
              {city.name}
            </h1>
            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: 'clamp(18px,4.6vw,22px)',
                color: 'var(--cream)',
                WebkitTextStroke: '1px var(--ink)',
              }}
            >
              {city.sub}
            </div>
            <p
              style={{
                margin: 0,
                maxWidth: '52ch',
                fontWeight: 600,
                fontSize: 16,
                lineHeight: 1.5,
                textWrap: 'pretty',
              }}
            >
              {city.blurb}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href={soon ? routes.listYourSpot(lang) : '#listings'}
                style={{
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  fontFamily: 'var(--display)',
                  fontSize: 17,
                  padding: '13px 18px 10px',
                  border: '4px solid var(--ink)',
                  color: 'var(--ink)',
                  background: cityBtn,
                  boxShadow: '4px 4px 0 var(--ink)',
                }}
              >
                <span>
                  {soon ? (
                    t('COMING SOON')
                  ) : (
                    <>
                      {t('BROWSE')}&#160;{total}&#160;
                      {total === 1 ? t('LISTING') : t('LISTINGS')}
                    </>
                  )}
                </span>
              </Link>
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
                  fontFamily: 'var(--display)',
                  fontSize: 17,
                  padding: '13px 18px 10px',
                  border: '4px solid var(--ink)',
                  color: 'var(--ink)',
                  background: 'var(--grad-cream)',
                  boxShadow: '4px 4px 0 var(--ink)',
                }}
              >
                {t('LIST YOUR BUSINESS')}
              </Link>
            </div>
          </div>

          <div
            style={{
              background: castFrameBg,
              border: '4px solid var(--ink)',
              height: isGroup ? 'auto' : 340,
              aspectRatio: isGroup ? '4 / 3' : 'auto',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {cast.map((m, i) => {
              const img = rel<Media>(m.image)
              if (!img?.url) return null
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={m.id ?? i}
                  src={img.url}
                  alt={m.name ?? ''}
                  style={{
                    position: 'relative',
                    zIndex: m.z ?? 1,
                    height: 320,
                    width: 'auto',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    objectPosition: 'bottom',
                    margin: '-14px',
                  }}
                />
              )
            })}
          </div>
        </div>

        {soon ? (
          <ComingSoon lang={lang} city={city} t={t} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h2
                style={{
                  margin: 0,
                  background: 'var(--ink)',
                  color: 'var(--yellow)',
                  fontFamily: 'var(--display)',
                  fontSize: 24,
                  fontWeight: 400,
                  padding: '8px 14px 5px',
                }}
              >
                {t('ALL LISTINGS')}
              </h2>
              <div style={{ flex: 1, height: 5, background: 'var(--ink)' }} />
            </div>

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
              <SearchForm
                lang={lang}
                action={routes.city(lang, slug)}
                hidden={{}}
                q={q}
                t={{
                  placeholder: t('Search this city…'),
                  search: lang === 'es' ? 'BUSCAR' : 'SEARCH',
                  reset: t('RESET'),
                  suggestions: t('Suggestions'),
                }}
                resetHref={routes.city(lang, slug)}
                count={`${list.length} ${list.length === 1 ? t('LISTING') : t('LISTINGS')}`}
                suggestions={suggestions}
              />
            </div>

            {list.length ? (
              <div
                id="listings"
                style={{
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
                    showCityBadge={false}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <div
                id="listings"
                style={{
                  background: 'var(--grad-cream)',
                  border: '4px solid var(--ink)',
                  boxShadow: '7px 7px 0 var(--ink)',
                  padding: 30,
                  textAlign: 'center',
                  fontFamily: 'var(--display)',
                  fontSize: 24,
                }}
              >
                {t('NOTHING MATCHED THAT SEARCH.')}
              </div>
            )}
          </>
        )}
      </main>
    </PageShell>
  )
}

/**
 * A city we have not researched yet.
 *
 * Gated on the listing count rather than the slug, so it disappears by itself
 * the moment the first listing for that city is published. Little Havana is
 * the only one today.
 */
function ComingSoon({
  lang,
  city,
  t,
}: {
  lang: Lang
  city: City
  t: (s: string) => string
}) {
  const mascot = rel<Media>(city.solo)
  return (
    <section
      data-stack
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '8px 8px 0 var(--ink)',
        display: 'grid',
        gridTemplateColumns: '0.8fr 1fr',
        alignItems: 'stretch',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: castBg(city),
          borderRight: '4px solid var(--ink)',
          minHeight: 240,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {mascot?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mascot.url}
            alt=""
            style={{
              maxWidth: '100%',
              maxHeight: 300,
              width: 'auto',
              objectFit: 'contain',
              objectPosition: 'bottom',
              display: 'block',
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          padding: 'clamp(18px,4vw,32px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 12,
        }}
      >
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
          {city.name}
        </div>
        <div
          style={{
            fontFamily: 'var(--display)',
            fontSize: 'clamp(34px,8vw,60px)',
            lineHeight: 0.95,
            textWrap: 'balance',
          }}
        >
          {t('COMING SOON')}
        </div>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 16, lineHeight: 1.5, maxWidth: '46ch' }}>
          {t("We're still walking these blocks. Know a spot that belongs here?")}
        </p>
        <Link
          href={routes.listYourSpot(lang)}
          style={{
            textDecoration: 'none',
            alignSelf: 'flex-start',
            cursor: 'pointer',
            fontFamily: 'var(--display)',
            fontSize: 17,
            padding: '13px 18px 10px',
            border: '4px solid var(--ink)',
            color: 'var(--ink)',
            background: 'var(--yellow)',
            boxShadow: '4px 4px 0 var(--ink)',
          }}
        >
          {t('LIST YOUR SPOT')}
        </Link>
      </div>
    </section>
  )
}
