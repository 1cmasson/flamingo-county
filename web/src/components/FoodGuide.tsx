import Link from 'next/link'
import type { Metadata } from 'next'
import type { Lang } from '../i18n'
import type { City, Listing } from '../payload-types'
import { getListing, rel } from '../lib/data'
import {
  GUIDE_FILTERS,
  checkedLabel,
  filterSpots,
  guideCopy,
  isGuideFilter,
  spotDirections,
  type Guide,
  type GuideSpot,
} from '../lib/guides'
import { EVENT_CARD_SIZES, guideCardUrl } from '../lib/eventCardUrl'
import { breadcrumbJsonLd, itemListJsonLd, webPageJsonLd } from '../lib/jsonld'
import { routes, withQuery } from '../lib/routes'
import { absUrl, openGraph, twitterCard } from '../lib/site'
import { AnswerBlock } from './AnswerBlock'
import { Breadcrumbs, type Crumb } from './Breadcrumbs'
import { DirectionsLink } from './DirectionsLink'
import { JsonLd } from './JsonLd'
import { PageShell } from './PageShell'
import p from './promo.module.css'
import g from './guide.module.css'
import s from './chrome.module.css'

/**
 * A food guide: /es/lechon and friends (lib/guides.ts). The page files under
 * app/(frontend)/[lang]/ are a few lines each; everything a guide draws is
 * here, so the next guide is a config entry and a copied page file.
 *
 * The filter (`?f=delivery`) is a link, not a script: the filtered list is a
 * URL that can be shared, like every other filter on the site (README, URLs).
 * A filtered view is not indexed; its canonical is the whole guide.
 */

export function guideMetadata(guide: Guide, lang: Lang, filter?: string): Metadata {
  const path = (l: Lang) => routes.guide(l, guide.path)
  const title = guide.metaTitle[lang]
  const description = guide.description[lang]
  const image = guideCardUrl(guide.key, lang, 'link')
  return {
    title,
    description,
    openGraph: openGraph(lang, {
      title,
      description,
      url: absUrl(path(lang)),
      image,
      imageSize: EVENT_CARD_SIZES.link,
      imageAlt: guide.title[lang],
    }),
    twitter: twitterCard(image),
    alternates: {
      canonical: path(lang),
      languages: { en: path('en'), es: path('es') },
    },
    ...(isGuideFilter(filter) ? { robots: { index: false, follow: true } } : {}),
  }
}

/** A place's page on our site, when it is a published listing. */
function listingPath(lang: Lang, listing: Listing | null): string | null {
  const city = rel<City>(listing?.city)
  return listing && city ? routes.business(lang, city.slug, listing.slug) : null
}

export async function FoodGuide({ guide, lang, filter }: { guide: Guide; lang: Lang; filter?: string }) {
  const c = guideCopy(lang)
  const path = routes.guide(lang, guide.path)
  const title = guide.title[lang]
  const active = isGuideFilter(filter) ? filter : null
  const shown = filterSpots(guide, active)

  // Directory listings, looked up per request: an unpublished one just isn't linked.
  const listed = await Promise.all(
    guide.spots.map(async (spot) => {
      const listing = spot.listing ? await getListing(lang, spot.listing).catch(() => null) : null
      return [spot.key, listingPath(lang, listing)] as const
    }),
  )
  const hrefs = new Map(listed)

  const crumbs: Crumb[] = [
    { name: c.home, path: routes.home(lang) },
    { name: guide.city.name, path: routes.city(lang, guide.city.slug) },
    { name: title, path },
  ]
  const numbered = guide.spots.filter((x) => !x.bonus)

  return (
    <PageShell>
      <JsonLd
        data={[
          webPageJsonLd(lang, path, { name: title, dateModified: guide.checkedOn }),
          breadcrumbJsonLd(crumbs),
          itemListJsonLd(
            title,
            guide.spots.map((spot) => ({ name: spot.name, path: hrefs.get(spot.key) ?? `${path}#${spot.key}` })),
          ),
        ]}
      />
      <main className={p.page} style={{ maxWidth: 720 }}>
        <Breadcrumbs items={crumbs} label={c.crumbs} />

        {/*
         * The first screen on a phone: the title, one line, the filters and the
         * first place. Everything people read rather than tap (the intro, the
         * questions to ask, the tips) sits below the list.
         */}
        <header className={`${p.card} ${p.body} ${g.hero}`}>
          <p className={g.when}>{guide.when[lang]}</p>
          <h1 className={`${p.title} ${g.title}`}>{title}</h1>
          <p className={g.hook}>{guide.hook[lang]}</p>
          <p className={g.callShort}>
            <span>{guide.callShort[lang]}</span> <a href="#llama-antes">{c.whatToAsk}</a>
          </p>
        </header>

        <nav className={g.filters} aria-label={c.filterLabel}>
          {[null, ...GUIDE_FILTERS].map((f) => (
            <Link
              key={f ?? 'all'}
              href={withQuery(path, { f })}
              className={`${g.chip} ${s.chipPress}`}
              aria-current={active === f ? 'true' : undefined}
              scroll={false}
            >
              {c.filters[f ?? 'all']}
            </Link>
          ))}
          <span className={g.count} aria-live="polite">
            {c.count(shown.length)}
          </span>
        </nav>

        {shown.length ? (
          <ol className={g.list}>
            {shown.map((spot) => (
              <Spot
                key={spot.key}
                spot={spot}
                lang={lang}
                n={numbered.indexOf(spot) + 1}
                href={hrefs.get(spot.key) ?? null}
              />
            ))}
          </ol>
        ) : (
          <p className={p.warn}>{c.none}</p>
        )}

        <aside className={`${p.card} ${p.body}`} aria-labelledby="llama-antes">
          <h2 id="llama-antes" className={`${p.h2} ${g.anchor}`}>
            {guide.callTitle[lang]}
          </h2>
          <p className={p.details}>{guide.callWhy[lang]}</p>
          <ol className={g.ask}>
            {guide.callAsk.map((q) => (
              <li key={q.en}>{q[lang]}</li>
            ))}
          </ol>
        </aside>

        <AnswerBlock
          question={guide.question[lang]}
          answer={guide.answer[lang]}
          verified={{ text: c.checked(checkedLabel(guide.checkedOn, lang)), iso: guide.checkedOn }}
        />

        <section className={`${p.card} ${p.body}`}>
          <h2 className={p.h2}>{guide.tipsTitle[lang]}</h2>
          <ul className={g.tips}>
            {guide.tips.map((tip) => (
              <li key={tip.lead.en}>
                <strong>{tip.lead[lang]}</strong> {tip.text[lang]}
              </li>
            ))}
          </ul>
        </section>

        <section className={`${p.card} ${p.body}`}>
          <p className={p.kicker}>{guide.kicker[lang]}</p>
          <h2 className={p.h2}>{c.about}</h2>
          {guide.intro.map((para) => (
            <p key={para.en} className={p.details}>
              {para[lang]}
            </p>
          ))}
        </section>

        <p className={p.warn}>
          {c.checked(checkedLabel(guide.checkedOn, lang))} {guide.footer[lang]}
        </p>
      </main>
    </PageShell>
  )
}

function Spot({ spot, lang, n, href }: { spot: GuideSpot; lang: Lang; n: number; href: string | null }) {
  const c = guideCopy(lang)
  return (
    <li id={spot.key} className={`${p.card} ${g.spot} ${spot.bonus ? g.bonus : ''}`}>
      <div className={`${p.body} ${g.spotBody}`}>
        <div className={g.head}>
          {spot.bonus ? <span className={g.bonusTag}>{c.bonus}</span> : <span className={g.num}>{n}</span>}
          <h2 className={g.name}>{href ? <a href={href}>{spot.name}</a> : spot.name}</h2>
        </div>
        <div className={g.tags}>
          {spot.tags[lang].map((tag) => (
            <span key={tag} className={g.tag}>
              {tag}
            </span>
          ))}
        </div>
        <div className={g.addr}>
          {spot.addresses.map((address) => {
            const d = spotDirections(spot.name, address)
            return (
              <div key={address} className={g.addrRow}>
                <p className={g.addrText}>{address}</p>
                <DirectionsLink other={`/${lang}${d.plan}`} apple={d.apple} className={`${g.go} ${s.chipLift}`}>
                  {c.directions}
                </DirectionsLink>
              </div>
            )
          })}
        </div>
        <p className={g.confirm}>{spot.ask[lang]}</p>
        <details className={g.story}>
          <summary>{c.more}</summary>
          <p className={p.details}>{spot.note[lang]}</p>
          {href ? (
            <a className={g.more} href={href}>
              {c.listing}
            </a>
          ) : null}
        </details>
      </div>
    </li>
  )
}
