import type { Lang } from '../i18n'
import { LINKS, type VoteData } from '../lib/civic'
import { routes } from '../lib/routes'
import type { VoteRow } from '../lib/vote'
import { electionName, longDay, type VoteCopy } from '../lib/voteCopy'
import s from './vote.module.css'

/**
 * Pieces shared by the vote hub and the per-place pages: the hero with the
 * Election Day notice, the precinct table and the sources. Server components:
 * all of it is in the HTML a crawler reads.
 */

export type Election = { upcoming: boolean; election: string | null; over: string | null }

export function VoteHero({
  title,
  sub,
  lang,
  c,
  state,
  overText,
}: {
  title: string
  sub: string | null
  lang: Lang
  c: VoteCopy
  state: Election
  overText: string | null
}) {
  return (
    <header className={s.hero}>
      <span className={s.kicker}>{c.kicker}</span>
      <h1 className={s.title}>{title}</h1>
      {sub ? <p className={s.sub}>{sub}</p> : null}
      {overText ? (
        <p className={s.over}>
          <strong>{overText}</strong>
        </p>
      ) : null}
      {state.upcoming ? (
        <p className={s.notice}>
          {c.electionDayOnly}{' '}
          <a href={LINKS.elections} target="_blank" rel="noopener noreferrer">
            {c.elections} ↗
          </a>
        </p>
      ) : (
        <p className={s.notice}>
          <a href={LINKS.elections} target="_blank" rel="noopener noreferrer">
            {c.elections} ↗
          </a>
        </p>
      )}
      <div className={s.actions}>
        <a className={s.action} href={`${routes.address(lang)}#search`}>
          <span aria-hidden="true">🔎</span> {c.findAddress}
        </a>
        <a className={`${s.action} ${s.actionAlt}`} href={`${routes.address(lang)}?lens=polling`}>
          <span aria-hidden="true">🗺️</span> {c.map}
        </a>
      </div>
    </header>
  )
}

/** "Precinct · polling place · also votes here", one row per precinct; each row is an anchor (#p-318). */
export function PrecinctTable({
  rows,
  caption,
  c,
  onPage,
}: {
  rows: VoteRow[]
  caption: string
  c: VoteCopy
  /** Precincts on this page: "also votes here" links to their rows. */
  onPage: Set<number>
}) {
  return (
    <table className={s.table}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{c.precinct}</th>
          <th scope="col">{c.place}</th>
          <th scope="col">{c.alsoHere}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.precinct} id={`p-${r.precinct}`}>
            <th scope="row">
              {r.precinct}
            </th>
            <td>
              {r.polling ? (
                <>
                  <span className={s.place}>{r.polling.name}</span>
                  <span className={s.address}>{r.polling.address}</span>
                </>
              ) : (
                <span className={s.missing}>{c.noSite}</span>
              )}
            </td>
            <td className={`${s.also} ${s.alsoCell}`}>
              {r.alsoHere.length ? (
                <>
                  <span className={s.alsoLabel}>{c.alsoHere}: </span>
                  {r.alsoHere.map((p, i) => (
                    <span key={p}>
                      {i ? ', ' : ''}
                      {onPage.has(p) ? <a href={`#p-${p}`}>{p}</a> : p}
                    </span>
                  ))}
                </>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function VoteSources({ data, lang, c }: { data: VoteData; lang: Lang; c: VoteCopy }) {
  const src = data.pollingSource
  const official = !!(src?.election && src.published)
  return (
    <section className={s.sources} aria-labelledby="sources">
      <h2 id="sources" className={s.cardTag} style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>
        {c.sources}
      </h2>
      {official ? (
        <p>
          {c.sourceOfficial(longDay(src!.published!, lang), electionName(src!.electionName, lang))}{' '}
          <a href={src!.url} target="_blank" rel="noopener noreferrer">
            {c.pdf} ↗
          </a>
        </p>
      ) : (
        <p>
          {c.sourceLayer}{' '}
          <a href={LINKS.openData} target="_blank" rel="noopener noreferrer">
            {c.openData} ↗
          </a>
        </p>
      )}
      <p>
        {c.sourcePrecincts}{' '}
        <a href={LINKS.openData} target="_blank" rel="noopener noreferrer">
          {c.openData} ↗
        </a>
      </p>
      <p>{c.readOn(longDay(data.fetchedAt, lang))}</p>
    </section>
  )
}
