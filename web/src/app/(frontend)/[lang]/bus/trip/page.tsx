import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { openGraph } from '../../../../../lib/site'
import { busCopy } from '../../../../../lib/busCopy'
import { serverNetwork } from '../../../../../lib/busNetwork'
import {
  hubDestQuery,
  readTripAsk,
  readTripLink,
  tripLinkPath,
  type AskedEnd,
  type TripAsk,
} from '../../../../../lib/tripLink'
import { resolvePlace, type Resolved } from '../../../../../lib/placeResolve'
import { perMinute } from '../../../../../lib/perMinute'
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
 * A link written by hand (an assistant answering "how do I get to X by bus")
 * may give only names, `?from=Hialeah+Park&to=Palmetto+General+Hospital`:
 * the places are found here and the page moves on to the full link. With
 * only a destination, it's the routes hub's finder that takes it, and plans
 * from where the visitor is, in their browser.
 *
 * Not indexed: there's one of these for any two places, and each says no
 * more than the planner does. The routes hub is the page to find.
 */

/** Hand-written links that need a search, per address per minute (each can reach Photon). */
const lookups = perMinute(20)

type AskFailed = { from: Resolved | null; to: Resolved | null; busy?: boolean }

/** Finds the places a hand-written link names, and moves on to the full link; or says what failed. */
async function followAsk(lang: Lang, ask: TripAsk): Promise<AskFailed> {
  const known = (e: AskedEnd): Resolved | null =>
    e.at ? { kind: 'found', end: { name: e.name, at: e.at }, sub: '' } : null
  const needsSearch = (ask.from && !ask.from.at) || (ask.to && !ask.to.at)
  if (needsSearch && !lookups(await headers())) return { from: null, to: null, busy: true }

  // The start first (usually the more particular of the two), then the destination
  // nearest it: "Publix" from Hialeah is the Publix in Hialeah.
  const from = ask.from
    ? (known(ask.from) ?? (await resolvePlace(ask.from.name, lang, ask.to?.at ?? undefined)))
    : null
  const near = from?.kind === 'found' ? from.end.at : undefined
  const to = ask.to ? (known(ask.to) ?? (await resolvePlace(ask.to.name, lang, near))) : null

  if (to?.kind === 'found' && from?.kind === 'found')
    redirect(tripLinkPath(lang, { from: from.end, to: to.end, buses: ask.buses }))
  if (to?.kind === 'found' && !ask.from) redirect(`${routes.bus(lang)}?${hubDestQuery(to.end)}`)
  return { from, to }
}

type Props = {
  params: Promise<{ lang: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = busCopy(lang)
  const q = await searchParams
  const link = readTripLink(q)
  const ask = link ? null : readTripAsk(q)
  const title = link
    ? c.linkMetaTitle(link.from.name, link.to.name)
    : ask?.from && ask.to
      ? c.linkMetaTitle(ask.from.name, ask.to.name)
      : c.hubMetaTitle
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
  const q = await searchParams
  const link = readTripLink(q)
  const ask = link ? null : readTripAsk(q)
  const failed = ask ? await followAsk(lang, ask) : null
  const plan = link ? planTrips(serverNetwork(), link.from.at, link.to.at) : null
  const why = (end: AskedEnd | null, r: Resolved | null) =>
    end && r && r.kind !== 'found'
      ? r.kind === 'down'
        ? c.askDown
        : c.askNotFound(end.name)
      : null
  const reasons = failed
    ? failed.busy
      ? [c.askBusy]
      : [
          ...new Set([
            why(ask!.from, failed.from),
            why(ask!.to, failed.to),
            ask!.to ? null : c.askNoTo,
          ]),
        ].filter((x): x is string => !!x)
    : []

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
          ) : reasons.length ? (
            <>
              <h1 id="shared-trip" className={b.finderTitle}>
                {c.askTitle}
              </h1>
              {reasons.map((r) => (
                <p key={r} className={s.note}>
                  {r}
                </p>
              ))}
              <div className={b.sheetActions}>
                <Link className={s.action} href={routes.bus(lang)}>
                  {c.linkPlanOwn}
                </Link>
              </div>
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
        {reasons.length ? null : (
          <section className={s.card}>
            <h2 className={s.cardTag}>{c.linkOwnTitle}</h2>
            <Link href={routes.bus(lang)} style={{ fontWeight: 800, color: 'var(--ink)' }}>
              {c.linkPlanOwn}
            </Link>
          </section>
        )}
      </main>
    </PageShell>
  )
}
