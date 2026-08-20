import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { getCategories, getCities, getListYourSpotPage, getSiteSettings } from '../../../../lib/data'
import { PageShell } from '../../../../components/PageShell'
import { ListingRequestForm } from '../../../../components/ListingRequestForm'

/** Perk icons ship as static SVGs; the CMS stores which one, by name. */
const ICON = (name?: string | null) => `/assets/icons/${name ?? 'map-pin'}.svg`

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const t = translator(lang)
  return {
    title: t('GET FOUND BY YOUR OWN NEIGHBORHOOD.'),
    description: t(
      'Your listing on your own city page, a full story page, your service list, and rotation into the Friday spotlight.',
    ),
    alternates: {
      canonical: routes.listYourSpot(lang),
      languages: { en: routes.listYourSpot('en'), es: routes.listYourSpot('es') },
    },
  }
}

export default async function ListYourSpotPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)

  const [page, settings, cities, categories] = await Promise.all([
    getListYourSpotPage(lang),
    getSiteSettings(lang),
    getCities(lang),
    getCategories(lang),
  ])

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(18px,3vw,24px)',
        }}
      >
        <header
          data-stack
          style={{
            background: 'var(--grad-cyan)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--ink)',
            padding: 'clamp(16px,3.5vw,26px)',
            display: 'grid',
            gap: 18,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              {t('MEMBERSHIP')}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontSize: 'clamp(30px,7.5vw,54px)',
                lineHeight: 0.92,
              }}
            >
              {t('GET FOUND BY YOUR OWN NEIGHBORHOOD.')}
            </h1>
            <p
              style={{
                margin: 0,
                fontWeight: 600,
                fontSize: 16,
                lineHeight: 1.5,
                maxWidth: '52ch',
                textWrap: 'pretty',
              }}
            >
              {t(
                'Your listing on your own city page, a full story page, your service list, and rotation into the Friday spotlight.',
              )}
            </p>
          </div>
        </header>

        {/* --- Perks --- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,205px),1fr))',
            gap: 'clamp(12px,2vw,16px)',
          }}
        >
          {(page.perks ?? []).map((p, i) => (
            <div
              key={p.id ?? i}
              style={{
                background: 'var(--grad-cream)',
                border: '4px solid var(--ink)',
                boxShadow: '6px 6px 0 var(--ink)',
                padding: 18,
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  marginBottom: 12,
                  border: '3px solid var(--ink)',
                  background: 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ICON(p.icon)}
                  alt=""
                  style={{ width: 24, height: 24, display: 'block' }}
                />
              </div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 19, lineHeight: 1.05 }}>
                {p.t}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
                {p.d}
              </p>
            </div>
          ))}
        </div>

        {/* --- AI receptionist beta --- */}
        <section
          data-stack
          style={{
            background: 'var(--ink)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--yellow)',
            padding: 'clamp(16px,3.5vw,24px)',
            display: 'grid',
            gridTemplateColumns: '1fr 0.85fr',
            gap: 'clamp(14px,3vw,22px)',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                alignSelf: 'flex-start',
                background: 'var(--cyan)',
                color: 'var(--ink)',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '2px',
                padding: '6px 10px',
              }}
            >
              {t('BETA · AI RECEPTIONIST')}
            </div>
            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: 'clamp(24px,5.6vw,34px)',
                lineHeight: 1,
                color: 'var(--yellow)',
                textWrap: 'balance',
              }}
            >
              {t("WE'RE LOOKING FOR BETA TESTERS.")}
            </div>
          </div>
          <p
            style={{
              margin: 0,
              paddingRight: 'clamp(84px,13vw,132px)',
              color: 'var(--cream)',
              fontWeight: 600,
              fontSize: 15,
              lineHeight: 1.5,
              textWrap: 'pretty',
            }}
          >
            {t(
              'Our AI receptionist answers your phone in English or Spanish, takes reservations and texts you the details. Tell us in the form below if you want in.',
            )}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/robot-receptionist-bust-mirrored.png"
            alt=""
            style={{
              position: 'absolute',
              right: 'clamp(8px,2vw,16px)',
              bottom: 0,
              width: 'clamp(84px,13vw,132px)',
              height: 'auto',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
        </section>

        {/* --- The form --- */}
        <section
          style={{
            background: 'var(--grad-cream)',
            border: '4px solid var(--ink)',
            boxShadow: '8px 8px 0 var(--ink)',
            padding: 'clamp(16px,3.5vw,24px)',
          }}
        >
          <h2
            style={{
              display: 'inline-block',
              margin: '0 0 16px',
              background: 'var(--ink)',
              color: 'var(--yellow)',
              fontFamily: 'var(--display)',
              fontSize: 22,
              fontWeight: 400,
              padding: '7px 12px 4px',
            }}
          >
            {t('CLAIM YOUR LISTING')}
          </h2>
          <ListingRequestForm
            lang={lang}
            // City names are not localized on the record — they are proper
            // nouns — but the dictionary does carry them, and the source ran
            // this select's labels through it. The value stays the slug either way.
            cities={cities.map((c) => ({ slug: c.slug, label: t(c.name ?? c.slug) }))}
            categories={categories.map((c) => ({ slug: c.slug, label: c.label ?? c.slug }))}
            t={{
              biz: t('BUSINESS NAME'),
              owner: t('OWNER'),
              city: t('CITY'),
              category: t('CATEGORY'),
              phone: t('PHONE OR EMAIL'),
              story: t('TELL US THE STORY (WE WRITE THE PAGE FOR YOU)'),
              phName: t('Your name'),
              phStory: t('Opened in 1994 by my abuela…'),
              submit: t('CLAIM YOUR LISTING'),
              error:
                lang === 'es'
                  ? 'FALTA EL NOMBRE DEL NEGOCIO O EL TELÉFONO'
                  : 'BUSINESS NAME AND PHONE ARE REQUIRED',
              sentH: lang === 'es' ? '¡RECIBIDO! TE ESCRIBIMOS.' : 'GOT IT — WE’LL BE IN TOUCH.',
              sentP:
                lang === 'es'
                  ? 'Te llamamos o te escribimos en un par de días para hacerte las fotos y la entrevista.'
                  : 'We’ll call or write within a couple of days to set up the photos and the interview.',
            }}
          />
        </section>
      </main>
    </PageShell>
  )
}
