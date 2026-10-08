import type { Lang } from '../i18n'
import { LINKS } from '../lib/civic'
import { routes } from '../lib/routes'
import { longDay } from '../lib/voteCopy'
import type { SurgeCopy } from '../lib/surgeCopy'
import v from './vote.module.css'
import s from './civic.module.css'

/**
 * Pieces shared by the evacuation-zone pages. Everything that tells someone
 * what to do links the county's own page: the zones are the county's, and
 * so are the orders.
 */

export function SurgeHero({ title, lang, c }: { title: string; lang: Lang; c: SurgeCopy }) {
  return (
    <header className={v.hero}>
      <span className={v.kicker}>{c.kicker}</span>
      <h1 className={v.title}>{title}</h1>
      <p className={v.notice}>
        {c.howOrdered}{' '}
        <a href={LINKS.knowYourZone} target="_blank" rel="noopener noreferrer">
          {c.countyPage} ↗
        </a>
      </p>
      <div className={v.actions}>
        <a className={v.action} href={`${routes.address(lang)}#search`}>
          <span aria-hidden="true">🔎</span> {c.findAddress}
        </a>
        <a className={`${v.action} ${v.actionAlt}`} href={`${routes.address(lang)}?lens=surge`}>
          <span aria-hidden="true">🗺️</span> {c.map}
        </a>
      </div>
    </header>
  )
}

/** What to do, in the county's words: mobile homes, shelters, alerts. */
export function SurgeGuidance({ c, extra }: { c: SurgeCopy; extra?: React.ReactNode }) {
  return (
    <section className={v.card} aria-labelledby="todo">
      <h2 id="todo" className={v.cardTag} style={{ background: 'var(--pink)', color: 'var(--cream)' }}>
        🌀 {c.todo}
      </h2>
      <ul className={s.facts}>
        <li>
          {c.mobile}{' '}
          <a href={LINKS.knowYourZone} target="_blank" rel="noopener noreferrer">
            {c.countyPage} ↗
          </a>
        </li>
        <li>
          {c.shelters}{' '}
          <a href={LINKS.alerts} target="_blank" rel="noopener noreferrer">
            {c.alerts} ↗
          </a>
        </li>
        <li>{c.notFlood}</li>
        {extra}
      </ul>
      <div className={s.links}>
        <a href={LINKS.zoneLookup} target="_blank" rel="noopener noreferrer">
          {c.lookup} ↗
        </a>
        <a href={LINKS.hurricanes} target="_blank" rel="noopener noreferrer">
          {c.hurricanes} ↗
        </a>
      </div>
    </section>
  )
}

export function SurgeSources({ fetchedAt, lang, c }: { fetchedAt: string; lang: Lang; c: SurgeCopy }) {
  return (
    <section className={v.sources} aria-labelledby="sources">
      <h2 id="sources" className={v.cardTag} style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>
        {c.sources}
      </h2>
      <p>
        {c.source(longDay(fetchedAt, lang))}{' '}
        <a href={LINKS.openData} target="_blank" rel="noopener noreferrer">
          {c.openData} ↗
        </a>{' '}
        ·{' '}
        <a href={LINKS.knowYourZone} target="_blank" rel="noopener noreferrer">
          {c.countyPage} ↗
        </a>
      </p>
      <p>{c.counted}</p>
    </section>
  )
}
