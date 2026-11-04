import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { openGraph } from '../../../../../lib/site'
import { busCopy } from '../../../../../lib/busCopy'
import { countyNetwork } from '../../../../../lib/busNetwork'
import { readTripLink, tripLinkPath } from '../../../../../lib/tripLink'
import { planTrips } from '../../../../../lib/tripPlan'
import { PageShell } from '../../../../../components/PageShell'
import { SharedTrip } from '../../../../../components/TripShare'
import s from '../../../../../components/vote.module.css'
import b from '../../../../../components/bus.module.css'

/**
 * A shared bus trip: `/es/bus/trip?de=…&dc=…&a=…&ac=…` (lib/tripLink.ts).
 * The link holds the two ends; the trip is planned here, on the server, so
 * the steps are in the page itself (for a link preview, a reader without
 * JavaScript, an assistant reading it), and the next bus fills in live.
 *
 * Not indexed: there's one of these for any two places, and each says no
 * more than the planner does. The routes hub is the page to find.
 */

type Props = {
  params: Promise<{ lang: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = busCopy(lang)
  const link = readTripLink(await searchParams)
  const title = link ? c.linkMetaTitle(link.from.name, link.to.name) : c.hubMetaTitle
  const description = link
    ? c.linkMetaDescription(link.from.name, link.to.name)
    : c.hubMetaDescription
  return {
    title,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: routes.bus(lang) },
    openGraph: openGraph(lang, {
      title,
      description,
      url: link ? tripLinkPath(lang, link) : routes.bus(lang),
    }),
  }
}

export default async function SharedTripPage({ params, searchParams }: Props) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const c = busCopy(lang)
  const link = readTripLink(await searchParams)
  const plan = link ? planTrips(countyNetwork(), link.from.at, link.to.at) : null

  return (
    <PageShell>
      <main className={s.main}>
        <section className={b.finder} aria-labelledby="shared-trip">
          {link && plan ? (
            <>
              <p className={b.sheetKicker}>{c.linkKicker}</p>
              <h1 id="shared-trip" className={b.finderTitle}>
                {c.linkTitle(link.to.name)}
              </h1>
              <p className={b.finderFromLine}>
                <span>◎ {c.linkFrom(link.from.name)}</span>
              </p>
              <SharedTrip lang={lang} link={link} plan={plan} />
            </>
          ) : (
            <>
              <h1 id="shared-trip" className={b.finderTitle}>
                {c.finderTitle}
              </h1>
              <p className={s.note}>{c.linkBad}</p>
            </>
          )}
        </section>
        <section className={s.card}>
          <h2 className={s.cardTag}>{c.linkOwnTitle}</h2>
          <Link href={routes.bus(lang)} style={{ fontWeight: 800, color: 'var(--ink)' }}>
            {c.linkPlanOwn}
          </Link>
        </section>
      </main>
    </PageShell>
  )
}
