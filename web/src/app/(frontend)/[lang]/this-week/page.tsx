import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { getEvents } from '../../../../lib/data'
import { parseISO, shortMonth, shortWeekday, todayISO } from '../../../../lib/dates'
import { eventVenue } from '../../../../lib/eventVenue'
import { breadcrumbJsonLd, eventJsonLd, eventListJsonLd } from '../../../../lib/jsonld'
import { routes } from '../../../../lib/routes'
import { openGraph } from '../../../../lib/site'
import { weekEvents, weekMonday, weekRange } from '../../../../lib/week'
import { EventCard } from '../../../../components/EventCard'
import { JsonLd } from '../../../../components/JsonLd'
import { PageShell } from '../../../../components/PageShell'
import s from '../../../../components/chrome.module.css'

/**
 * /es/this-week, /en/this-week: this week's events, Monday to Sunday, by day.
 * The page the Monday roundup post links to (lib/weeklyRoundup.ts), and the
 * "what's on this weekend" page searchers look for. English slug in both
 * languages, as every route (lib/routes.ts).
 *
 * Per request: the week turns over on Monday in Miami and events drop off as
 * they finish, as on the board. A static render would freeze both at build.
 */
export const dynamic = 'force-dynamic'

const copy = {
  es: {
    title: 'Esta semana en Flamingo County',
    kicker: 'AGENDA DE LA SEMANA',
    h1: 'ESTA SEMANA',
    intro:
      'Lo que hay de lunes a domingo en Hialeah, Miami Lakes y alrededores, día por día. Cada evento con su lugar y su hora.',
    description: (range: string) =>
      `Qué hacer esta semana (${range}) en Hialeah, Miami Lakes y alrededores: eventos de la comunidad, día por día.`,
    empty: 'No hay nada más en la pizarra esta semana. Mira lo que viene en la pizarra de eventos.',
    count: (n: number) => (n === 1 ? '1 EVENTO' : `${n} EVENTOS`),
    today: 'HOY',
  },
  en: {
    title: 'This week in Flamingo County',
    kicker: "THIS WEEK'S LINEUP",
    h1: 'THIS WEEK',
    intro:
      "What's on Monday to Sunday in Hialeah, Miami Lakes and around, day by day. Every event with its venue and its time.",
    description: (range: string) =>
      `Things to do this week (${range}) in Hialeah, Miami Lakes and around: community events, day by day.`,
    empty: "Nothing else on the board this week. See what's coming up on the events board.",
    count: (n: number) => (n === 1 ? '1 EVENT' : `${n} EVENTS`),
    today: 'TODAY',
  },
} as const

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const c = copy[lang]
  const range = weekRange(weekMonday(), lang)
  const title = `${c.title} · ${range}`
  const description = c.description(range)
  return {
    title,
    description,
    openGraph: openGraph(lang, { title, description, url: routes.thisWeek(lang) }),
    alternates: {
      canonical: routes.thisWeek(lang),
      languages: { en: routes.thisWeek('en'), es: routes.thisWeek('es') },
    },
  }
}

export default async function ThisWeekPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)
  const c = copy[lang as Lang]

  const today = todayISO()
  const monday = weekMonday(today)
  const range = weekRange(monday, lang as Lang)
  const days = weekEvents(await getEvents(lang), monday, today)
  const listed = days.flatMap((d) => d.items)
  const path = routes.thisWeek(lang as Lang)

  return (
    <PageShell>
      <JsonLd
        data={[
          eventListJsonLd(
            `${c.title} · ${range}`,
            path,
            listed.map((ev) => eventJsonLd(lang as Lang, ev, eventVenue(ev))),
          ),
          breadcrumbJsonLd([
            { name: 'Flamingo County', path: routes.home(lang as Lang) },
            { name: t('Events'), path: routes.events(lang as Lang) },
            { name: c.title, path },
          ]),
        ]}
      />
      <main
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(18px,3vw,26px)',
        }}
      >
        {/* --- Masthead, as the events board's --- */}
        <header
          style={{
            background: 'var(--ink)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--cream)',
            padding: 'clamp(16px,3.5vw,26px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div
            style={{
              alignSelf: 'flex-start',
              background: 'var(--yellow)',
              color: 'var(--ink)',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '2px',
              padding: '6px 10px',
            }}
          >
            {c.kicker}
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--display)',
              fontSize: 'clamp(32px,7vw,54px)',
              fontWeight: 400,
              lineHeight: 0.92,
              color: 'var(--cream)',
              textWrap: 'balance',
            }}
          >
            {c.h1}
            <br />
            <span style={{ color: 'var(--yellow)' }}>{range}</span>
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: '58ch',
              fontWeight: 600,
              fontSize: 15,
              lineHeight: 1.5,
              color: 'var(--cream)',
              textWrap: 'pretty',
            }}
          >
            {c.intro}
          </p>
          {listed.length ? (
            <div
              style={{
                alignSelf: 'flex-start',
                background: 'var(--grad-cyan)',
                border: '3px solid var(--cream)',
                color: 'var(--ink)',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: '1.6px',
                padding: '6px 10px',
              }}
            >
              {c.count(listed.length)}
            </div>
          ) : null}
        </header>

        {days.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(18px,3vw,26px)' }}>
            {days.map((dy) => (
              <section key={dy.iso} id={`day-${dy.iso}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h2
                    style={{
                      margin: 0,
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 9,
                      flex: '0 0 auto',
                      color: 'var(--cream)',
                      fontWeight: 400,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--display)',
                        fontSize: 'clamp(28px,5vw,34px)',
                        lineHeight: 0.9,
                        textShadow: '3px 3px 0 var(--ink)',
                      }}
                    >
                      {parseISO(dy.iso).getUTCDate()}
                    </span>
                    <span
                      style={{
                        fontWeight: 800,
                        fontSize: 12,
                        letterSpacing: '2px',
                        textShadow: '2px 2px 0 var(--ink)',
                      }}
                    >
                      {shortWeekday(dy.iso, lang as Lang)} · {shortMonth(dy.iso, lang as Lang)}
                      {dy.iso === today ? ` · ${c.today}` : ''}
                    </span>
                  </h2>
                  <div style={{ flex: 1, height: 4, background: 'var(--ink)' }} />
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,290px),1fr))',
                    gap: 'clamp(14px,2.5vw,20px)',
                  }}
                >
                  {dy.items.map((ev) => (
                    <EventCard key={ev.id} lang={lang as Lang} ev={ev} t={t} guide />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div
            style={{
              background: 'var(--grad-cream)',
              border: '4px solid var(--ink)',
              boxShadow: '7px 7px 0 var(--ink)',
              padding: 'clamp(20px,4vw,30px)',
              textAlign: 'center',
              fontWeight: 800,
              fontSize: 'clamp(15px,3.8vw,18px)',
              lineHeight: 1.45,
              textWrap: 'balance',
            }}
          >
            {c.empty}
          </div>
        )}

        <Link
          href={routes.events(lang as Lang)}
          className={s.chip}
          style={{
            textDecoration: 'none',
            color: 'var(--ink)',
            alignSelf: 'center',
            display: 'inline-flex',
            alignItems: 'center',
            fontFamily: 'var(--display)',
            fontSize: 18,
            padding: '12px 18px 9px',
            border: '4px solid var(--ink)',
            background: 'var(--yellow)',
            boxShadow: '5px 5px 0 var(--ink)',
          }}
        >
          {t('SEE ALL EVENTS →')}
        </Link>
      </main>
    </PageShell>
  )
}
