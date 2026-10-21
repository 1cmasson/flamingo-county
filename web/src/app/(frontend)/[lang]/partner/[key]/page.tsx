import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '../../../../../payload.config'
import { isLang, type Lang } from '../../../../../i18n'
import { dateOnly } from '../../../../../lib/dates'
import { displayCode, formatRedeemed, partnerDashboard } from '../../../../../lib/promos'
import { dayLabel, promoCopy } from '../../../../../lib/promoCopy'
import { PageShell } from '../../../../../components/PageShell'
import s from '../../../../../components/promo.module.css'

/**
 * A partner business's coupon dashboard (lib/promos.ts): taken, used, from
 * where, and the last ones used. The key in the URL is the only lock, like a
 * private document link, so the page is never indexed, robots.txt closes it,
 * it sends no referrer, and the visit counter stores it without the key
 * (lib/visits.ts `normalizePath`). A wrong key is a plain 404.
 *
 * No PIN here: a forwarded link must not hand out the way to mark coupons used.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  return {
    title: isLang(lang) ? promoCopy(lang).dashTitle : undefined,
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

export default async function PartnerPage({ params }: { params: Promise<{ lang: string; key: string }> }) {
  const { lang, key } = await params
  if (!isLang(lang)) notFound()
  const payload = await getPayload({ config })
  const dash = await partnerDashboard(payload, key, lang as Lang)
  if (!dash) notFound()
  const c = promoCopy(lang as Lang)
  const L = lang as Lang

  const tiles = [
    { label: c.taken, value: dash.totals.taken },
    { label: c.usedCount, value: dash.totals.used },
    { label: c.week, value: dash.totals.usedThisWeek },
    { label: c.today, value: dash.totals.usedToday },
  ]

  return (
    <PageShell>
      <main className={`${s.page} ${s.wide}`}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className={s.kicker}>FLAMINGO COUNTY</p>
          <h1 className={s.title}>
            {c.dashTitle} · {dash.listing?.name ?? dash.partner.name}
          </h1>
          <p className={s.warn}>{c.dashPrivate}</p>
        </header>

        <section className={s.stats} aria-label={c.dashTitle}>
          {tiles.map((t) => (
            <div key={t.label} className={s.stat}>
              <span className={s.statValue}>{t.value}</span>
              <span className={s.statLabel}>{t.label}</span>
            </div>
          ))}
        </section>

        <section className={`${s.card} ${s.body}`}>
          <h2 className={s.h2}>{c.promotions}</h2>
          {dash.promotions.length ? (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">{c.dashTitle}</th>
                    <th scope="col" className={s.num}>
                      {c.taken}
                    </th>
                    <th scope="col" className={s.num}>
                      {c.usedCount}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dash.promotions.map(({ promotion, state, stats }) => {
                    const end = dateOnly(promotion.endsOn)
                    return (
                      <tr key={promotion.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span>{promotion.title}</span>
                            <span>
                              <span className={`${s.pill} ${state === 'active' ? s.pillOn : ''}`}>{c.state[state]}</span>
                              {end ? <span style={{ marginLeft: 8, fontSize: 13 }}>{c.through(dayLabel(end, L))}</span> : null}
                            </span>
                          </div>
                        </td>
                        <td className={s.num}>
                          {stats.taken}
                          {promotion.limit ? ` / ${promotion.limit}` : ''}
                        </td>
                        <td className={s.num}>{stats.used}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={s.note}>{c.none}</p>
          )}
        </section>

        {dash.sources.length ? (
          <section className={`${s.card} ${s.body}`}>
            <h2 className={s.h2}>{c.sources}</h2>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col" aria-label={c.sources} />
                  <th scope="col" className={s.num}>
                    {c.taken}
                  </th>
                  <th scope="col" className={s.num}>
                    {c.usedCount}
                  </th>
                </tr>
              </thead>
              <tbody>
                {dash.sources.map((row) => (
                  <tr key={row.source}>
                    <td>{c.source(row.source)}</td>
                    <td className={s.num}>{row.taken}</td>
                    <td className={s.num}>{row.used}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className={`${s.card} ${s.body}`}>
          <h2 className={s.h2}>{c.recent}</h2>
          {dash.recent.length ? (
            <div className={s.scroll}>
              <table className={s.table}>
                <tbody>
                  {dash.recent.map((r) => (
                    <tr key={r.code}>
                      <td className={s.mono}>{displayCode(r.code)}</td>
                      <td>{r.promotion}</td>
                      <td className={s.num}>{formatRedeemed(r.redeemedAt, L)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={s.note}>{c.noneUsed}</p>
          )}
        </section>

        <section className={`${s.card} ${s.body}`}>
          <h2 className={s.h2}>{c.howTitle}</h2>
          <ol className={s.steps}>
            {c.how.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className={s.note}>{c.pinHelp}</p>
        </section>
      </main>
    </PageShell>
  )
}
