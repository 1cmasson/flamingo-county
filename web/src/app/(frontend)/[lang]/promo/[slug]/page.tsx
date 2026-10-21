import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '../../../../../payload.config'
import { isLang, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { getPromotion, rel } from '../../../../../lib/data'
import { dateOnly, todayISO } from '../../../../../lib/dates'
import { mediaUrl } from '../../../../../lib/jsonld'
import { claimMode, couponWhatsApp, issuedCount, partnerFor, promoState } from '../../../../../lib/promos'
import { askRef } from '../../../../../lib/promoWhatsapp'
import { classifySource, isStaff, normalizeHost } from '../../../../../lib/visits'
import { dayLabel, promoCopy } from '../../../../../lib/promoCopy'
import { absUrl, openGraph, twitterCard } from '../../../../../lib/site'
import type { City, Listing, Media } from '../../../../../payload-types'
import { PageShell } from '../../../../../components/PageShell'
import { PromoClaim } from '../../../../../components/PromoClaim'
import s from '../../../../../components/promo.module.css'

/**
 * A partner's promotion: the offer, and "Get my coupon" (lib/promos.ts). The
 * link that goes in posts, the link in bio and on a printed QR
 * (`/go/qr?to=/es/promo/<slug>` keeps where the visitor came from).
 *
 * For a WhatsApp promotion the button is a wa.me link with the request
 * already written, ending in a ref (lib/promoWhatsapp.ts) that says where the
 * visitor came from, worked out here because WhatsApp won't tell us.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLang(lang)) return {}
  const promo = await getPromotion(lang, slug)
  if (!promo) return {}
  const listing = rel<Listing>(promo.listing)
  const c = promoCopy(lang)
  const title = listing ? `${promo.title} · ${listing.name}` : promo.title
  const image = mediaUrl(rel<Media>(promo.image) ?? (Array.isArray(listing?.gallery) ? listing.gallery[0] : null))
  return {
    title,
    description: promo.details ?? c.free,
    alternates: {
      canonical: routes.promo(lang, slug),
      languages: { en: routes.promo('en', slug), es: routes.promo('es', slug) },
    },
    openGraph: openGraph(lang, { title, description: promo.details ?? c.free, url: absUrl(routes.promo(lang, slug)), image }),
    twitter: twitterCard(image),
  }
}

export default async function PromoPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { lang, slug } = await params
  if (!isLang(lang)) notFound()
  const promo = await getPromotion(lang as Lang, slug)
  if (!promo) notFound()
  const c = promoCopy(lang as Lang)
  const listing = rel<Listing>(promo.listing)
  const city = rel<City>(listing?.city)
  const photo = rel<Media>(promo.image) ?? rel<Media>(Array.isArray(listing?.gallery) ? listing.gallery[0] : null)
  const name = listing?.name ?? ''

  const payload = await getPayload({ config })
  const today = todayISO()
  const [issued, partner] = await Promise.all([issuedCount(payload, promo.id), partnerFor(payload, listing?.id ?? null)])
  // Until the business has its staff PIN, nobody could use a coupon: show it, but hand none out.
  const state = partner ? promoState(promo, issued, today) : 'soon'
  const start = dateOnly(promo.startsOn)
  const end = dateOnly(promo.endsOn)
  const businessHref = listing && city ? routes.business(lang as Lang, city.slug, listing.slug) : null

  let whatsapp: string | null = null
  if (claimMode(promo) === 'whatsapp') {
    const h = await headers()
    const utm = (await searchParams).utm_source
    const ref = normalizeHost(h.get('referer') ? safeHost(h.get('referer')!) : null)
    const own = normalizeHost(h.get('x-forwarded-host') ?? h.get('host'))
    const source = isStaff(h) ? 'test' : classifySource(ref && ref !== own ? ref : null, typeof utm === 'string' ? utm : null)
    const text = c.waAsk(promo.title ?? '', name, askRef(slug, source, lang as Lang))
    whatsapp = `https://wa.me/${couponWhatsApp()}?text=${encodeURIComponent(text)}`
  }

  return (
    <PageShell>
      <main className={s.page}>
        <article className={s.card}>
          {photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={s.photo} src={photo.url} alt={photo.alt ?? ''} />
          ) : null}
          <div className={s.body}>
            <p className={s.kicker}>{c.kicker}</p>
            <h1 className={s.title}>{promo.title}</h1>
            {name ? <p className={s.at}>{businessHref ? <a href={businessHref}>{c.at(name)}</a> : c.at(name)}</p> : null}
            {promo.details ? <p className={s.details}>{promo.details}</p> : null}
            {end ? <p className={s.meta}>{c.through(dayLabel(end, lang as Lang))}</p> : null}

            {state === 'active' && whatsapp ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <a className={`${s.btn} ${s.wa}`} href={whatsapp} rel="noopener noreferrer">
                  💬 {c.getWa}
                </a>
                <p className={s.note}>{c.freeWa}</p>
              </div>
            ) : state === 'active' ? (
              <PromoClaim slug={slug} lang={lang as Lang} />
            ) : (
              <p className={s.warn}>
                {state === 'upcoming'
                  ? c.upcoming(dayLabel(start, lang as Lang))
                  : state === 'full'
                    ? c.full
                    : state === 'soon'
                      ? c.soon
                      : c.ended}
              </p>
            )}
          </div>
        </article>

        <section className={`${s.card} ${s.body}`}>
          <h2 className={s.h2}>{c.stepsTitle}</h2>
          <ol className={s.steps}>
            {(whatsapp ? c.stepsWa(name) : c.steps(name)).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        {businessHref ? (
          <a className={`${s.btn} ${s.quiet}`} href={businessHref}>
            {c.seeBusiness(name)} →
          </a>
        ) : null}
      </main>
    </PageShell>
  )
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
