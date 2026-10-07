import Image from 'next/image'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { getCategories, getCities, getListYourSpotPage } from '../../../../lib/data'
import { isSelfServeCategory } from '../../../../lib/categories'
import { PageShell } from '../../../../components/PageShell'
import { RequestHub } from '../../../../components/RequestHub'
import { isRequestKind } from '../../../../lib/requestKinds'

/**
 * The page used to be one form for one thing — claim a listing. It is now the
 * place to ask for any of four (see `RequestHub`), so the hero speaks to all of
 * them and the listing perks move below the forms, under their own heading.
 */
const TITLE = 'GET ON FLAMINGO COUNTY.'
const LEDE =
  'List your business, put your event on the board, sit down for an interview, tip us off to a story or send a birthday shoutout. Pick one below — we read every request ourselves.'

/** Perk icons ship as static SVGs; the CMS stores which one, by name. */
const ICON = (name?: string | null) => `/assets/icons/${name ?? 'map-pin'}.svg`

/**
 * The robot's width and the gutter reserved for it in the copy beside it. One
 * value, because they were two hand-duplicated clamps that had to stay equal —
 * and the old floor of 84px is what left the card looking half-empty on a
 * phone, where 13vw is only ~54px and the floor is what actually applies.
 */
const ROBOT_W = 'clamp(130px,22vw,190px)'
/**
 * And the room the card gives it. The card's height is driven by two short
 * lines of display type, which on a wide viewport is shorter than the robot —
 * so without this the bust is either tiny or beheaded by the card's top edge.
 */
const ROBOT_ROOM = 'clamp(200px,24vw,250px)'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const t = translator(lang)
  return {
    title: t(TITLE),
    description: t(LEDE),
    alternates: {
      canonical: routes.listYourSpot(lang),
      languages: { en: routes.listYourSpot('en'), es: routes.listYourSpot('es') },
    },
  }
}

export default async function ListYourSpotPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ type?: string | string[] }>
}) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)
  // `?type=event` opens straight on that form; anything else opens on the four choices.
  const { type } = await searchParams
  const initialKind = isRequestKind(type) ? type : null

  const [page, cities, categories] = await Promise.all([
    getListYourSpotPage(lang),
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
              {t('PARTNERSHIP')}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontSize: 'clamp(30px,7.5vw,54px)',
                lineHeight: 0.92,
              }}
            >
              {t(TITLE)}
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
              {t(LEDE)}
            </p>
          </div>
        </header>

        <RequestHub
          lang={lang}
          initialKind={initialKind}
          // City names are not localized on the record — they are proper
          // nouns — but the dictionary does carry them. The value stays the slug.
          cities={cities.map((c) => ({ slug: c.slug, label: t(c.name ?? c.slug) }))}
          categories={categories
            .filter((c) => isSelfServeCategory(c.slug))
            .map((c) => ({ slug: c.slug, label: c.label ?? c.slug }))}
        />

        {/* --- Perks --- */}
        <h2
          style={{
            alignSelf: 'flex-start',
            margin: '12px 0 -4px',
            background: 'var(--ink)',
            color: 'var(--yellow)',
            fontFamily: 'var(--display)',
            fontSize: 'clamp(20px,4.4vw,26px)',
            fontWeight: 400,
            lineHeight: 1,
            padding: '8px 12px 5px',
          }}
        >
          {t('WHAT A LISTING GETS YOU')}
        </h2>
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
            minHeight: ROBOT_ROOM,
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
              paddingRight: ROBOT_W,
              color: 'var(--cream)',
              fontWeight: 600,
              fontSize: 15,
              lineHeight: 1.5,
              textWrap: 'pretty',
            }}
          >
            {t(
              'Our AI receptionist answers your phone in English or Spanish, takes reservations and texts you the details. Add your business above and tell us you want in.',
            )}
          </p>
          <Image
            src="/assets/robot-receptionist-bust-mirrored.png"
            alt=""
            width={911}
            height={1362}
            sizes="190px"
            style={{
              position: 'absolute',
              right: 'clamp(8px,2vw,16px)',
              bottom: 0,
              width: ROBOT_W,
              height: 'auto',
              // Never taller than the card. `object-fit` keeps the aspect
              // ratio when the cap bites, so a short card shrinks the bust
              // rather than clipping its head off at the top border.
              maxHeight: '100%',
              objectFit: 'contain',
              objectPosition: 'bottom right',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
        </section>

      </main>
    </PageShell>
  )
}
