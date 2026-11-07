import Link from 'next/link'
import type { Lang } from '../i18n'
import { busCopy } from '../lib/busCopy'
import { busLink } from '../lib/busForAi'
import { absUrl } from '../lib/site'
import { routes } from '../lib/routes'
import type { PopularTrip } from '../lib/popularTrips'
import b from './bus.module.css'
import s from './vote.module.css'

/** Links to the popular trips' own pages (/[lang]/bus/trip/[slug]). */
export function PopularTripList({
  lang,
  trips,
  heading,
  id,
}: {
  lang: Lang
  trips: PopularTrip[]
  heading: string
  id: string
}) {
  if (!trips.length) return null
  const c = busCopy(lang)
  return (
    <nav className={s.card} aria-labelledby={id}>
      <h2 id={id} className={s.cardTag}>
        {heading}
      </h2>
      <ul className={b.places}>
        {trips.map((t) => (
          <li key={t.slug}>
            <Link className={b.placeLink} href={routes.busTrip(lang, t.slug)}>
              <span className={b.placeName}>
                {c.popularTitle(t.from.name[lang], t.to.name[lang])}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The link any trip opens from, said where readers (and assistants reading
 * the page for someone) will see it: `/en/bus/trip?from=…&to=…`.
 */
export function AnyTripLink({ lang }: { lang: Lang }) {
  const c = busCopy(lang)
  const example =
    lang === 'es'
      ? busLink('es', 'Hialeah Park', 'Palmetto General Hospital')
      : busLink('en', 'Versailles Restaurant', 'Jackson Memorial Hospital')
  return (
    <section className={s.card} aria-labelledby="any-trip">
      <h2 id="any-trip" className={s.cardTag}>
        {c.anyTripTitle}
      </h2>
      <p className={s.note}>{c.anyTripText}</p>
      <p className={b.anyTripUrl}>
        <code>{`${absUrl(`/${lang}/bus/trip`)}?from=…&to=…`}</code>
      </p>
      <p className={s.note}>
        {c.anyTripExample}:{' '}
        <a href={example} className={b.anyTripExample}>
          {example}
        </a>
      </p>
    </section>
  )
}
