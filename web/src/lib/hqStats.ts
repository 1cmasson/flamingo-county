import type { Payload, Where } from 'payload'

import type { HqLead } from '../payload-types'
import { currentPollSlug, getPublishedPoll, pollPhase, pollTally, siteVotesFor } from './storyPolls'
import { esc } from './telegram'
import type { Out } from './whatsapp'

/**
 * The owner's numbers in one answer (owner, Nov 19: "how do I know if promo
 * messages are coming in, or if anyone's voting, or if we're even tracking
 * numbers?"): the current vote, WhatsApp vote sign-ups, the WhatsApp line's
 * leads and the partner coupons, each for the last 7 days.
 *
 * Read-only. Staff and test rows are left out everywhere, like every other
 * count in HQ. The same numbers go to Telegram (/stats, HTML) and to the
 * owner's own WhatsApp ("stats", plain text with tap buttons), so neither
 * channel knows something the other doesn't.
 */

const WEEK_MS = 7 * 86_400_000

export type HqStats = {
  poll: {
    title: string
    phase: 'upcoming' | 'open' | 'closed'
    total: number
    options: { title: string; n: number }[]
    bySource: Record<string, number>
  } | null
  optins: { active: number; newThisWeek: number }
  leads: { total: number; newThisWeek: number; waiting: number; byStatus: Partial<Record<HqLead['status'], number>>; bySource: Record<string, number> }
  coupons: { takenThisWeek: number; usedThisWeek: number }
}

const notTest: Where = { test: { not_equals: true } }

async function count(payload: Payload, collection: 'vote-whatsapp-optins' | 'hq-leads' | 'promo-coupons', where: Where): Promise<number> {
  const { totalDocs } = await payload.count({ collection, where: { and: [notTest, where] }, overrideAccess: true })
  return totalDocs
}

function tallyBy<T>(rows: T[], key: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) {
    const k = key(r) || 'direct'
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

async function pollStats(payload: Payload, now: Date): Promise<HqStats['poll']> {
  const slug = await currentPollSlug(payload, now.getTime())
  if (!slug) return null
  const poll = await getPublishedPoll(payload, slug, 'es')
  if (!poll) return null
  const tally = pollTally(poll, await siteVotesFor(payload, poll.id))
  const { docs } = await payload.find({
    collection: 'story-poll-votes',
    where: { and: [{ poll: { equals: poll.id } }, notTest] },
    select: { source: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return {
    title: poll.title,
    phase: pollPhase(poll, now.getTime()),
    total: tally.total,
    options: (poll.options ?? []).map((o) => ({ title: o.title, n: tally.counts[o.key] ?? 0 })),
    bySource: tallyBy(docs, (v) => v.source),
  }
}

export async function hqStats(payload: Payload, now: Date = new Date()): Promise<HqStats> {
  const since = new Date(now.getTime() - WEEK_MS).toISOString()
  const [poll, active, newOptins, leadDocs, taken, used] = await Promise.all([
    pollStats(payload, now),
    count(payload, 'vote-whatsapp-optins', { status: { equals: 'active' } }),
    count(payload, 'vote-whatsapp-optins', { createdAt: { greater_than_equal: since } }),
    payload.find({
      collection: 'hq-leads',
      where: notTest,
      select: { status: true, source: true, createdAt: true },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    count(payload, 'promo-coupons', { createdAt: { greater_than_equal: since } }),
    count(payload, 'promo-coupons', { redeemedAt: { greater_than_equal: since } }),
  ])
  const leads = leadDocs.docs
  const fresh = leads.filter((l) => l.createdAt >= since)
  return {
    poll,
    optins: { active, newThisWeek: newOptins },
    leads: {
      total: leads.length,
      newThisWeek: fresh.length,
      waiting: leads.filter((l) => l.status === 'ready' || l.status === 'handoff').length,
      byStatus: tallyBy(leads, (l) => l.status) as HqStats['leads']['byStatus'],
      bySource: tallyBy(fresh, (l) => l.source),
    },
    coupons: { takenThisWeek: taken, usedThisWeek: used },
  }
}

/* ------------------------------------------------------------- the words */

const sources = (m: Record<string, number>) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')

const PHASE = { upcoming: 'abre pronto', open: 'abierta', closed: 'cerrada' } as const

/**
 * The summary. `html` for Telegram (escaped, <b>), otherwise WhatsApp's
 * plain text with *bold*.
 */
export function statsText(s: HqStats, html: boolean): string {
  const e = html ? esc : (v: unknown) => String(v)
  const b = (t: string) => (html ? `<b>${t}</b>` : `*${t}*`)
  const lines = [b('📊 Últimos 7 días')]
  if (s.poll) {
    const src = sources(s.poll.bySource)
    lines.push(`🗳️ Votación (${PHASE[s.poll.phase]}): ${s.poll.total} voto${s.poll.total === 1 ? '' : 's'}${src ? ` · ${e(src)}` : ''}`)
  } else {
    lines.push('🗳️ Votación: ninguna publicada')
  }
  lines.push(`📲 WhatsApp de la votación: ${s.optins.active} suscrito${s.optins.active === 1 ? '' : 's'} · ${s.optins.newThisWeek} nuevo${s.optins.newThisWeek === 1 ? '' : 's'}`)
  const leadSrc = sources(s.leads.bySource)
  lines.push(
    `🏥 Pedidos La Capital: ${s.leads.newThisWeek} nuevo${s.leads.newThisWeek === 1 ? '' : 's'} · ${s.leads.waiting} esperando · ${s.leads.total} en total${leadSrc ? ` · ${e(leadSrc)}` : ''}`,
  )
  const vis = s.leads.byStatus
  if (s.leads.total) lines.push(`   llamados ${vis.called ?? 0} · vinieron ${vis.visited ?? 0} · no vinieron ${vis['no-show'] ?? 0}`)
  lines.push(`🎟️ Cupones: ${s.coupons.takenThisWeek} sacado${s.coupons.takenThisWeek === 1 ? '' : 's'} · ${s.coupons.usedThisWeek} usado${s.coupons.usedThisWeek === 1 ? '' : 's'}`)
  return lines.join('\n')
}

/** The current vote's split, option by option. */
export function votesText(s: HqStats, html: boolean): string {
  const e = html ? esc : (v: unknown) => String(v)
  const b = (t: string) => (html ? `<b>${t}</b>` : `*${t}*`)
  if (!s.poll) return 'No hay votación publicada.'
  const pct = (n: number) => (s.poll!.total ? Math.round((100 * n) / s.poll!.total) : 0)
  return [
    b(`🗳️ ${e(s.poll.title)}`),
    `${PHASE[s.poll.phase]} · ${s.poll.total} voto${s.poll.total === 1 ? '' : 's'}`,
    '',
    ...s.poll.options.map((o) => `• ${e(o.title)}: ${o.n} (${pct(o.n)}%)`),
  ].join('\n')
}

/* ------------------------------------------------- the owner's WhatsApp */

/** The owner's own WhatsApp numbers (OWNER_WHATSAPP, comma-separated). Only these get the numbers. */
export function ownerWhatsapp(): string[] {
  return (process.env.OWNER_WHATSAPP ?? '')
    .split(',')
    .map((n) => n.replace(/[^\d+]/g, ''))
    .map((n) => (n.startsWith('+') ? n : `+${n.length === 10 ? `1${n}` : n}`))
    .filter((n) => n.length > 8)
}

export const isOwnerWhatsapp = (phone: string) => ownerWhatsapp().includes(phone)

const STATS_WORDS = /^(stats?|estadisticas?|numeros|resumen|\/stats)$/

/** Whether an owner's message asks for the numbers: the word, or one of the buttons below. */
export function asksForStats(body: string, button: string | null): boolean {
  if (button) return button.startsWith('st:')
  const t = body
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
  return STATS_WORDS.test(t)
}

const BUTTONS = [
  { id: 'st:sum', title: 'Resumen' },
  { id: 'st:votes', title: 'Votos' },
  { id: 'st:leads', title: 'Pedidos' },
]

/** The answer to the owner on WhatsApp. `leadsText` is the /leads report as plain text. */
export async function ownerStatsOuts(payload: Payload, button: string | null, leadsText: () => Promise<string>, now: Date = new Date()): Promise<Out[]> {
  if (button === 'st:leads') return [{ text: (await leadsText()).slice(0, 1000), buttons: BUTTONS }]
  const s = await hqStats(payload, now)
  return [{ text: button === 'st:votes' ? votesText(s, false) : statsText(s, false), buttons: BUTTONS }]
}
