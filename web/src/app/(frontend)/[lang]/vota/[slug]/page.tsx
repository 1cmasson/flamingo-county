import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '../../../../../payload.config'
import { isLang, type Lang } from '../../../../../i18n'
import { routes } from '../../../../../lib/routes'
import { rel } from '../../../../../lib/data'
import { breadcrumbJsonLd, mediaUrl, webPageJsonLd } from '../../../../../lib/jsonld'
import { getPublishedPoll, pollPhase, pollTally, pollWinner, siteVotesFor, votedFor } from '../../../../../lib/storyPolls'
import { storyPollCopy } from '../../../../../lib/storyPollCopy'
import { whenLabel } from '../../../../../lib/rankingCopy'
import { absUrl, openGraph, twitterCard } from '../../../../../lib/site'
import type { Media, Story, StoryPoll } from '../../../../../payload-types'
import { PageShell } from '../../../../../components/PageShell'
import { JsonLd } from '../../../../../components/JsonLd'
import { Breadcrumbs, type Crumb } from '../../../../../components/Breadcrumbs'
import { StoryPollVote, type PollOptionView } from '../../../../../components/StoryPollVote'
import { StorySuggest } from '../../../../../components/StorySuggest'
import p from '../../../../../components/promo.module.css'

/**
 * The weekly story vote (lib/storyPolls.ts): four stories, one tap, then the
 * live split; after the close, the winner. The phase comes from the poll's
 * own dates, so the page moves along by itself. /es/vota forwards here.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string }>; searchParams: Promise<{ preview?: string }> }

/**
 * ?preview=1 shows the latest saved draft, so the owner can see a poll on the
 * real site before tapping Publish. Only with a real admin session (checked,
 * not just the cookie's name); anyone else gets the published page or nothing.
 */
async function load(lang: Lang, slug: string, searchParams: Props['searchParams']) {
  const payload = await getPayload({ config })
  const h = await headers()
  const preview = (await searchParams).preview === '1' && Boolean((await payload.auth({ headers: h })).user)
  return { payload, preview, cookie: h.get('cookie'), poll: await getPublishedPoll(payload, slug, lang, { draft: preview }) }
}

/** A small square for the story rows (thumbnail size, WebP); the original if it has none. */
function thumb(m: Media | null | undefined): { src: string; alt: string } | null {
  const src = m?.sizes?.thumbnail?.url ?? m?.url
  return src ? { src, alt: m?.alt ?? '' } : null
}

function previewImage(poll: StoryPoll): string | undefined {
  return mediaUrl(rel<Media>(poll.image)) ?? mediaUrl(rel<Media>(poll.options?.[0]?.image))
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  if (!isLang(lang)) return {}
  const { poll, preview } = await load(lang, slug, searchParams)
  if (!poll) return {}
  if (preview) return { title: `Preview: ${poll.title}`, robots: { index: false, follow: false } }
  const image = previewImage(poll)
  const description = poll.intro ?? poll.question
  return {
    title: poll.title,
    description,
    alternates: {
      canonical: routes.storyPoll(lang, slug),
      languages: { en: routes.storyPoll('en', slug), es: routes.storyPoll('es', slug) },
    },
    openGraph: openGraph(lang, { title: poll.title, description, url: absUrl(routes.storyPoll(lang, slug)), image }),
    twitter: twitterCard(image),
  }
}

export default async function StoryPollPage({ params, searchParams }: Props) {
  const { lang: raw, slug } = await params
  if (!isLang(raw)) notFound()
  const lang = raw as Lang
  const { payload, preview, cookie, poll } = await load(lang, slug, searchParams)
  if (!poll) notFound()

  const c = storyPollCopy(lang)
  const phase = pollPhase(poll)
  // A preview votes as a test and leaves no cookie, so it always starts on the buttons.
  const pick = preview ? null : votedFor(poll, cookie)
  // The split only once this browser has voted, or the poll has closed: before that, numbers would sway the pick.
  const tally = phase === 'closed' || (phase === 'open' && pick) ? pollTally(poll, await siteVotesFor(payload, poll.id)) : null
  const winner = phase === 'closed' && tally ? pollWinner(poll, tally) : null
  const winnerStory = rel<Story>(winner?.story)
  const storyPath = winnerStory?._status === 'published' && winnerStory.slug ? routes.story(lang, winnerStory.slug) : null

  const options: PollOptionView[] = (poll.options ?? []).map((o) => ({
    key: o.key,
    title: o.title,
    teaser: o.teaser ?? null,
    image: thumb(rel<Media>(o.image)),
  }))

  const path = routes.storyPoll(lang, slug)
  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: c.stories, path: routes.stories(lang) },
    { name: poll.title, path },
  ]

  return (
    <PageShell>
      {preview ? null : <JsonLd data={[webPageJsonLd(lang, path, { name: poll.title }), breadcrumbJsonLd(crumbs)]} />}
      <main className={p.page}>
        {preview ? <p className={p.warn}>{c.preview(poll._status === 'published')}</p> : null}
        <Breadcrumbs items={crumbs} label={c.crumbs} />

        <section className={p.card}>
          <div className={p.body}>
            <p className={p.kicker}>{c.kicker}</p>
            <h1 className={p.title}>{poll.title}</h1>
            <p className={p.at}>{poll.question}</p>
            {poll.intro ? <p className={p.details}>{poll.intro}</p> : null}
            <p className={p.meta}>
              {phase === 'upcoming'
                ? c.opens(whenLabel(poll.opensAt, lang))
                : phase === 'open'
                  ? c.closes(whenLabel(poll.closesAt, lang))
                  : c.closed(whenLabel(poll.closesAt, lang))}
            </p>
            {poll.winnerPostsOn ? <p className={p.note}>{c.postsOn(whenLabel(poll.winnerPostsOn, lang, false))}</p> : null}
          </div>
        </section>

        <section className={`${p.card} ${p.body}`}>
          <StoryPollVote
            slug={slug}
            lang={lang}
            phase={phase}
            options={options}
            initial={tally ? { ...tally, pick } : null}
            winner={winner?.key ?? null}
            preview={preview}
          />
          {storyPath ? (
            <a className={p.btn} href={storyPath}>
              {c.readStory}
            </a>
          ) : null}
          {poll.igPostUrl ? (
            <a className={`${p.btn} ${p.quiet}`} href={poll.igPostUrl} rel="noopener noreferrer">
              {phase === 'open' ? c.igVote : c.igSee}
            </a>
          ) : null}
        </section>

        <section className={`${p.card} ${p.body}`}>
          <h2 className={p.h2}>{c.suggestTitle}</h2>
          <StorySuggest slug={slug} lang={lang} preview={preview} />
        </section>

        <section className={`${p.card} ${p.body}`}>
          <h2 className={p.h2}>{c.fair}</h2>
          <p className={p.details}>{c.fairText}</p>
        </section>
      </main>
    </PageShell>
  )
}
