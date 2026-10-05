import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../i18n'
import { getSeason } from '../../../../lib/seasons'
import { SeasonGuide, seasonMetadata } from '../../../../components/SeasonGuide'

/**
 * /es/halloween, /en/halloween: the Halloween guide (lib/seasons.ts). A
 * static folder, so it wins over the `[city]` segment beside it.
 *
 * Per request: the list drops events as they finish and the year in the title
 * follows today's date in Miami. A static render would freeze both at build.
 */
export const dynamic = 'force-dynamic'

const KEY = 'halloween'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  const season = getSeason(KEY)
  if (!isLang(lang) || !season) return {}
  return seasonMetadata(season, lang)
}

export default async function HalloweenPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  const season = getSeason(KEY)
  if (!isLang(lang) || !season) notFound()
  return <SeasonGuide season={season} lang={lang} />
}
