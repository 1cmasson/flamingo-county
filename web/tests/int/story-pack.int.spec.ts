import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'

import { buildBrief } from '@/lib/brief'
import { applyImport } from '@/lib/storyImport'
import { planImport, scriptLines, validatePack, type StoryPack } from '@/lib/storyPack'

/**
 * The fixture is a real pack exported by content-marketing-system's story_pack.py from the
 * "Six Inches" topic, so these tests run against the data the import was built for.
 */
const loadPack = (): StoryPack =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/story-pack-six-inches.json'), 'utf8'))

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

describe('story pack validation', () => {
  it('accepts the real pack, and notes the one editorial block', () => {
    const { errors, warnings } = validatePack(loadPack())
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/editorial/)
  })

  it('refuses a script edited after it was approved', () => {
    const p = loadPack()
    p.scripts.en.text += '\nV12. A line nobody approved.\n'
    p.scripts.en.sha256 = sha(p.scripts.en.text) // a tidy edit that also "fixes" the pack's own hash
    const { errors } = validatePack(p)
    expect(errors.join('\n')).toMatch(/en script is not the text that was approved/)
  })

  it('refuses a script whose text does not match its recorded hash', () => {
    const p = loadPack()
    p.scripts.es.text = p.scripts.es.text.replace('Mayo de 1985', 'Junio de 1985')
    expect(validatePack(p).errors.join('\n')).toMatch(/es script text does not match its recorded hash/)
  })

  it('refuses an article block that is not the approved line, word for word', () => {
    const p = loadPack()
    const b = p.siteStory.blocks[1]
    if (b.type !== 'paragraph') throw new Error('fixture changed')
    b.text.en = b.text.en.replace('Archaeologists say', 'Experts say')
    expect(validatePack(p).errors.join('\n')).toMatch(/block 2: en text is not the approved line V3/)
  })

  it('refuses a block that names a line the script does not have', () => {
    const p = loadPack()
    const b = p.siteStory.blocks[0]
    if (b.type !== 'dropCap') throw new Error('fixture changed')
    b.lines = ['V99']
    expect(validatePack(p).errors.join('\n')).toMatch(/has no line V99/)
  })

  it('refuses a year, price or phone number the facts do not back', () => {
    const p = loadPack()
    p.socialDrafts[0].caption = 'Did you know? In 1993 it cost $20 and you could call 305-555-0100. In May 1985, remains were reported.'
    const errors = validatePack(p).errors.join('\n')
    expect(errors).toMatch(/year 1993 is not in its facts/)
    expect(errors).toMatch(/prices are never posted/)
    expect(errors).toMatch(/phone numbers are never posted/)
  })

  it('refuses a post that leans on a Reported fact without saying who reported it', () => {
    const p = loadPack()
    const r1 = p.socialDrafts.find((s) => s.facts.includes('R1'))!
    r1.caption = 'Did you know? Remains were found in May 1985, four months after the 1985 Super Bowl.'
    expect(validatePack(p).errors.join('\n')).toMatch(/Reported fact without saying who reported it/)
  })

  it('refuses an Instagram post with no media, as HQ itself would', () => {
    const p = loadPack()
    p.socialDrafts[1].platforms = ['facebook', 'instagram']
    expect(validatePack(p).errors.join('\n')).toMatch(/Instagram and TikTok posts need media/)
  })

  it('refuses a post that lists no facts or an unknown one', () => {
    const p = loadPack()
    p.socialDrafts[0].facts = []
    p.socialDrafts[1].facts = ['F404']
    const errors = validatePack(p).errors.join('\n')
    expect(errors).toMatch(/lists no facts/)
    expect(errors).toMatch(/unknown fact F404/)
  })
})

describe('story import plan', () => {
  it('schedules 11:30 Miami time, in daylight time and in standard time', () => {
    const edt = planImport(loadPack(), { start: '2026-10-06' })
    expect(edt.social[0].data.scheduledFor).toBe('2026-10-06T15:30:00.000Z')
    expect(edt.social[1].data.scheduledFor).toBe('2026-10-08T15:30:00.000Z') // cadence: every 2 days
    const est = planImport(loadPack(), { start: '2026-11-03' }) // DST ends 1 Nov 2026
    expect(est.social[0].data.scheduledFor).toBe('2026-11-03T16:30:00.000Z')
  })

  it('makes every post a pending story-pillar draft', () => {
    for (const s of planImport(loadPack(), { start: '2026-10-06' }).social) {
      expect(s.data).toMatchObject({ pillar: 'story', status: 'pending', language: 'en' })
    }
  })

  it('maps blocks to the collection block types, in both languages', () => {
    const { story } = planImport(loadPack(), { start: '2026-10-06' })
    expect(story.blocks.en.map((b) => b.blockType)).toEqual([
      'dropCap', 'paragraph', 'paragraph', 'paragraph', 'paragraph', 'sectionBreak',
      'paragraph', 'paragraph', 'paragraph', 'paragraph', 'calloutNote',
    ])
    expect(story.blocks.es).toHaveLength(story.blocks.en.length)
    expect(story.blocks.es[0].text).toMatch(/^Mayo de 1985/)
    expect(story.es.title).toBe('Seis pulgadas')
  })

  it('turns a stage waiting on the owner into a task, and nothing when none is', () => {
    expect(planImport(loadPack(), { start: '2026-10-06' }).stage?.taskDetail).toMatch(/English voice/)
    const p = loadPack()
    p.stages.forEach((s) => (s.status = 'approved'))
    expect(planImport(p, { start: '2026-10-06' }).stage).toBeNull()
  })

  it('reads script lines the way the exporter does', () => {
    const lines = scriptLines(loadPack().scripts.en.text)
    expect(lines.V2).toMatch(/^May, 1985/)
    expect(Object.keys(lines).filter((k) => k.startsWith('V'))).toHaveLength(11)
  })
})

describe('story import against the database', () => {
  let payload: Payload
  const SLUG = 'story-test-six-inches'
  const MARK = 'STORY-TEST'

  const testPack = (): StoryPack => {
    const p = clone(loadPack())
    p.slug = SLUG
    p.title = { en: `${MARK} Six Inches`, es: `${MARK} Seis pulgadas` }
    p.socialDrafts.forEach((s) => (s.caption = `${MARK} ${s.caption}`))
    p.stageDetail.id = '3_story_test'
    return p
  }

  const cleanup = async () => {
    const stories = await payload.find({ collection: 'stories', where: { slug: { equals: SLUG } }, draft: true, depth: 0, overrideAccess: true })
    for (const s of stories.docs) await payload.delete({ collection: 'stories', id: s.id, overrideAccess: true }).catch(() => undefined)
    const posts = await payload.find({ collection: 'hq-social-drafts', where: { caption: { contains: MARK } }, limit: 50, depth: 0, overrideAccess: true })
    for (const d of posts.docs) {
      await payload.delete({ collection: 'hq-social-drafts', id: d.id, overrideAccess: true }).catch(() => undefined)
      await payload.delete({ collection: 'hq-events', where: { and: [{ refCollection: { equals: 'hq-social-drafts' } }, { refId: { equals: String(d.id) } }] }, overrideAccess: true })
    }
    await payload.delete({ collection: 'hq-tasks', where: { title: { contains: MARK } }, overrideAccess: true })
    await payload.delete({ collection: 'hq-events', where: { type: { equals: 'story.stage_ready' }, summary: { contains: MARK } }, overrideAccess: true })
  }

  beforeAll(async () => {
    // A story import must not message the owner, whatever the shell has set.
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env.TELEGRAM_OWNER_CHAT_ID
    payload = await getPayload({ config: await config })
    await cleanup()
  })
  afterAll(async () => {
    if (payload) await cleanup()
  })

  it('creates a site draft, pending posts and a task, and publishes nothing', async () => {
    const plan = planImport(testPack(), { start: '2026-10-06' })
    const results = await applyImport(payload, plan)
    expect(results.filter((r) => r.result === 'created').map((r) => r.part).sort()).toEqual(
      ['site', 'social', 'social', 'social', 'social', 'social', 'social', 'stage'].sort(),
    )

    // The story exists only as a draft: the public view of the collection does not see it.
    const asDraft = await payload.find({ collection: 'stories', where: { slug: { equals: SLUG } }, draft: true, depth: 0, overrideAccess: true })
    expect(asDraft.docs).toHaveLength(1)
    expect((asDraft.docs[0] as { _status?: string })._status).toBe('draft')
    // What a visitor sees: an anonymous read with access control on, and the same published-only
    // filter lib/data.ts applies. A draft appears in neither.
    const asVisitor = await payload.find({ collection: 'stories', where: { slug: { equals: SLUG } }, depth: 0, overrideAccess: false })
    expect(asVisitor.docs).toHaveLength(0)
    const published = await payload.find({
      collection: 'stories',
      where: { and: [{ slug: { equals: SLUG } }, { _status: { equals: 'published' } }] },
      depth: 0,
      overrideAccess: true,
    })
    expect(published.docs).toHaveLength(0)

    const posts = await payload.find({ collection: 'hq-social-drafts', where: { caption: { contains: MARK } }, limit: 50, depth: 0, overrideAccess: true })
    expect(posts.docs).toHaveLength(6)
    expect(posts.docs.every((d) => d.status === 'pending' && d.pillar === 'story')).toBe(true)

    const task = await payload.find({ collection: 'hq-tasks', where: { title: { contains: MARK } }, depth: 1, overrideAccess: true })
    expect(task.docs).toHaveLength(1)
    expect(task.docs[0]).toMatchObject({ assignee: 'me', status: 'open' })
    expect((task.docs[0].event as { type: string }).type).toBe('story.stage_ready')
  })

  it('carries the English block ids into Spanish, so blocks are translated in place', async () => {
    const id = (await payload.find({ collection: 'stories', where: { slug: { equals: SLUG } }, draft: true, depth: 0, overrideAccess: true })).docs[0].id
    const en = (await payload.findByID({ collection: 'stories', id, locale: 'en', draft: true, depth: 0, overrideAccess: true })) as { blocks: { id: string; text?: string }[]; title: string }
    const es = (await payload.findByID({ collection: 'stories', id, locale: 'es', draft: true, depth: 0, overrideAccess: true })) as { blocks: { id: string; text?: string }[]; title: string }
    expect(es.blocks).toHaveLength(11)
    expect(es.blocks.map((b) => b.id)).toEqual(en.blocks.map((b) => b.id))
    expect(en.blocks[0].text).toMatch(/^May, 1985/)
    expect(es.blocks[0].text).toMatch(/^Mayo de 1985/)
    expect(es.title).toBe(`${MARK} Seis pulgadas`)
  })

  it('shows what is waiting on the owner in the morning brief', async () => {
    const brief = await buildBrief(payload)
    expect(brief).toContain(`${MARK} Six Inches: 6 choices to make`)
    expect(brief).toMatch(/pending|approve/i) // the six posts are waiting for a tap too
  })

  it('is safe to run again: nothing duplicated, nothing overwritten', async () => {
    const before = await payload.count({ collection: 'hq-social-drafts', where: { caption: { contains: MARK } }, overrideAccess: true })
    const results = await applyImport(payload, planImport(testPack(), { start: '2026-10-06' }))
    expect(results.every((r) => r.result === 'skipped')).toBe(true)
    const after = await payload.count({ collection: 'hq-social-drafts', where: { caption: { contains: MARK } }, overrideAccess: true })
    expect(after.totalDocs).toBe(before.totalDocs)
  })

  it('can import a few posts at a time, each of which sends a preview', async () => {
    await cleanup()
    const results = await applyImport(payload, planImport(testPack(), { start: '2026-10-06' }), { only: ['social'], limit: 2 })
    expect(results.filter((r) => r.result === 'created')).toHaveLength(2)
    expect(results.filter((r) => r.result === 'skipped')).toHaveLength(4)
  })
})
