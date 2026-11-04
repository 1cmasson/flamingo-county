'use client'

import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { stopMapsHref, type RouteTimes } from '../lib/busTime'
import { formatClock } from '../lib/transitMath'
import type { RouteChoice } from './useRouteChoice'
import b from './bus.module.css'
import s from './vote.module.css'

/**
 * "When's the next bus at my stop?" on a county route page: a stop picker per
 * direction, a button that picks the stop nearest the visitor, and the next
 * three buses, live first (useRouteChoice.ts holds the logic, shared with the
 * full map).
 *
 * Shown only in the browser: the page is cached, so a time worked out on the
 * server would be stale by the time anyone read it. The stop lists below it
 * stay server-rendered for crawlers.
 */

/** Past this, the "nearest stop" is a trip of its own, and the picker says how far. */
const NEAR_WALK_MIN = 15

/** The next buses at the chosen stop: the big countdown and the two after it. */
export function NextTimes({ lang, v }: { lang: Lang; v: RouteChoice }) {
  const c = busCopy(lang)
  const { next, anyLive, endOfLine } = v
  const time = (at: number) =>
    at >= 1440 ? `${formatClock(at - 1440, lang)} ${c.tomorrow}` : formatClock(at, lang)
  return (
    <div className={b.next} aria-live="polite">
      {endOfLine ? (
        <p className={s.note}>{c.endOfLine}</p>
      ) : next.length ? (
        <>
          <p className={b.nextFirst}>
            {next[0].live ? <span className={b.liveTag}>{c.liveTag}</span> : null}
            <span className={b.nextTime}>{time(next[0].at)}</span>
            <span className={b.nextWait}>{c.inMin(next[0].wait)}</span>
          </p>
          {next.length > 1 ? (
            <p className={b.nextThen}>
              {c.thenAt}{' '}
              {next
                .slice(1)
                .map(
                  (x) =>
                    `${time(x.at)} (${c.inMin(x.wait)}${anyLive ? `, ${x.live ? c.liveTag.toLowerCase() : c.scheduledTag}` : ''})`,
                )
                .join(' · ')}
            </p>
          ) : null}
        </>
      ) : (
        <p className={s.note}>{c.noMore}</p>
      )}
    </div>
  )
}

export function NextBus({ times, lang, v }: { times: RouteTimes; lang: Lang; v: RouteChoice }) {
  const c = busCopy(lang)

  // On the server and before hydration: the card's frame, so the page doesn't jump when it fills.
  if (!v.ready)
    return (
      <section className={s.card} aria-labelledby="next-bus">
        <h2 id="next-bus" className={s.cardTag}>
          {c.nextTitle}
        </h2>
        <p className={s.note}>{c.nextLead}</p>
        <div className={b.nextShell} />
      </section>
    )
  const { state, d, i, station, walk } = v

  return (
    <section className={s.card} aria-labelledby="next-bus">
      <h2 id="next-bus" className={s.cardTag}>
        {c.nextTitle}
      </h2>
      <p className={s.note}>{c.nextLead}</p>

      <div className={b.dirs} role="group" aria-label={c.direction}>
        {times.directions.map((dir, k) => (
          <button
            key={dir.id}
            type="button"
            className={b.dirBtn}
            aria-pressed={k === state.dir}
            onClick={() => v.setDir(k)}
          >
            {c.toward(dir.toward)}
          </button>
        ))}
      </div>

      <label className={b.pick}>
        <span className={b.pickLabel}>{c.yourStop}</span>
        <select
          className={b.select}
          value={i}
          onChange={(e) => v.pickStop(state.dir, Number(e.target.value))}
        >
          {d.stations.map((st, k) => (
            <option key={`${k}-${st.name}`} value={k}>
              {st.name}
            </option>
          ))}
        </select>
      </label>

      <div className={s.actions}>
        <button type="button" className={s.action} onClick={v.locate} disabled={v.locating}>
          {v.locating ? c.locating : c.useLocation}
        </button>
      </div>
      {v.denied ? <p className={s.notice}>{c.denied}</p> : null}
      {walk !== null ? (
        <p className={s.note}>{walk > NEAR_WALK_MIN ? c.farFromYou(walk) : c.walkToStop(walk)}</p>
      ) : null}

      <NextTimes lang={lang} v={v} />

      <p className={s.note}>{v.anyLive ? c.liveSource : c.scheduled}</p>
      <p className={b.meta}>
        <a href={stopMapsHref(station.at)} target="_blank" rel="noopener noreferrer">
          {c.mapsStop}
        </a>{' '}
        · {c.privacy}
      </p>
    </section>
  )
}
