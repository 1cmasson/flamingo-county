import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { openGraph } from '../../../../../lib/site'
import { electionState, voteData, type VoteData } from '../../../../../lib/civic'
import { areaRows, counts, findArea, sitesOf } from '../../../../../lib/vote'
import { areaName, dayMonth, electionName, longDay, voteCopy } from '../../../../../lib/voteCopy'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../../lib/jsonld'
import { PageShell } from '../../../../../components/PageShell'
import { JsonLd } from '../../../../../components/JsonLd'
import { AnswerBlock } from '../../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../../components/Breadcrumbs'
import { PrecinctTable, VoteHero, VoteSources } from '../../../../../components/Vote'
import s from '../../../../../components/vote.module.css'

type Props = { params: Promise<{ lang: string; area: string }> }

/**
 * Where to vote in one municipality, or one commission district of
 * unincorporated Miami-Dade: each precinct, its Election Day polling place,
 * and the other precincts that vote there. A table of public records, never
 * an address: there is no page per house or per street.
 */
async function load(): Promise<VoteData> {
  const data = await voteData()
  if (!data) throw new Error('vote: the address database is not ready')
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, area: slug } = await params
  if (!isLang(lang)) return {}
  const data = await voteData()
  const area = data ? findArea(data, slug) : null
  if (!data || !area) return {}
  const c = voteCopy(lang)
  const name = areaName(area, lang)
  const state = electionState(data.pollingSource, data.lastElection)
  const n = counts(areaRows(area, data))
  const title = c.areaMetaTitle(name, state.upcoming && state.election ? dayMonth(state.election, lang) : null)
  const description = c.areaMetaDescription(name, n.precincts, n.places, state.upcoming)
  return {
    title,
    description,
    openGraph: openGraph(lang, { title, description, url: routes.voteArea(lang, slug) }),
    alternates: {
      canonical: routes.voteArea(lang, slug),
      languages: { en: routes.voteArea('en', slug), es: routes.voteArea('es', slug) },
    },
  }
}

export default async function VoteArea({ params }: Props) {
  const { lang, area: slug } = await params
  if (!isLang(lang)) notFound()
  const data = await load()
  const area = findArea(data, slug)
  if (!area) notFound()
  const c = voteCopy(lang)
  const name = areaName(area, lang)
  const state = electionState(data.pollingSource, data.lastElection)
  const rows = areaRows(area, data, sitesOf(data))
  const n = counts(rows)
  const path = routes.voteArea(lang, slug)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path: routes.vote(lang) },
    { name, path },
  ]
  const sub = state.upcoming && state.election
    ? [electionName(data.pollingSource?.electionName, lang), longDay(state.election, lang)].filter(Boolean).join(' · ')
    : null
  const overText = state.over ? c.over(dayMonth(state.over, lang)) : null
  const answer = state.upcoming && state.election
    ? c.areaAnswer(name, n.precincts, n.places, longDay(state.election, lang))
    : overText
      ? `${overText} ${data.pollingSource?.election === state.over ? c.overSame : c.overLayer}`
      : c.areaAnswerLayer(name, n.precincts, n.places)
  const commissioner = area.district != null ? data.commission.find((o) => o.district === area.district) : null
  const others = data.areas.filter((a) => a.slug !== slug)

  return (
    <PageShell>
      <JsonLd
        data={[
          webPageJsonLd(lang, path, { name: c.areaTitle(name), dateModified: data.fetchedAt }),
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <main className={s.main}>
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
        <VoteHero title={c.areaTitle(name)} sub={sub} lang={lang} c={c} state={state} overText={overText} />
        <AnswerBlock question={c.areaQuestion(name)} answer={answer} />

        <section className={s.card} aria-label={c.table(name)}>
          {commissioner ? <p className={s.note}>{c.commissioner(commissioner.district, commissioner.name)}</p> : null}
          <PrecinctTable rows={rows} caption={c.table(name)} c={c} onPage={new Set(area.precincts)} />
        </section>

        <VoteSources data={data} lang={lang} c={c} />

        <nav className={s.card} aria-labelledby="others">
          <h2 id="others" className={s.cardTag}>
            {c.otherAreas}
          </h2>
          <ul className={s.areas}>
            {others.map((a) => (
              <li key={a.slug}>
                <Link className={s.areaLink} href={routes.voteArea(lang, a.slug)}>
                  <span className={s.areaName} style={{ fontSize: 17 }}>
                    {areaName(a, lang)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </PageShell>
  )
}
