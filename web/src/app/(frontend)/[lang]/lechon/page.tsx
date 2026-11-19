import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../i18n'
import { getGuide } from '../../../../lib/guides'
import { FoodGuide, guideMetadata } from '../../../../components/FoodGuide'

/**
 * /es/lechon, /en/lechon: where to get lechón in Hialeah for Thanksgiving
 * (lib/guides.ts). A static folder, so it wins over the `[city]` segment
 * beside it.
 *
 * Per request: the filter lives in the query (`?f=delivery`) and a place's
 * directory listing is linked only while it is published.
 */
export const dynamic = 'force-dynamic'

const KEY = 'lechon'

type Props = { params: Promise<{ lang: string }>; searchParams: Promise<{ f?: string }> }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang } = await params
  const guide = getGuide(KEY)
  if (!isLang(lang) || !guide) return {}
  return guideMetadata(guide, lang, (await searchParams).f)
}

export default async function LechonPage({ params, searchParams }: Props) {
  const { lang } = await params
  const guide = getGuide(KEY)
  if (!isLang(lang) || !guide) notFound()
  return <FoodGuide guide={guide} lang={lang} filter={(await searchParams).f} />
}
