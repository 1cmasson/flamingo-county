import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes, withQuery } from '../../../../lib/routes'
import { getCities, getCity, getListings, rel } from '../../../../lib/data'
import type { Category, Media } from '../../../../payload-types'
import { PageShell } from '../../../../components/PageShell'
import { MediaSlot } from '../../../../components/MediaSlot'
import s from '../../../../components/chrome.module.css'

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
}: {
  params: Promise<{ lang: string; city: string }>
}) {
  const { lang, city: slug } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)

  // Only three cities exist, so anything else is a 404 rather than an empty
  // city page — this route sits at /[lang]/[city] and would otherwise match
  // every unrecognised path.
  const city = await getCity(lang, slug)
  if (!city) notFound()

  const list = await getListings(lang, { city: slug })
  const picks = list.slice(0, 3)

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
                href={withQuery(routes.home(lang), { city: slug })}
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
                  {t('BROWSE')}&#160;{list.length}&#160;{t('LISTINGS')}
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
            {t('TOP OF THE CITY')}
          </h2>
          <div style={{ flex: 1, height: 5, background: 'var(--ink)' }} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,265px),1fr))',
            gap: 'clamp(14px,2.5vw,20px)',
          }}
        >
          {picks.map((b) => {
            const cat = rel<Category>(b.category)
            return (
              <Link
                key={b.id}
                href={routes.business(lang, slug, b.slug)}
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
                    height: 150,
                    borderBottom: '4px solid var(--ink)',
                  }}
                >
                  <MediaSlot
                    media={Array.isArray(b.gallery) ? b.gallery[0] : null}
                    placeholder={b.imageHint ? `${t('Drop: ')}${b.imageHint}` : null}
                  />
                </div>
                <div
                  style={{
                    padding: '14px 15px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ fontFamily: 'var(--display)', fontSize: 20, lineHeight: 1.03 }}>
                    {b.name}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 11,
                      letterSpacing: '1.5px',
                      color: 'var(--magenta)',
                    }}
                  >
                    {cat?.label}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
                    {b.tag}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </main>
    </PageShell>
  )
}
