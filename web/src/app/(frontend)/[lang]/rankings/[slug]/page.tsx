import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPayload, type Payload } from 'payload'
import config from '../../../../../payload.config'
import { isLang, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { rel } from '../../../../../lib/data'
import { breadcrumbJsonLd, itemListJsonLd, mediaUrl, titleCase, webPageJsonLd } from '../../../../../lib/jsonld'
import {
  bracket,
  finalOrder,
  getPublishedRanking,
  phaseOf,
  roundFor,
  stagesFor,
  bracketSize,
  talliesFor,
  type Entrant,
  type Matchup,
} from '../../../../../lib/rankings'
import { rankingCopy, whenLabel } from '../../../../../lib/rankingCopy'
import { absUrl, openGraph, twitterCard } from '../../../../../lib/site'
import type { City, Listing, Media, Ranking } from '../../../../../payload-types'
import { PageShell } from '../../../../../components/PageShell'
import { JsonLd } from '../../../../../components/JsonLd'
import { AnswerBlock } from '../../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../../components/Breadcrumbs'
import { RankingVote } from '../../../../../components/RankingVote'
import p from '../../../../../components/promo.module.css'
import s from '../../../../../components/ranking.module.css'

/**
 * A neighbors' ranking (lib/rankings.ts): while nominating, the question and
 * a link to the post where people nominate; while voting, the open round's
 * matchups; then the results, with every round's real count. The phase comes
 * from the ranking's own dates, so the page moves along by itself.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string }> }

async function load(lang: Lang, slug: string) {
  const payload = await getPayload({ config })
  return getPublishedRanking(payload, slug, lang)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLang(lang)) return {}
  const ranking = await load(lang, slug)
  if (!ranking) return {}
  const image = mediaUrl(rel<Media>(ranking.image))
  const description = ranking.intro ?? ranking.question
  return {
    title: ranking.title,
    description,
    alternates: {
      canonical: routes.ranking(lang, slug),
      languages: { en: routes.ranking('en', slug), es: routes.ranking('es', slug) },
    },
    openGraph: openGraph(lang, { title: ranking.title, description, url: absUrl(routes.ranking(lang, slug)), image }),
    twitter: twitterCard(image),
  }
}

/** Where the ranking is right now: its phase and every game so far. Read per request, never cached. */
async function standing(payload: Payload, ranking: Ranking) {
  const now = Date.now()
  const phase = phaseOf(ranking, now)
  const tallies = phase === 'nominating' ? {} : await talliesFor(payload, ranking.id)
  return { phase, rounds: bracket(ranking, tallies, now) }
}

export default async function RankingPage({ params }: Props) {
  const { lang: raw, slug } = await params
  if (!isLang(raw)) notFound()
  const lang = raw as Lang
  const payload = await getPayload({ config })
  const ranking = await getPublishedRanking(payload, slug, lang)
  if (!ranking) notFound()

  const c = rankingCopy(lang)
  const city = rel<City>(ranking.city)
  // Stored as display caps ("HIALEAH"); sentences want "Hialeah".
  const cityName = titleCase(city?.name) ?? ''
  const { phase, rounds } = await standing(payload, ranking)
  const size = bracketSize(ranking.entrants?.length ?? 0)
  const field = (ranking.entrants ?? []).slice(0, size)
  const order = phase === 'results' ? finalOrder(ranking, rounds) : []
  const totalVotes = rounds.flat().reduce((n, g) => n + g.votes[0] + g.votes[1], 0)
  const image = rel<Media>(ranking.image)

  const path = routes.ranking(lang, slug)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    ...(city ? [{ name: cityName, path: routes.city(lang, city.slug) }] : []),
    { name: ranking.title, path },
  ]
  const jsonLd: Record<string, unknown>[] = [webPageJsonLd(lang, path, { name: ranking.title }), breadcrumbJsonLd(crumbs)]
  if (order.length) jsonLd.push(itemListJsonLd(ranking.title, order.map((e) => ({ name: e.name, path: placePath(lang, e) ?? path }))))

  const firstRound = roundFor(ranking, stagesFor(size)[0] ?? 'final')
  const openGames = rounds.flat().filter((g) => g.open)
  const nextRound = rounds.find((games) => games.some((g) => !g.closed && !g.open))?.[0]
  const nextOpens = nextRound ? roundFor(ranking, nextRound.stage)?.opensAt : null

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <main className={`${p.page}`}>
        <Breadcrumbs items={crumbs} label={c.crumbs} />

        <article className={p.card}>
          {image?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={p.photo} src={image.url} alt={image.alt ?? ''} />
          ) : null}
          <div className={p.body}>
            <p className={p.kicker}>{c.kicker(cityName)}</p>
            <h1 className={p.title}>{ranking.title}</h1>
            <p className={p.at}>{ranking.question}</p>
            {ranking.intro ? <p className={p.details}>{ranking.intro}</p> : null}

            {phase === 'nominating' ? (
              <>
                <p className={p.warn}>
                  {ranking.nominationsCloseOn ? c.nominatingUntil(whenLabel(ranking.nominationsCloseOn, lang, false)) : `${c.nominating}.`}{' '}
                  {firstRound?.opensAt ? c.votingOpens(whenLabel(firstRound.opensAt, lang)) : null}
                </p>
                {ranking.nominatePostUrl ? (
                  <a className={p.btn} href={ranking.nominatePostUrl} rel="noopener noreferrer">
                    {c.nominate}
                  </a>
                ) : null}
              </>
            ) : null}
          </div>
        </article>

        {phase === 'results' && order[0] ? (
          <AnswerBlock question={ranking.question} answer={c.resultsAnswer(ranking.title, cityName, order[0].name, totalVotes)} />
        ) : null}

        {openGames.length ? (
          <section className={`${p.card} ${p.body}`}>
            <h2 className={p.h2}>{c.stage[openGames[0].stage]}</h2>
            {(() => {
              const closes = roundFor(ranking, openGames[0].stage)?.closesAt
              return closes ? <p className={p.meta}>{c.closes(whenLabel(closes, lang))}</p> : null
            })()}
            <div className={s.round}>
              {openGames.map((g) =>
                g.a && g.b ? (
                  <RankingVote
                    key={g.index}
                    slug={slug}
                    lang={lang}
                    stage={g.stage}
                    index={g.index}
                    a={{ key: g.a.key, name: g.a.name }}
                    b={{ key: g.b.key, name: g.b.name }}
                  />
                ) : null,
              )}
            </div>
          </section>
        ) : phase === 'between' && nextOpens ? (
          <p className={p.warn}>{c.opens(whenLabel(nextOpens, lang))}</p>
        ) : null}

        {phase === 'results' ? (
          <section className={`${p.card} ${p.body}`}>
            <h2 className={p.h2}>{c.results}</h2>
            <ol className={s.list}>
              {order.map((e, i) => (
                <Place key={e.key} entrant={e} rank={i + 1} lang={lang} label={i === 0 ? c.winner : null} />
              ))}
            </ol>
            <p className={p.meta}>{c.totalVotes(totalVotes)}</p>
          </section>
        ) : field.length ? (
          <section className={`${p.card} ${p.body}`}>
            <h2 className={p.h2}>{c.contenders}</h2>
            <ol className={s.list}>
              {field.map((e, i) => (
                <Place key={e.key} entrant={e} rank={i + 1} lang={lang} />
              ))}
            </ol>
          </section>
        ) : null}

        {rounds.some((games) => games.some((g) => g.closed)) ? (
          <section className={`${p.card} ${p.body}`}>
            {[...rounds]
              .reverse()
              .filter((games) => games.some((g) => g.closed))
              .map((games) => (
                <div key={games[0].stage} className={s.round}>
                  <h2 className={p.h2}>{c.stage[games[0].stage]}</h2>
                  {games.map((g) => (
                    <Result key={g.index} game={g} lang={lang} />
                  ))}
                </div>
              ))}
          </section>
        ) : null}

        <section className={`${p.card} ${p.body}`}>
          <h2 className={p.h2}>{c.how}</h2>
          <ol className={p.steps}>
            {c.steps(cityName).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <h2 className={p.h2}>{c.fair}</h2>
          <p className={p.details}>{c.fairText}</p>
        </section>
      </main>
    </PageShell>
  )
}

/** The place's page on our site, when it's in the directory. */
function placePath(lang: Lang, e: Entrant): string | null {
  const listing = rel<Listing>(e.listing)
  const city = rel<City>(listing?.city)
  return listing && city ? routes.business(lang, city.slug, listing.slug) : null
}

function Place({ entrant: e, rank, lang, label }: { entrant: Entrant; rank: number; lang: Lang; label?: string | null }) {
  const c = rankingCopy(lang)
  const href = placePath(lang, e)
  return (
    <li className={s.entry}>
      <span className={s.seed}>{rank}</span>
      <p className={s.name}>
        {href ? <a href={href}>{e.name}</a> : e.name}
        {label ? ` · ${label}` : ''}
      </p>
      {e.area ? <p className={s.sub}>{e.area}</p> : null}
      {e.note ? <p className={s.sub}>{e.note}</p> : null}
      {!href && e.sourceUrl ? (
        <p className={s.sub}>
          <a href={e.sourceUrl} rel="noopener noreferrer nofollow">
            {c.source}
          </a>
        </p>
      ) : null}
    </li>
  )
}

function Result({ game: g, lang }: { game: Matchup; lang: Lang }) {
  const c = rankingCopy(lang)
  const total = g.votes[0] + g.votes[1] || 1
  return (
    <div className={s.game}>
      {[g.a, g.b].map((side, i) =>
        side ? (
          <div key={side.key} className={`${s.side} ${g.winner?.key === side.key ? s.won : ''}`}>
            <span>{side.name}</span>
            <span className={s.count}>
              {c.votes(g.votes[i])} · {Math.round((g.votes[i] / total) * 100)}%
            </span>
          </div>
        ) : (
          <div key={i} className={s.side}>
            <span>{c.tbd}</span>
          </div>
        ),
      )}
    </div>
  )
}
