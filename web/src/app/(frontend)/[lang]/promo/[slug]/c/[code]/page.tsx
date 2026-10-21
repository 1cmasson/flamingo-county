import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '../../../../../../../payload.config'
import { isLang, type Lang } from '../../../../../../../i18n'
import { routes } from '../../../../../../../lib/routes'
import { rel } from '../../../../../../../lib/data'
import { dateOnly, todayISO } from '../../../../../../../lib/dates'
import { displayCode, formatRedeemed, getCoupon, justUsed, MAX_PIN_FAILS, promoOpen, WHATSAPP_NUMBER } from '../../../../../../../lib/promos'
import { dayLabel, promoCopy } from '../../../../../../../lib/promoCopy'
import { absUrl } from '../../../../../../../lib/site'
import { detectWebview } from '../../../../../../../lib/webview'
import type { City } from '../../../../../../../payload-types'
import { PageShell } from '../../../../../../../components/PageShell'
import { CouponRedeem } from '../../../../../../../components/CouponRedeem'
import s from '../../../../../../../components/promo.module.css'

/**
 * One visitor's coupon (lib/promos.ts). The code in the URL is the only key,
 * so the page is never indexed, robots.txt closes it, and the visit counter
 * stores it without the code (lib/visits.ts `normalizePath`).
 *
 * What it shows is what is stored: used (green, with the time), expired, or
 * the code with "Save it to WhatsApp" and the staff's PIN form.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return {
    title: isLang(lang) ? promoCopy(lang).yours : undefined,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function CouponPage({ params }: { params: Promise<{ lang: string; slug: string; code: string }> }) {
  const { lang, slug, code: rawCode } = await params
  if (!isLang(lang)) notFound()
  const payload = await getPayload({ config })
  const view = await getCoupon(payload, rawCode, lang as Lang)
  if (!view) notFound()
  const { coupon, promotion, listing } = view
  // One address per coupon: a lowercased or dashed code, or the wrong promotion's slug, goes to the real one.
  if (promotion.slug !== slug || coupon.code !== rawCode) permanentRedirect(routes.coupon(lang as Lang, promotion.slug, coupon.code))

  const c = promoCopy(lang as Lang)
  const name = listing?.name ?? ''
  const city = rel<City>(listing?.city)
  const end = dateOnly(promotion.endsOn)
  const open = promoOpen(promotion, todayISO())
  const used = coupon.redeemedAt
  const locked = !used && (coupon.pinFails ?? 0) >= MAX_PIN_FAILS
  const webview = detectWebview((await headers()).get('user-agent'))
  const couponUrl = absUrl(routes.coupon(lang as Lang, promotion.slug, coupon.code))
  const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(c.waText(name, displayCode(coupon.code), couponUrl))}`

  return (
    <PageShell>
      <main className={s.page}>
        <article className={`${s.card} ${used ? s.usedCard : ''}`}>
          <div className={s.body}>
            <p className={s.kicker}>{c.yours}</p>
            <h1 className={s.title}>{promotion.title}</h1>
            {name ? (
              <p className={s.at}>
                {city && listing ? <a href={routes.business(lang as Lang, city.slug, listing.slug)}>{c.at(name)}</a> : c.at(name)}
              </p>
            ) : null}
            {promotion.details ? <p className={s.details}>{promotion.details}</p> : null}
            {end && !used ? <p className={s.meta}>{c.through(dayLabel(end, lang as Lang))}</p> : null}
          </div>

          <div className={s.ticket}>
            <p className={s.codeLabel}>{name}</p>
            <p className={s.code} aria-label={coupon.code.split('').join(' ')}>
              {displayCode(coupon.code)}
            </p>
            {used ? (
              <>
                {justUsed(used) ? <p className={s.at}>{c.done}</p> : null}
                <p className={s.stamp}>✓ {c.used}</p>
                <p className={s.at}>{c.usedAt(formatRedeemed(used, lang as Lang))}</p>
              </>
            ) : !open ? (
              <p className={s.warn}>{c.expired}</p>
            ) : (
              <p className={s.note}>{c.show(name)}</p>
            )}
          </div>
        </article>

        {!used && open ? (
          <>
            <section className={`${s.card} ${s.body}`}>
              {webview ? <p className={s.warn}>{c.webviewNote}</p> : null}
              <a className={`${s.btn} ${s.wa}`} href={wa} rel="noopener noreferrer">
                💬 {c.saveWa}
              </a>
              <p className={s.note}>{c.saveWaNote}</p>
            </section>
            {locked ? <p className={s.warn}>{c.locked}</p> : <CouponRedeem code={coupon.code} lang={lang as Lang} />}
          </>
        ) : null}
      </main>
    </PageShell>
  )
}
