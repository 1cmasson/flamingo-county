import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter, Link, SetStepNav } from '@payloadcms/ui'
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import { formatAdminURL } from 'payload/shared'
import type { ReactNode } from 'react'

import { miamiTime } from '../../lib/hq'
import { loadHqDashboard, type Metric } from '../../lib/hqDashboard'
import './hq-dashboard.scss'

const nf = new Intl.NumberFormat('en-US')
const base = 'hq-dash'

/**
 * `/admin/hq`: the owner's overview of HQ, read-only, every row a link to its
 * record. Built for the phone first.
 *
 * Payload does not guard a custom admin view: the login redirect in its root
 * page skips any path registered under `admin.components.views`, and a new
 * view gets no template. So this view checks the admin session itself and
 * wraps itself in the default template (nav and header).
 */
export async function HqDashboard({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions, visibleEntities, locale } = initPageResult
  const { payload, user, i18n } = req
  const adminRoute = payload.config.routes.admin
  const at = (path: string) => formatAdminURL({ adminRoute, path: path as `/${string}` })

  if (!user || !permissions?.canAccessAdmin) {
    const login = at(payload.config.admin.routes.login)
    redirect(`${login}?redirect=${encodeURIComponent(at('/hq'))}`)
  }

  const now = new Date()
  const d = await loadHqDashboard(payload, now)

  return (
    <DefaultTemplate
      i18n={i18n}
      locale={locale}
      params={params}
      payload={payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user}
      viewType="hq"
      visibleEntities={{
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <SetStepNav nav={[{ label: 'HQ' }]} />
      <Gutter className={base}>
        <header className={`${base}__head`}>
          <h1>Flamingo HQ</h1>
          <p className={`${base}__sub`}>Read-only. Times are Miami. As of {miamiTime(now)}.</p>
        </header>

        <nav aria-label="Waiting on you" className={`${base}__stats`}>
          <Stat count={d.inbox.count} href={at(d.inbox.href)} label="new in the inbox" />
          <Stat count={d.tasks.count} href={at(d.tasks.href)} label="open tasks" />
          <Stat count={d.drafts.count} href={at(d.drafts.href)} label="posts to approve" />
          <Stat
            count={d.publishRequests.count}
            href={at(d.publishRequests.href)}
            label="publish requests"
          />
        </nav>

        <div className={`${base}__grid`}>
          <Section count={d.inbox.count} empty="Nothing new." href={at(d.inbox.href)} title="Inbox">
            {d.inbox.items.map((e) => (
              <Row href={at(e.href)} key={e.id} meta={`${e.type} · ${e.at}`}>
                {e.summary}
              </Row>
            ))}
          </Section>

          <Section
            count={d.tasks.count}
            empty="No open tasks."
            href={at(d.tasks.href)}
            title="Open tasks"
          >
            {d.tasks.items.map((t) => (
              <Row
                href={at(t.href)}
                key={t.id}
                meta={
                  <>
                    {t.due ? (
                      <span className={t.overdue ? `${base}__late` : undefined}>
                        {t.overdue ? 'Overdue: ' : 'Due '}
                        {t.due}
                      </span>
                    ) : (
                      'No due date'
                    )}
                    {t.doing && ' · doing'}
                  </>
                }
              >
                {t.claude && (
                  <span aria-label="Assigned to Claude" role="img" title="Assigned to Claude">
                    🤖{' '}
                  </span>
                )}
                {t.title}
              </Row>
            ))}
          </Section>

          <Section
            count={d.drafts.count}
            empty="No posts waiting."
            href={at(d.drafts.href)}
            title="Posts to approve"
          >
            {d.drafts.items.map((p) => (
              <Row
                href={at(p.href)}
                key={p.id}
                lead={
                  p.cover ? (
                    p.cover.video ? (
                      <span className={`${base}__thumb ${base}__thumb--video`}>▶</span>
                    ) : (
                      // Staff-only file: the browser sends the admin's cookie.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" className={`${base}__thumb`} loading="lazy" src={p.cover.url} />
                    )
                  ) : (
                    <span className={`${base}__thumb ${base}__thumb--none`}>Aa</span>
                  )
                }
                meta={`${platformList(p.platforms)} · ${p.when}`}
              >
                {p.caption}
              </Row>
            ))}
          </Section>

          <Section
            count={d.publishRequests.count}
            empty="No publish requests."
            href={at(d.publishRequests.href)}
            note="Publish or reject from Telegram."
            title="Publish requests"
          >
            {d.publishRequests.items.map((r) => (
              <Row
                href={at(r.href)}
                key={r.id}
                meta={`${r.collection} · asked ${r.at}${r.expires ? ` · expires ${r.expires}` : ''}`}
              >
                {r.title}
              </Row>
            ))}
          </Section>

          <Section
            count={d.listingRequests.count}
            empty="No new requests."
            href={at(d.listingRequests.href)}
            title="Requests"
          >
            {d.listingRequests.items.map((r) => (
              <Row href={at(r.href)} key={r.id} meta={`${r.kind} · ${r.at}`}>
                {r.business}
              </Row>
            ))}
          </Section>

          <Section
            empty="Nothing scheduled in the next 7 days."
            href={at(d.upcoming.href)}
            title="Next 7 days"
          >
            {d.upcoming.items.map((p) => (
              <Row href={at(p.href)} key={p.id} meta={`${p.when} · ${platformList(p.platforms)}`}>
                {p.caption}
              </Row>
            ))}
          </Section>

          <Section
            empty="No posts went out in the last 7 days."
            extra={
              d.week.clicks.bySource.length > 0 && (
                <div className={`${base}__chips`}>
                  {d.week.clicks.bySource.map((s) => (
                    <Link
                      className={`${base}__chip`}
                      href={at(s.href)}
                      key={s.source}
                      prefetch={false}
                    >
                      {s.source} <b>{nf.format(s.count)}</b>
                    </Link>
                  ))}
                </div>
              )
            }
            href={at(d.week.clicks.href)}
            hrefLabel="All clicks"
            note={
              d.week.clicks.total
                ? `/go clicks: ${nf.format(d.week.clicks.total)} in all`
                : 'No /go clicks in the last 7 days.'
            }
            title="Last 7 days"
            wide
          >
            {d.week.posts.map((p) => (
              <Row
                href={at(p.href)}
                key={p.id}
                meta={
                  <>
                    {p.published ?? 'not out yet'} · {nf.format(p.clicks)} click
                    {p.clicks === 1 ? '' : 's'}
                    {p.results.length === 0 && ' · no numbers yet'}
                    {p.results.map((r) => (
                      <span className={`${base}__result`} key={r.platform}>
                        {platformName(r.platform)} at {r.checkpoint}:{' '}
                        <Metrics metrics={r.metrics} />
                      </span>
                    ))}
                  </>
                }
              >
                {p.caption}
              </Row>
            ))}
          </Section>

          <Section
            empty="No account snapshots yet."
            href={at('/collections/hq-social-stats?where[kind][equals]=channel')}
            hrefLabel="History"
            title="Accounts"
            wide
          >
            {d.accounts.map((a) => (
              <li key={a.platform}>
                <Link className={`${base}__account`} href={at(a.href)} prefetch={false}>
                  <span className={`${base}__account-name`}>
                    {platformName(a.platform)}
                    <span className={`${base}__meta`}>{a.at}</span>
                  </span>
                  <dl className={`${base}__numbers`}>
                    {a.metrics.map((m) => (
                      <div key={m.label}>
                        <dt>{m.label}</dt>
                        <dd>
                          {nf.format(Math.round(m.value))}
                          {m.window === '7d' && (
                            <span className={`${base}__window`} title="Total over the last 7 days">
                              {' '}
                              in 7 days
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            ))}
          </Section>
        </div>
      </Gutter>
    </DefaultTemplate>
  )
}

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}
const platformName = (p: string) => PLATFORM_NAMES[p] ?? p

function platformList(platforms: string[]): string {
  return platforms.length ? platforms.map(platformName).join(', ') : 'no platform'
}

function Stat({ count, href, label }: { count: number; href: string; label: string }) {
  return (
    <Link
      className={`${base}__stat${count ? ` ${base}__stat--on` : ''}`}
      href={href}
      prefetch={false}
    >
      <span className={`${base}__stat-n`}>{nf.format(count)}</span>
      <span className={`${base}__stat-label`}>{label}</span>
    </Link>
  )
}

function Section({
  children,
  count,
  empty,
  extra,
  href,
  hrefLabel = 'View all',
  note,
  title,
  wide,
}: {
  children: ReactNode[] | ReactNode
  count?: number
  empty: string
  extra?: ReactNode
  href?: string
  hrefLabel?: string
  note?: string
  title: string
  wide?: boolean
}) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean)
  return (
    <section className={`${base}__card${wide ? ` ${base}__card--wide` : ''}`}>
      <div className={`${base}__card-head`}>
        <h2>
          {title}
          {count !== undefined && <span className={`${base}__count`}>{nf.format(count)}</span>}
        </h2>
        {href && (
          <Link className={`${base}__all`} href={href} prefetch={false}>
            {hrefLabel}
          </Link>
        )}
      </div>
      {note && <p className={`${base}__note`}>{note}</p>}
      {extra}
      {items.length ? (
        <ul className={`${base}__list`}>{items}</ul>
      ) : (
        <p className={`${base}__empty`}>{empty}</p>
      )}
    </section>
  )
}

function Row({
  children,
  href,
  lead,
  meta,
}: {
  children: ReactNode
  href: string
  lead?: ReactNode
  meta?: ReactNode
}) {
  return (
    <li>
      <Link className={`${base}__row`} href={href} prefetch={false}>
        {lead}
        <span className={`${base}__row-body`}>
          <span className={`${base}__row-title`}>{children}</span>
          {meta && <span className={`${base}__meta`}>{meta}</span>}
        </span>
      </Link>
    </li>
  )
}

function Metrics({ metrics }: { metrics: Metric[] }) {
  if (!metrics.length) return <>no numbers</>
  return <>{metrics.map((m) => `${m.label} ${nf.format(Math.round(m.value))}`).join(' · ')}</>
}
