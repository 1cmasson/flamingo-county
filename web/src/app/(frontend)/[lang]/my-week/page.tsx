import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes } from '../../../../lib/routes'
import { getEvents, rel } from '../../../../lib/data'
import { dateOnly, parseISO, shortMonth, shortWeekday } from '../../../../lib/dates'
import type { EventKind } from '../../../../payload-types'
import { PageShell } from '../../../../components/PageShell'
import { eventVenue } from '../../../../components/EventCard'
import { MyWeekList, type SavedEvent } from '../../../../components/MyWeekList'

export const metadata: Metadata = {
  // Saved events are per-device, so there is nothing here for a crawler.
  robots: { index: false, follow: true },
}

export default async function MyWeekPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const t = translator(lang as Lang)

  // The saved set lives in localStorage, which the server cannot read, so every
  // event is passed down as flat data and the client picks. At this size that
  // is cheaper than an API round trip after hydration — and it means the list
  // renders in one paint rather than popping in.
  const all = await getEvents(lang)
  const events: SavedEvent[] = all.map((ev) => {
    const iso = dateOnly(ev.date)
    const kind = rel<EventKind>(ev.kind)
    const { name, city } = eventVenue(ev)
    return {
      slug: ev.slug,
      title: ev.title ?? '',
      iso,
      day: parseISO(iso).getUTCDate(),
      weekday: shortWeekday(iso, lang),
      month: shortMonth(iso, lang),
      time: ev.timeLabel ?? '',
      venue: name,
      cityName: city?.name ?? '',
      kindLabel: kind?.label ?? '',
      kindBg: kind?.bg ?? 'var(--grad-pink)',
      kindInk: kind?.ink ?? '#FFF6E5',
      href: routes.event(lang, ev.slug),
      icsHref: routes.eventIcs(lang, ev.slug),
    }
  })

  const es = lang === 'es'

  return (
    <PageShell>
      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: 'clamp(16px,4vw,26px) clamp(12px,3.5vw,22px) 70px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(18px,3vw,24px)',
        }}
      >
        <header
          style={{
            background: 'var(--ink)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--cream)',
            padding: 'clamp(18px,4vw,32px)',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: 'var(--yellow)',
              color: 'var(--ink)',
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: '2px',
              padding: '6px 10px',
            }}
          >
            {t('MY WEEK')}
          </div>
          <h1
            style={{
              margin: '12px 0 0',
              fontFamily: 'var(--display)',
              fontSize: 'clamp(32px,8vw,64px)',
              lineHeight: 0.9,
              color: 'var(--cream)',
              textWrap: 'balance',
            }}
          >
            {es ? 'TU SEMANA GUARDADA' : 'YOUR SAVED WEEK'}
          </h1>
          <p
            style={{
              margin: '16px 0 0',
              maxWidth: '58ch',
              color: 'var(--cream)',
              fontWeight: 600,
              fontSize: 'clamp(15px,3.6vw,17px)',
              lineHeight: 1.55,
              textWrap: 'pretty',
            }}
          >
            {es
              ? 'Todo lo que guardaste de la pizarra de eventos, en orden de fecha. Guardado en este dispositivo — una cuenta de socio lo guarda en todos.'
              : 'Everything you saved from the events board, in date order. Saved on this device — a member account keeps it everywhere.'}
          </p>
        </header>

        <MyWeekList
          lang={lang}
          events={events}
          t={{
            emptyH: es ? 'TODAVÍA NO HAY NADA GUARDADO.' : 'NOTHING SAVED YET.',
            emptyP: es
              ? 'Dale a + MI SEMANA en cualquier evento y aparece aquí con la fecha, el lugar y el archivo de calendario.'
              : 'Hit + MY WEEK on any event and it lands here with the date, the venue and a calendar file.',
            browse: es ? 'VER LOS EVENTOS →' : 'BROWSE THE EVENTS →',
            saved: t('IN MY WEEK'),
            going: t('GOING'),
            addCal: t('+ CALENDAR'),
          }}
        />
      </main>
    </PageShell>
  )
}
