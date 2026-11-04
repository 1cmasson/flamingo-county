'use client'

import Link from 'next/link'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import type { RouteTimes } from '../lib/busTime'
import { BusMap, DIR_COLORS, type BusMapDirection } from './BusMap'
import { NextBus } from './NextBus'
import { MAP_FROM, useRouteChoice } from './useRouteChoice'
import b from './bus.module.css'

/**
 * The live top of a county route page: a picture of the route with its buses
 * right under the title, which opens the full map, and then «Próxima guagua».
 * Both read the same remembered stop (useRouteChoice), so the stop picked on
 * the full map is the one the card shows on the way back.
 */
export function RouteLive({
  slug,
  label,
  number,
  lang,
  times,
  directions,
  live,
  schedule,
  mapHref,
}: {
  slug: string
  label: string
  number: string
  lang: Lang
  times: RouteTimes
  directions: BusMapDirection[]
  live: boolean
  /** The county's schedule is still in force: times may be quoted from it. */
  schedule: boolean
  mapHref: string
}) {
  const c = busCopy(lang)
  const v = useRouteChoice(slug, times, { live, schedule })
  return (
    <>
      <section className={b.previewCard} aria-labelledby="bus-map">
        <h2 id="bus-map" className={b.srOnly}>
          {c.mapTitle}
        </h2>
        <Link
          href={mapHref}
          className={b.previewLink}
          aria-label={`${c.mapOpen}: ${label}`}
          // The map's back button goes back in history (to this scroll spot) when it came from here.
          onClick={() => {
            try {
              sessionStorage.setItem(MAP_FROM, mapHref)
            } catch {}
          }}
        >
          <BusMap
            mode="preview"
            slug={slug}
            label={label}
            number={number}
            lang={lang}
            directions={directions}
            live={live}
          />
          <span className={b.previewOpen} aria-hidden="true">
            {c.mapOpen} ⤢
          </span>
        </Link>
        <ul className={b.legend}>
          {directions.map((d, k) => (
            <li key={d.id}>
              <span
                className={b.legendDot}
                style={{ background: DIR_COLORS[k] }}
                aria-hidden="true"
              />
              {c.toward(d.toward)}
            </li>
          ))}
        </ul>
      </section>
      {/* Past the schedule's end the card would say "no more buses" when it means "we don't know". */}
      {schedule ? <NextBus times={times} lang={lang} v={v} /> : null}
    </>
  )
}
