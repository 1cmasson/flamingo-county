import type { Payload } from 'payload'

import type { HqEvent } from '../payload-types'
import { miamiHour } from './brief'
import { agendaSection, miamiMidnight, readAgenda } from './calendar'
import { addDays, SITE_TZ, todayISO } from './dates'
import { miamiTime, recordEvent } from './hq'
import { esc, sendMessage, telegramConfigured } from './telegram'

/**
 * The evening wrap-up: what happened today, what is due tomorrow, and what is
 * still waiting on the owner. The morning brief's counterpart at 8 PM Miami.
 *
 * "Today" is the Miami calendar day, midnight to now, not "since the last
 * wrap", so the wrap never depends on its own log rows; and the brief counts
 * only from `brief.sent`, so sending a wrap does not move the brief's window.
 */

const RECENT_LINES = 8
const TASK_LINES = 10

/**
 * Whether an hourly wrap run should actually send: only the one in the 8 PM
 * hour on a Miami clock, whatever zone the server runs in. See
 * src/jobs/eveningWrap.ts.
 */
export function isWrapHour(now: Date = new Date()): boolean {
  return miamiHour(now) === 20
}

export async function buildWrap(payload: Payload, now: Date = new Date()): Promise<string> {
  const today = todayISO(now)
  const tomorrow = addDays(today, 1)
  const dayStart = miamiMidnight(today)
  const tomorrowEnd = miamiMidnight(addDays(today, 2))

  const [events, due, pendingDrafts, pendingPublish, agenda] = await Promise.all([
    payload.find({
      collection: 'hq-events',
      where: {
        and: [
          { createdAt: { greater_than_equal: dayStart.toISOString() } },
          { type: { not_in: ['brief.sent', 'wrap.sent'] } },
        ],
      },
      sort: '-createdAt',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    }),
    // Open tasks due by the end of tomorrow, which includes anything overdue.
    payload.find({
      collection: 'hq-tasks',
      where: {
        and: [{ status: { not_equals: 'done' } }, { dueAt: { less_than: tomorrowEnd.toISOString() } }],
      },
      sort: 'dueAt',
      limit: TASK_LINES + 1,
      depth: 0,
      overrideAccess: true,
    }),
    payload.count({ collection: 'hq-social-drafts', where: { status: { equals: 'pending' } }, overrideAccess: true }),
    payload.count({
      collection: 'hq-publish-requests',
      where: { status: { equals: 'pending' } },
      overrideAccess: true,
    }),
    readAgenda([tomorrow]),
  ])

  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const out: string[] = [`<b>🌙 Flamingo HQ wrap-up — ${esc(date)}</b>`, '']

  out.push('<b>Today</b>')
  if (!events.docs.length) {
    out.push('Quiet — nothing new.')
  } else {
    const byType = new Map<string, number>()
    for (const e of events.docs) byType.set(e.type, (byType.get(e.type) ?? 0) + 1)
    out.push([...byType].map(([t, n]) => `${esc(t)} ×${n}`).join(' · '))
    for (const e of events.docs.slice(0, RECENT_LINES) as HqEvent[]) out.push(`• ${esc(e.summary)}`)
    if (events.docs.length > RECENT_LINES) out.push(`<i>…and ${events.docs.length - RECENT_LINES} more in the admin</i>`)
  }

  out.push('', '<b>Due by tomorrow</b>')
  if (!due.docs.length) out.push('No tasks due.')
  for (const t of due.docs.slice(0, TASK_LINES)) {
    const late = t.dueAt && new Date(t.dueAt) < now ? ' ⚠️ overdue' : ''
    const who = t.assignee === 'claude' ? ' 🤖' : ''
    out.push(`• ${esc(t.title)}${who} — ${esc(miamiTime(t.dueAt!))}${late}`)
  }
  if (due.docs.length > TASK_LINES) out.push('<i>…and more in the admin</i>')

  const calendar = agendaSection('Tomorrow', agenda, tomorrow)
  if (calendar.length) out.push('', ...calendar)

  out.push('', '<b>Waiting on you</b>')
  const drafts = pendingDrafts.totalDocs
  const publish = pendingPublish.totalDocs
  const waiting = [
    drafts && `${drafts} social draft${drafts === 1 ? '' : 's'} to approve`,
    publish && `${publish} site draft${publish === 1 ? '' : 's'} to publish`,
  ].filter(Boolean)
  out.push(waiting.length ? waiting.map((w) => `• ${w}`).join('\n') : 'Nothing. 🎉')

  return out.join('\n')
}

/**
 * Build and send the wrap, then log `wrap.sent`. Returns false, without
 * logging, when Telegram is not set up.
 */
export async function sendWrap(payload: Payload, now: Date = new Date()): Promise<boolean> {
  if (!telegramConfigured()) return false
  await sendMessage(await buildWrap(payload, now))
  await recordEvent(payload, { type: 'wrap.sent', summary: `Wrap sent ${miamiTime(now)}` })
  return true
}
