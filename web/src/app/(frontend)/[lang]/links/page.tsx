import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { getLinkPage, getNewestStory } from '../../../../lib/data'
import { todayISO } from '../../../../lib/dates'
import { buildLinkPage, sourceFromParam, type LinkButtonView, type LinkPageDoc } from '../../../../lib/links'
import { linksCopy } from '../../../../lib/linksCopy'
import { absUrl, openGraph, twitterCard } from '../../../../lib/site'
import { PageShell } from '../../../../components/PageShell'
import s from '../../../../components/links.module.css'

/**
 * The link in the Instagram, TikTok and Facebook bios: /links?from=ig (the
 * proxy adds the language, keeping the query). Sections of buttons from the
 * `link-page` global, the featured ones first, every one counted through
 * /go/ (lib/links.ts). Server-rendered with no script of its own: it opens in
 * the apps' in-app browsers, where every kilobyte shows.
 */
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = linksCopy(lang)
  return {
    title: c.title,
    description: c.description,
    alternates: {
      canonical: routes.links(lang),
      languages: { en: routes.links('en'), es: routes.links('es') },
    },
    openGraph: openGraph(lang, {
      title: `${c.title} · Flamingo County`,
      description: c.description,
      url: absUrl(routes.links(lang)),
      imageAlt: 'Flamingo County',
    }),
    twitter: twitterCard(),
  }
}

export default async function LinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<{ from?: string | string[] }>
}) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const c = linksCopy(lang as Lang)
  const from = sourceFromParam((await searchParams).from)

  const [doc, newestStory] = await Promise.all([getLinkPage(), getNewestStory(lang as Lang)])
  const page = buildLinkPage(doc as LinkPageDoc, {
    lang: lang as Lang,
    today: todayISO(),
    from,
    newestStory: newestStory?.slug ? { slug: newestStory.slug, title: newestStory.title ?? '' } : null,
  })

  return (
    <PageShell>
      <main className={s.page}>
        <header className={s.head}>
          <h1 className={s.name}>Flamingo County</h1>
          <p className={s.tagline}>{page.tagline || c.tagline}</p>
        </header>

        {page.featured.length ? (
          <nav className={s.featured} aria-label={c.title}>
            {page.featured.map((b) => (
              <Button key={b.key} b={b} className={s.big} />
            ))}
          </nav>
        ) : null}

        {page.sections.map((section) => (
          <section key={section.key} className={s.section} aria-labelledby={`links-${section.key}`}>
            <h2 id={`links-${section.key}`} className={s.tab}>
              {section.emoji ? (
                <span className={s.tabEmoji} aria-hidden="true">
                  {section.emoji}
                </span>
              ) : null}
              {section.title}
            </h2>
            <ul className={s.list}>
              {section.buttons.map((b) => (
                <li key={b.key}>
                  <Button b={b} className={s.btn} />
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!page.featured.length && !page.sections.length ? (
          <p className={s.empty}>
            {c.empty} <a href={routes.home(lang as Lang)}>{c.site}</a>
          </p>
        ) : null}
      </main>
    </PageShell>
  )
}

function Button({ b, className }: { b: LinkButtonView; className: string }) {
  return (
    // A plain <a>, not next/link: /go/ is a redirect route, not a page to prefetch.
    <a href={b.href} className={className} {...(b.external ? { rel: 'noopener' } : {})}>
      <span className={s.emoji} aria-hidden="true">
        {b.emoji || '→'}
      </span>
      <span className={s.label}>
        {b.label}
        {b.sub ? <span className={s.sub}>{b.sub}</span> : null}
      </span>
      <span className={s.arrow} aria-hidden="true">
        {b.external ? '↗' : '→'}
      </span>
    </a>
  )
}
