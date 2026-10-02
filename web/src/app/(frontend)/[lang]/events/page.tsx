import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang, translator, type Lang } from '../../../../i18n'
import { routes, withQuery } from '../../../../lib/routes'
import { getEvents, getWeeklyEvents, rel } from '../../../../lib/data'
import {
  addDays,
  BUCKET_LABEL,
  dateOnly,
  eventDaysIn,
  eventRunEnd,
  groupIntoBuckets,
  isStillOn,
  monthGrid,
  monthTitle,
  parseISO,
  rangeLabel,
  shortMonth,
  shortWeekday,
  todayISO,
  weekdayHeadings,
} from '../../../../lib/dates'
import type { City, Event, EventKind, Listing } from '../../../../payload-types'
import { PageShell } from '../../../../components/PageShell'
import { EventCard } from '../../../../components/EventCard'
import s from '../../../../components/chrome.module.css'

type Search = { view?: string; month?: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = await params
  if (!isLang(lang)) return {}
  const t = translator(lang)
  return {
    title: `${t('THIS WEEK')} ${t('AROUND HERE.')}`,
    description: t(
      'Every domino table, live band, watch party and city day worth leaving the house for. Partners post theirs — the city ones we hunt down ourselves.',
    ),
    alternates: {
      canonical: routes.events(lang),
      languages: { en: routes.events('en'), es: routes.events('es') },
    },
  }
}

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<Search>
}) {
  const { lang } = await params
  if (!isLang(lang)) notFound()
  const sp = await searchParams
  const t = translator(lang as Lang)

  const calendar = sp.view === 'cal'

  const [all, weekly] = await Promise.all([getEvents(lang), getWeeklyEvents(lang)])

  const today = todayISO()

  // Finished events drop off, which is what the source's first bucket starting
  // at its frozen "today" did. It makes the count time-varying, correctly.
  // "Finished" is the last day, not the first: a multi-day exhibit that opened
  // last month stays on the board until it closes.
  const upcoming = all.filter((ev) => isStillOn(ev, today))

  // LIST/CALENDAR is a view mode, not a filter — it stayed when the city and
  // kind chips came off.
  const evHref = (over: Partial<Search>) =>
    withQuery(routes.events(lang), { view: calendar ? 'cal' : undefined, ...over })

  // A running event is in every bucket its run overlaps, once each, under the
  // first day of the overlap. Bucket counts can therefore sum to more than the
  // masthead's, which counts distinct events.
  const grouped = groupIntoBuckets(upcoming, today).map((bk) => ({
    ...bk,
    label: t(BUCKET_LABEL[bk.key]),
    sub: rangeLabel(
      bk.days.map((d) => d.iso),
      lang,
    ),
  }))

  return (
    <PageShell>
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
        {/* --- Masthead --- */}
        <header
          data-stack
          style={{
            background: 'var(--ink)',
            border: '4px solid var(--ink)',
            boxShadow: '9px 9px 0 var(--cream)',
            padding: 'clamp(16px,3.5vw,26px)',
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr',
            gap: 'clamp(16px,3vw,24px)',
            alignItems: 'end',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              {t('WHAT THE CREWS ARE DOING NEXT')}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--display)',
                fontSize: 'clamp(32px,7vw,54px)',
                lineHeight: 0.92,
                color: 'var(--cream)',
                textWrap: 'balance',
              }}
            >
              {t('THIS WEEK')}
              <br />
              <span style={{ color: 'var(--cyan)' }}>{t('AROUND HERE.')}</span>
            </h1>
            <p
              style={{
                margin: 0,
                maxWidth: '54ch',
                fontWeight: 600,
                fontSize: 15,
                lineHeight: 1.5,
                color: 'var(--cream)',
                textWrap: 'pretty',
              }}
            >
              {t(
                'Every domino table, live band, watch party and city day worth leaving the house for. Partners post theirs — the city ones we hunt down ourselves.',
              )}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <ViewTab href={evHref({ view: undefined })} on={!calendar} label={t('LIST')} />
              <ViewTab href={evHref({ view: 'cal' })} on={calendar} label={t('CALENDAR')} />
            </div>
            <div
              style={{
                background: 'var(--grad-cyan)',
                border: '4px solid var(--ink)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ fontFamily: 'var(--display)', fontSize: 26, lineHeight: 1 }}>
                {upcoming.length}
              </div>
              <div style={{ fontWeight: 800, fontSize: 10, letterSpacing: '1.6px' }}>
                {t('ON THE BOARD')}
              </div>
            </div>
          </div>
        </header>

        {calendar ? (
          <CalendarView lang={lang} events={upcoming} today={today} month={sp.month} evHref={evHref} />
        ) : grouped.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(18px,3vw,28px)' }}>
            {grouped.map((bk) => (
              <section key={bk.key} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    background: 'var(--grad-cyan)',
                    border: '4px solid var(--ink)',
                    boxShadow: '6px 6px 0 var(--ink)',
                    padding: '11px 14px 9px',
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: 'var(--display)',
                      fontSize: 'clamp(20px,4.4vw,27px)',
                      fontWeight: 400,
                      lineHeight: 1,
                    }}
                  >
                    {bk.label}
                  </h2>
                  <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.8px' }}>
                    {bk.sub}
                  </div>
                  <div
                    style={{
                      marginLeft: 'auto',
                      background: 'var(--ink)',
                      color: 'var(--yellow)',
                      fontWeight: 800,
                      fontSize: 11,
                      letterSpacing: '1.4px',
                      padding: '6px 9px',
                    }}
                  >
                    {bk.count}
                  </div>
                </div>

                {bk.days.map((dy) => (
                  <div
                    key={dy.iso}
                    id={`day-${dy.iso}`}
                    style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: 9,
                          flex: '0 0 auto',
                          color: 'var(--cream)',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'var(--display)',
                            fontSize: 'clamp(28px,5vw,34px)',
                            lineHeight: 0.9,
                            textShadow: '3px 3px 0 var(--ink)',
                          }}
                        >
                          {parseISO(dy.iso).getUTCDate()}
                        </div>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 12,
                            letterSpacing: '2px',
                            textShadow: '2px 2px 0 var(--ink)',
                          }}
                        >
                          {shortWeekday(dy.iso, lang)} · {shortMonth(dy.iso, lang)}
                        </div>
                      </div>
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
                        <EventCard key={ev.id} lang={lang} ev={ev} t={t} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : (
          <div
            style={{
              background: 'var(--grad-cream)',
              border: '4px solid var(--ink)',
              boxShadow: '7px 7px 0 var(--ink)',
              padding: 30,
              textAlign: 'center',
              fontFamily: 'var(--display)',
              fontSize: 24,
            }}
          >
            {t('NOTHING ON THE BOARD YET.')}
          </div>
        )}

        {/* --- Weekly regulars --- */}
        {weekly.length ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2
                style={{
                  margin: 0,
                  background: 'var(--ink)',
                  color: 'var(--yellow)',
                  fontFamily: 'var(--display)',
                  fontSize: 22,
                  fontWeight: 400,
                  padding: '8px 14px 5px',
                }}
              >
                {t('EVERY WEEK, LIKE CLOCKWORK')}
              </h2>
              <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.8px' }}>
                {t('THE REGULARS YOU CAN SET A WATCH BY')}
              </div>
              <div style={{ flex: 1, minWidth: 40, height: 5, background: 'var(--ink)' }} />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,230px),1fr))',
                gap: 'clamp(12px,2vw,16px)',
              }}
            >
              {weekly.map((w) => {
                const listing = rel<Listing>(w.listing)
                const city = listing ? rel<City>(listing.city) : null
                const kind = rel<EventKind>(w.kind)
                return (
                  <div
                    key={w.id}
                    style={{
                      background: 'var(--grad-cream)',
                      border: '4px solid var(--ink)',
                      boxShadow: '5px 5px 0 var(--ink)',
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div
                        style={{
                          background: 'var(--ink)',
                          color: 'var(--yellow)',
                          fontWeight: 800,
                          fontSize: 10,
                          letterSpacing: '1.4px',
                          padding: '5px 8px',
                        }}
                      >
                        {t('WEEKLY')}
                      </div>
                      <div
                        style={{
                          background: kind?.bg ?? 'var(--grad-pink)',
                          color: kind?.ink ?? 'var(--cream)',
                          border: '2px solid var(--ink)',
                          fontWeight: 800,
                          fontSize: 10,
                          letterSpacing: '1.4px',
                          padding: '5px 8px',
                        }}
                      >
                        {kind?.label}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 18, lineHeight: 1.05 }}>
                      {w.title}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.3px' }}>
                      {weekdayHeadings(lang)[Number(w.dow)]} · {w.time}
                    </div>
                    {listing && city ? (
                      <Link
                        href={routes.business(lang, city.slug, listing.slug)}
                        style={{
                          fontWeight: 800,
                          fontSize: 11,
                          letterSpacing: '1.2px',
                          color: 'var(--magenta)',
                        }}
                      >
                        {listing.name}
                      </Link>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        ) : null}
      </main>
    </PageShell>
  )
}

function ViewTab({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={s.chipPress}
      style={{
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        flex: '1 1 110px',
        fontFamily: 'var(--display)',
        fontSize: 16,
        minHeight: 46,
        padding: '11px 14px 8px',
        border: '4px solid var(--ink)',
        background: on ? 'var(--yellow)' : 'var(--grad-cream)',
        color: 'var(--ink)',
        boxShadow: '4px 4px 0 var(--pink)',
      }}
    >
      {label}
    </Link>
  )
}

/**
 * The month grid.
 *
 * The source clamped navigation to months 8 and 9 of 2026 because `MONTHNAME`
 * only had those two keys. Here the range is bounded by the events that
 * actually exist, so it stays correct as content moves.
 */
function CalendarView({
  lang,
  events,
  today,
  month,
  evHref,
}: {
  lang: Lang
  events: Event[]
  today: string
  month?: string
  evHref: (over: Partial<Search>) => string
}) {
  // Navigation runs from the earliest start to the latest last day, so the
  // month an exhibit closes in is reachable even if nothing starts there.
  const starts = events.map((e) => dateOnly(e.date)).sort()
  const ends = events.map(eventRunEnd).sort()
  const min = starts[0] ?? today
  const max = ends[ends.length - 1] ?? today

  const current = /^\d{4}-\d{2}$/.test(month ?? '') ? (month as string) : (min > today ? min : today).slice(0, 7)
  const [y, m] = current.split('-').map(Number)

  const step = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1, 12))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const prev = step(-1) >= min.slice(0, 7) ? step(-1) : null
  const next = step(1) <= max.slice(0, 7) ? step(1) : null

  // A multi-day event is drawn on every day of its run that falls in this
  // month — a banner per day is how calendars show a run, and the grid is
  // already one cell per day, so it is the small change. A past-midnight night
  // stays on its start day only (see eventDaysIn). Mid-run days before today
  // show too: the run did cover them.
  const monthFrom = `${current}-01`
  const monthTo = addDays(`${step(1)}-01`, -1)
  const byDay = new Map<string, Event[]>()
  for (const ev of events) {
    for (const d of eventDaysIn(ev, monthFrom, monthTo)) {
      byDay.set(d, [...(byDay.get(d) ?? []), ev])
    }
  }

  return (
    <section
      style={{
        background: 'var(--grad-cream)',
        border: '4px solid var(--ink)',
        boxShadow: '8px 8px 0 var(--ink)',
        padding: 'clamp(14px,3vw,20px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--display)',
            fontSize: 'clamp(22px,5vw,30px)',
            fontWeight: 400,
            lineHeight: 1,
          }}
        >
          {monthTitle(y, m, lang)}
        </h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <NavMonth href={prev ? evHref({ view: 'cal', month: prev }) : null} label="←" />
          <NavMonth href={next ? evHref({ view: 'cal', month: next }) : null} label="→" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {weekdayHeadings(lang).map((w) => (
          <div
            key={w}
            style={{ fontWeight: 800, fontSize: 10, letterSpacing: '1.4px', textAlign: 'center' }}
          >
            {w}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {monthGrid(y, m).map((iso, i) => {
          if (!iso) {
            return (
              <div
                key={`b${i}`}
                data-calday
                style={{ minHeight: 96, border: '3px solid rgba(12,15,20,0.22)' }}
              />
            )
          }
          const items = byDay.get(iso) ?? []
          const isToday = iso === today
          const more = items.length - 3
          // The list view anchors every day; +N jumps there to show the rest.
          const dayHref = `${evHref({ view: undefined })}#day-${iso}`
          return (
            <div
              key={iso}
              data-calday
              style={{
                position: 'relative',
                minHeight: 96,
                minWidth: 0,
                border: '3px solid var(--ink)',
                background: isToday ? 'var(--yellow)' : 'var(--grad-cream)',
                padding: 5,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                opacity: items.length ? 1 : 0.72,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12 }}>{parseISO(iso).getUTCDate()}</div>
              {/* One banner per event, Teams-style. On a phone the cell is
                  too narrow for more than one, so the rest collapse to +N
                  (see [data-calbanner] in globals.css). */}
              {items.map((ev, n) => {
                const kind = rel<EventKind>(ev.kind)
                return (
                  <Link
                    key={ev.id}
                    href={routes.event(lang, ev.slug)}
                    data-calbanner={n}
                    title={ev.title}
                    style={{
                      display: n < 3 ? 'block' : 'none',
                      minWidth: 0,
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      fontWeight: 800,
                      fontSize: 10,
                      lineHeight: 1.25,
                      letterSpacing: '0.2px',
                      padding: '2px 4px',
                      background: kind?.bg ?? 'var(--grad-pink)',
                      color: kind?.ink ?? 'var(--cream)',
                      border: '2px solid var(--ink)',
                      borderLeftWidth: 4,
                    }}
                  >
                    {ev.startTime ? <span data-caltime>{ev.startTime} </span> : null}
                    {ev.title}
                  </Link>
                )
              })}
              {more > 0 ? (
                <Link data-calmore href={dayHref} style={{ fontWeight: 800, fontSize: 10 }}>
                  +{more}
                </Link>
              ) : null}
              {items.length > 1 ? (
                <Link
                  data-calmoremobile
                  href={dayHref}
                  style={{ display: 'none', fontWeight: 800, fontSize: 9 }}
                >
                  +{items.length - 1}
                </Link>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function NavMonth({ href, label }: { href: string | null; label: string }) {
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 40,
    fontFamily: 'var(--display)',
    fontSize: 18,
    border: '3px solid var(--ink)',
    background: 'var(--grad-cream)',
    color: 'var(--ink)',
    boxShadow: '3px 3px 0 var(--ink)',
  } as const
  if (!href) return <span style={{ ...style, opacity: 0.35 }}>{label}</span>
  return (
    <Link href={href} className={s.chipPress} style={style}>
      {label}
    </Link>
  )
}
