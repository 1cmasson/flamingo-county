import type { Payload } from 'payload'

import type { ImportPlan } from './storyPack'

/**
 * Writes an `ImportPlan` into HQ. Drafts only, and never over anything that exists.
 *
 *   - The site story is a Payload draft. The public site reads published versions only, so
 *     nothing it saves is visible. Going live is the owner's Publish tap, as for any draft.
 *   - Social posts are `pending` HQ drafts. HQ previews each in Telegram with Approve and
 *     Reject, exactly as it does for a post written by hand, so a batch import sends a batch of
 *     previews. Import a few at a time with `limit`.
 *   - A waiting stage becomes an event plus a task, so it shows in the morning brief.
 *
 * Re-running is safe: a story with the slug, a post with the same caption, or a task with the
 * same title is reported as skipped, not duplicated and not overwritten. The owner may have edited
 * it since, and an import must never undo that.
 */

export type Part = 'site' | 'social' | 'stage'
export type ImportResult = { part: Part; item: string; result: 'created' | 'skipped'; why?: string }

type Blocks = { id?: string }[]

export async function applyImport(
  payload: Payload,
  plan: ImportPlan,
  opts: { only?: Part[]; limit?: number } = {},
): Promise<ImportResult[]> {
  const want = (p: Part) => !opts.only || opts.only.includes(p)
  const out: ImportResult[] = []

  if (want('site')) {
    const found = await payload.find({
      collection: 'stories',
      where: { slug: { equals: plan.slug } },
      draft: true,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (found.docs.length) {
      out.push({ part: 'site', item: plan.slug, result: 'skipped', why: 'a story with this slug exists; not overwritten' })
    } else {
      const { en, es, byline, readTime, blocks } = plan.story
      const doc = await payload.create({
        collection: 'stories',
        locale: 'en',
        draft: true,
        depth: 0,
        overrideAccess: true,
        data: { slug: plan.slug, ...en, byline, readTime, blocks: blocks.en } as never,
      })
      // Block structure is shared across locales and only the text is localized. Payload matches
      // array rows on their generated id, so the Spanish pass carries the ids back from the
      // English write. Without them the array is rebuilt instead of translated in place. This is
      // the same two-pass write the seed uses (src/seed/index.ts).
      const fresh = (await payload.findByID({
        collection: 'stories',
        id: doc.id,
        locale: 'en',
        draft: true,
        depth: 0,
        overrideAccess: true,
      })) as unknown as { blocks?: Blocks }
      await payload.update({
        collection: 'stories',
        id: doc.id,
        locale: 'es',
        draft: true,
        depth: 0,
        overrideAccess: true,
        data: { ...es, blocks: blocks.es.map((b, i) => ({ ...b, id: fresh.blocks?.[i]?.id })) } as never,
      })
      out.push({ part: 'site', item: plan.slug, result: 'created', why: 'draft, English and Spanish' })
    }
  }

  if (want('social')) {
    let made = 0
    for (const post of plan.social) {
      const dup = await payload.find({
        collection: 'hq-social-drafts',
        where: { and: [{ caption: { equals: post.data.caption } }, { pillar: { equals: 'story' } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (dup.docs.length) {
        out.push({ part: 'social', item: post.id, result: 'skipped', why: 'same caption already in HQ' })
        continue
      }
      if (opts.limit !== undefined && made >= opts.limit) {
        out.push({ part: 'social', item: post.id, result: 'skipped', why: `over the limit of ${opts.limit}` })
        continue
      }
      await payload.create({
        collection: 'hq-social-drafts',
        data: post.data as never,
        overrideAccess: true,
      })
      made++
      out.push({ part: 'social', item: post.id, result: 'created', why: `pending, ${post.data.scheduledFor}` })
    }
  }

  if (want('stage') && plan.stage) {
    const s = plan.stage
    const dup = await payload.find({
      collection: 'hq-tasks',
      where: { title: { equals: s.taskTitle } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (dup.docs.length) {
      out.push({ part: 'stage', item: s.taskTitle, result: 'skipped', why: 'task already exists' })
    } else {
      const event = await payload.create({
        collection: 'hq-events',
        data: { type: 'story.stage_ready', summary: s.eventSummary, data: s.data, status: 'new' } as never,
        overrideAccess: true,
      })
      await payload.create({
        collection: 'hq-tasks',
        data: { title: s.taskTitle, detail: s.taskDetail, assignee: 'me', status: 'open', event: event.id } as never,
        overrideAccess: true,
      })
      out.push({ part: 'stage', item: s.taskTitle, result: 'created', why: 'event and task, shown in the brief' })
    }
  }
  return out
}
