import React from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Luckiest_Guy, Archivo } from 'next/font/google'
import { isLang, LOCALES } from '../../../i18n'
import { Nav } from '../../../components/Nav'
import { Footer } from '../../../components/Footer'
import { activeSection } from '../../../lib/active'
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

export const metadata: Metadata = {
  metadataBase: new URL('https://flamingocounty.com'),
  title: {
    default: 'Flamingo County',
    template: '%s · Flamingo County',
  },
  description:
    'A business and events directory for Hialeah, Miami Lakes and Little Havana.',
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

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const { active, city } = await activeSection()

  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${luckiest.variable} ${archivo.variable}`}
    >
      <body>
        <Nav lang={lang} active={active} city={city} />
        {children}
        <Footer lang={lang} />
      </body>
    </html>
  )
}
