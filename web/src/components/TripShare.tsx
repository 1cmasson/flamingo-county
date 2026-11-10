'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { routes } from '../lib/routes'
import { meters } from '../lib/transitMath'
import {
  pickByBuses,
  tripBuses,
  tripLinkPath,
  tripLinkQuery,
  type TripEnd,
  type TripLink,
} from '../lib/tripLink'
import type { Plan, Trip } from '../lib/tripPlan'
import { TripSteps, tripKey, tripMapSlug, tripName } from './TripPlanner'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * A trip as a link: the share button under a planned trip, and the page such
 * a link opens (/[lang]/bus/trip, app/(frontend)/[lang]/bus/trip/page.tsx).
 */

/** Where a shared trip starts: a start the visitor typed, or else the stop they'd board at. */
export function shareStart(trip: Trip, typed: TripEnd | null): TripEnd {
  return typed ?? { name: trip.legs[0].board.name, at: trip.legs[0].board.at }
}

/** The phone's share sheet where there is one; elsewhere the link is copied. */
export function ShareTrip({ lang, link }: { lang: Lang; link: TripLink }) {
  const c = busCopy(lang)
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = `${window.location.origin}${tripLinkPath(lang, link)}`
    const title = c.shareText(link.to.name)
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch (e) {
        // Closing the share sheet isn't a failure to fall back from.
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {}
  }
  return (
    <button type="button" className={`${s.action} ${s.actionAlt}`} onClick={share}>
      {copied ? c.shareCopied : c.shareTrip}
    </button>
  )
}

/** The trip a link holds, planned again on opening: its options, its steps, and what to do next. */
export function SharedTrip({ lang, link, plan }: { lang: Lang; link: TripLink; plan: Plan }) {
  const c = busCopy(lang)
  const [pick, setPick] = useState(() => pickByBuses(plan.trips, link.buses))
  const trip = plan.trips[pick] ?? null
  if (!trip)
    return (
      <>
        <p className={s.note}>
          {plan.walkOnly !== null && plan.walkOnly <= 25
            ? c.tripJustWalk(plan.walkOnly)
            : c.tripNoBus}
        </p>
      </>
    )
  const chosen: TripLink = { ...link, buses: tripBuses(trip) }
  return (
    <>
      {plan.trips.length > 1 ? (
        <div className={b.tripOptions} role="group">
          {plan.trips.map((t, k) => (
            <button
              key={tripKey(t)}
              type="button"
              className={b.tripOption}
              aria-pressed={k === pick}
              onClick={() => setPick(k)}
            >
              {c.tripOption(tripName(c, t), t.total)}
            </button>
          ))}
        </div>
      ) : null}
      <TripSteps
        lang={lang}
        trip={trip}
        destName={link.to.name}
        startsAtStop={meters(link.from.at, trip.legs[0].board.at) < 40}
      />
      <div className={b.sheetActions}>
        {tripMapSlug(trip) ? (
          <Link
            className={s.action}
            href={`${routes.busMap(lang, tripMapSlug(trip)!)}?${tripLinkQuery(chosen)}`}
          >
            {c.finderSeeMap}
          </Link>
        ) : null}
        <ShareTrip lang={lang} link={chosen} />
      </div>
    </>
  )
}
