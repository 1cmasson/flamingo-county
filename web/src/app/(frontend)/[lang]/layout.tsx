import React from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Luckiest_Guy, Archivo } from 'next/font/google'
import { DEFAULT_LANG, isLang, LOCALES, translator } from '../../../i18n'
import { Nav } from '../../../components/Nav'
import { Footer } from '../../../components/Footer'
import '../globals.css'

/**
 * The source loaded these from the Google Fonts CDN with a preconnect pair.
 * next/font self-hosts them instead — same faces, no third-party request and no
 * layout shift while they load.
 */
const luckiest = Luckiest_Guy({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-luckiest',
})
const archivo = Archivo({
  weight: ['400', '600', '800'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
})
// The source's font link also requested Archivo Black, but no font-family
// declaration in any of the twelve pages ever used it. Not loaded here.

/**
 * The description is per-language, so this is `generateMetadata` rather than a
 * static `metadata` export — a Spanish visitor was being served the English
 * sentence in the head.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const t = translator(isLang(lang) ? lang : DEFAULT_LANG)
  return {
    metadataBase: new URL('https://flamingocounty.com'),
    title: {
      default: 'Flamingo County',
      template: '%s · Flamingo County',
    },
    description: t('A directory of the restaurants and bars the locals actually vouch for.'),
    icons: {
      icon: [
        { url: '/uploads/favicon.ico', sizes: 'any' },
        { url: '/uploads/flamingo-city-favicon-16.png', type: 'image/png', sizes: '16x16' },
        { url: '/uploads/flamingo-city-favicon-32.png', type: 'image/png', sizes: '32x32' },
        { url: '/uploads/flamingo-city-favicon-48.png', type: 'image/png', sizes: '48x48' },
        { url: '/uploads/flamingo-city-favicon-512.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: [{ url: '/uploads/flamingo-city-favicon-180.png', sizes: '180x180' }],
    },
  }
}

/**
 * This is the root layout for the public site — it lives under [lang] rather
 * than above it because only this segment knows the language, and <html lang>
 * has to be right for screen readers and for search engines to tell the two
 * versions apart. Requests with no language prefix never reach a page: the
 * middleware resolves one and redirects first.
 */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }))
}

/**
 * Every public route renders per request.
 *
 * This used to be implicit: the nav read a request header for its active
 * section, and reading a header makes the segment dynamic. That header is gone
 * now — the active state is derived from the pathname on the client — and with
 * it went the only thing keeping About, List Your Spot, My Week and the stories
 * index off the static path. They immediately tried to prerender, and `/es/about`
 * failed the build outright.

 * Static is the wrong answer here regardless: this layout queries Payload on
 * every render (the nav's cities, the ticker's listings), and a container build
 * runs against an empty database. Prerendering would bake a nav with no city
 * tabs and an empty ticker into the HTML until the next rebuild — and it would
 * look correct locally, where the build database is seeded. Declaring it on the
 * layout covers the whole subtree, including the four routes that carry their
 * own `force-dynamic` for the same reason.
 */
export const dynamic = 'force-dynamic'

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLang(lang)) notFound()

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${luckiest.variable} ${archivo.variable}`}
    >
      <body>
        {/* The source's outer div: a min-height over nav, content and footer
            together, so a short page leaves its slack below the footer rather
            than above it. `svh` rather than `vh`, which on iOS resolves to the
            large viewport and leaves the page taller than the screen while the
            toolbars are showing. */}
        <div style={{ minHeight: '100svh' }}>
          <Nav lang={lang} />
          {children}
          <Footer lang={lang} />
        </div>
      </body>
    </html>
  )
}
