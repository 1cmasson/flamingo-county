import type { HqCommentCampaign } from '../payload-types'
import { esc, notifyOwner } from './telegram'

/**
 * The parts of the comment-DM feature a collection needs (lib/commentDm.ts
 * has the job): what a DM may say, and the owner's pings when a campaign is
 * switched on or off. Kept apart from the job so the collection does not pull
 * in the Graph client.
 */

/**
 * A DM is a thank-you and one question. No link (it reads as spam and Meta
 * flags it), no price (owner rule: none, ever), and no offer of drinks or
 * anything free. Returns the problem, or null.
 */
export function dmTextProblem(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'Write the DM.'
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|me|ly|app|link|bio)\b/i.test(value)) return 'No links in the DM.'
  if (
    /\b(gratis|free|botellas?|bottles?|champ[aá]n|champagne|alcohol|tragos?|drinks?|shots?|descuentos?|discounts?|precios?|prices?|cover)\b/i.test(
      value,
    )
  ) {
    return 'No offers, prices or drinks in the DM: a thank-you and one question.'
  }
  return null
}

type CampaignLike = Pick<HqCommentCampaign, 'keyword' | 'dmTextEs' | 'dmTextEn' | 'posts'>

const postsKey = (posts: CampaignLike['posts']) =>
  JSON.stringify(
    (posts ?? []).map((p) => [
      typeof p.draft === 'object' && p.draft ? p.draft.id : (p.draft ?? null),
      p.mediaId?.trim() || null,
      p.language ?? null,
    ]),
  )

/** Did this edit change what goes out: the keyword, the posts or either DM? */
export function campaignWordingChanged(prev: Partial<CampaignLike> | undefined, next: CampaignLike): boolean {
  if (!prev) return true
  return (
    (prev.keyword ?? '') !== (next.keyword ?? '') ||
    (prev.dmTextEs ?? '') !== (next.dmTextEs ?? '') ||
    (prev.dmTextEn ?? '') !== (next.dmTextEn ?? '') ||
    postsKey(prev.posts) !== postsKey(next.posts)
  )
}

const describe = (c: HqCommentCampaign) =>
  [
    `Keyword: <b>${esc(c.keyword)}</b> on ${(c.posts ?? []).length} post(s)`,
    `DM after ${c.delayMinMinutes ?? 5}–${c.delayMaxMinutes ?? 12} min, at most ${c.hourlyCap ?? 30} an hour${c.endsAt ? `, until ${esc(new Date(c.endsAt).toISOString().slice(0, 16).replace('T', ' '))} UTC` : ''}`,
    '',
    `ES: «${esc(c.dmTextEs)}»`,
    `EN: “${esc(c.dmTextEn)}”`,
  ].join('\n')

export async function campaignSwitchedOn(c: HqCommentCampaign): Promise<void> {
  await notifyOwner(
    [`💬 <b>Comment DMs on: ${esc(c.name)}</b>`, describe(c), '', '<i>Comments are read every 2 minutes. Untick “active” in the admin to stop.</i>'].join('\n'),
  )
}

export async function notifyCampaignPaused(c: HqCommentCampaign): Promise<void> {
  await notifyOwner(
    [
      `⏸️ <b>Comment DMs paused: ${esc(c.name)}</b>`,
      'Claude changed the keyword, the posts or the DM wording, so it switched itself off. Now:',
      describe(c),
      '',
      '<i>Tick “active” again in the admin if that is right.</i>',
    ].join('\n'),
  )
}
