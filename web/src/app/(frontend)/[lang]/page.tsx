import { isLang } from '../../../i18n'
import { notFound } from 'next/navigation'

/** Placeholder while the chrome is verified — the real Home lands next. */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  return <main style={{ minHeight: '40vh', padding: 40, background: 'var(--pink)' }} />
}
