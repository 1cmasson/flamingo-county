import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { openGraph } from '../../../../lib/site'
import { electionState, voteData, type VoteData } from '../../../../lib/civic'
import { UNINCORPORATED } from '../../../../lib/civicSync'
import { areaRows, counts, sitesOf } from '../../../../lib/vote'
import { areaName, dayMonth, electionName, longDay, voteCopy } from '../../../../lib/voteCopy'
import { breadcrumbJsonLd, webPageJsonLd } from '../../../../lib/jsonld'
import { PageShell } from '../../../../components/PageShell'
import { JsonLd } from '../../../../components/JsonLd'
import { AnswerBlock } from '../../../../components/AnswerBlock'
import { Breadcrumbs, type Crumb } from '../../../../components/Breadcrumbs'
import { VoteHero, VoteSources } from '../../../../components/Vote'
import s from '../../../../components/vote.module.css'

type Props = { params: Promise<{ lang: string }> }

/**
 * Where to vote in Miami-Dade: every municipality, and unincorporated
 * Miami-Dade by commission district, each linking its precinct table.
 *
 * Reads only the address database. proxy.ts answers 503 while it is missing
 * or being rebuilt; a request that slips past that throws rather than render
 * an empty page.
 */
async function load(): Promise<VoteData> {
  const data = await voteData()
  if (!data) throw new Error('vote: the address database is not ready')
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = voteCopy(lang)
  const data = await voteData()
  const state = data ? electionState(data.pollingSource, data.lastElection) : null
  const title = c.hubMetaTitle(state?.upcoming && state.election ? dayMonth(state.election, lang) : null)
  return {
    title,
    description: c.hubMetaDescription,
    openGraph: openGraph(lang, { title, description: c.hubMetaDescription, url: routes.vote(lang) }),
    alternates: { canonical: routes.vote(lang), languages: { en: routes.vote('en'), es: routes.vote('es') } },
  }
}

export default async function VoteHub({ params }: Props) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const c = voteCopy(lang)
  const data = await load()
  const state = electionState(data.pollingSource, data.lastElection)
  const sites = sitesOf(data)
  const all = counts([...data.precincts.values()].filter((p) => p.polling))
  const path = routes.vote(lang)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.hub, path },
  ]
  const sub = state.upcoming && state.election
    ? [electionName(data.pollingSource?.electionName, lang), longDay(state.election, lang)].filter(Boolean).join(' · ')
    : null
  const overText = state.over ? c.over(dayMonth(state.over, lang)) : null
  const answer = state.upcoming && state.election
    ? c.hubAnswer(longDay(state.election, lang), all.precincts, all.places)
    : overText
      ? `${overText} ${data.pollingSource?.election === state.over ? c.overSame : c.overLayer}`
      : c.hubAnswerLayer(all.precincts, all.places)

  const cities = data.areas.filter((a) => a.munic !== UNINCORPORATED)
  const districts = data.areas.filter((a) => a.munic === UNINCORPORATED)
  const commissioner = (d: number | null) => data.commission.find((o) => o.district === d)?.name

  const item = (a: (typeof data.areas)[number]) => {
    const n = counts(areaRows(a, data, sites))
    const who = a.district != null ? commissioner(a.district) : null
    return (
      <li key={a.slug}>
        <Link className={s.areaLink} href={routes.voteArea(lang, a.slug)}>
          <span className={s.areaName}>{a.munic === UNINCORPORATED && a.district != null ? `${lang === 'es' ? 'Distrito' : 'District'} ${a.district}` : areaName(a, lang)}</span>
          <span className={s.areaMeta}>{c.counts(n.precincts, n.places)}</span>
          {who ? <span className={s.areaMeta}>{who}</span> : null}
        </Link>
      </li>
    )
  }

  return (
    <PageShell>
      <JsonLd
        data={[
          webPageJsonLd(lang, path, { name: c.hubTitle, dateModified: data.fetchedAt }),
          breadcrumbJsonLd(crumbs),
        ]}
      />
      <main className={s.main}>
        <Breadcrumbs items={crumbs} label={c.breadcrumb} />
        <VoteHero title={c.hubTitle} sub={sub} lang={lang} c={c} state={state} overText={overText} />
        <AnswerBlock question={c.hubQuestion} answer={answer} />

        <section className={s.card} aria-labelledby="cities">
          <h2 id="cities" className={s.cardTag}>
            {c.cities}
          </h2>
          <ul className={s.areas}>{cities.map(item)}</ul>
        </section>

        {districts.length ? (
          <section className={s.card} aria-labelledby="uninc">
            <h2 id="uninc" className={s.cardTag}>
              {c.unincorporated}
            </h2>
            <p className={s.note}>{c.unincorporatedNote}</p>
            <ul className={s.areas}>{districts.map(item)}</ul>
          </section>
        ) : null}

        <VoteSources data={data} lang={lang} c={c} />
      </main>
    </PageShell>
  )
}
