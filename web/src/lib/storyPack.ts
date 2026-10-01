import { createHash } from 'node:crypto'

import { parseISO, utcStamp } from './dates'

/**
 * Story packs: how a produced story crosses into HQ.
 *
 * A story is researched, scripted, voiced and cut in content-marketing-system, on
 * the owner's Mac, with its own approval gates. HQ runs on a server that cannot read
 * that repo, so what crosses over is one JSON file (a "pack") generated from the approved
 * topic. This module is the pure half of the import: it decides whether a pack can be
 * trusted and what it would create. It touches no database, so a dry run needs none.
 *
 * What it will not let through:
 *   - a script whose text no longer hashes to the approval recorded when the owner said yes
 *   - an article block marked as narration whose text is not, word for word, the approved line
 *   - a post that states a year, price or phone number its listed facts do not contain
 *   - a post that leans on a "Reported" fact without saying who reported it
 *   - an Instagram or TikTok post with no media (HQ's own collection refuses these too)
 *
 * It never publishes anything. `planImport` only describes drafts; see `storyImport.ts`.
 */

export type Lang = 'en' | 'es'
export type Both = { en: string; es: string }
export type Platform = 'facebook' | 'instagram' | 'tiktok'

export type PackFact = { id: string; label: 'Fact' | 'Reported'; text: string; source: string }

export type PackBlock =
  | { type: 'dropCap' | 'paragraph'; lines: string[]; text: Both }
  | { type: 'sectionBreak' }
  | { type: 'callout'; editorial: true; title: Both; text: Both }

export type PackSocial = {
  id: string
  platforms: Platform[]
  language: Lang | 'both'
  facts: string[]
  caption: string
  mediaUrl?: string
}

export type StoryPack = {
  packVersion: number
  slug: string
  title: Both
  scripts: Record<Lang, { sha256: string; text: string }>
  approvals: { script: { approvedBy: string; date: string; sha256: Record<Lang, string> } }
  stages: { id: string; status: string; needs: string[] }[]
  stageDetail: { id: string; needs: string[]; knownIssues: string[] }
  facts: PackFact[]
  siteStory: {
    kicker: Both
    byline: string
    readTime: string
    dek: Both
    blocks: PackBlock[]
    outro: Both
  }
  socialDrafts: PackSocial[]
  socialCadenceDays: number
}

export type Validation = { errors: string[]; warnings: string[] }

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** `V3. text` lines from a script file, keyed by id. */
export function scriptLines(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(/^([VT]\d+)\.\s+(.*?)\s*$/gm)) out[m[1]] = m[2]
  return out
}

// The same shapes the Studio gate uses (telegram-bridge/src/studio/rules.mjs and gate.mjs), kept in
// step by hand because the two repos cannot share code. Only the checks that make sense for a story.
const YEAR = /(?<!\d)(19|20)\d{2}(?!\d)/g
const PHONE = /(?<!\d)\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/
const PRICE = /\$\s?\d|\d+\s?(d[oó]lares|dollars|usd)\b/i
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu
const ATTRIBUTION = /report|according to|said|told|newspaper|archaeolog|archeolog|según|informó|dijo/i
const MAX_CAPTION = 900
const MAX_TAGS = 3

export function validatePack(pack: StoryPack): Validation {
  const errors: string[] = []
  const warnings: string[] = []
  const err = (m: string) => errors.push(m)

  if (pack.packVersion !== 1) err(`unsupported packVersion ${pack.packVersion}`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(pack.slug ?? '')) err(`bad slug "${pack.slug}"`)

  // 1. The approval is bound to the exact text, not to a status someone could flip.
  const approved = pack.approvals?.script?.sha256
  for (const lang of ['en', 'es'] as const) {
    const s = pack.scripts?.[lang]
    if (!s) {
      err(`no ${lang} script`)
      continue
    }
    const actual = sha256(s.text)
    if (actual !== s.sha256) err(`${lang} script text does not match its recorded hash`)
    if (!approved || approved[lang] !== actual) err(`${lang} script is not the text that was approved`)
  }
  if (errors.length) return { errors, warnings }

  const lines = { en: scriptLines(pack.scripts.en.text), es: scriptLines(pack.scripts.es.text) }

  // 2. Narration blocks must be the approved line, word for word, in both languages.
  pack.siteStory.blocks.forEach((b, i) => {
    if (b.type === 'sectionBreak') return
    if (b.type === 'callout') {
      warnings.push(`block ${i + 1} is editorial (a sources note); the owner reviews it before publishing`)
      return
    }
    for (const lang of ['en', 'es'] as const) {
      const missing = b.lines.filter((id) => !(id in lines[lang]))
      if (missing.length) err(`block ${i + 1}: ${lang} script has no line ${missing.join(', ')}`)
      else if (b.text[lang] !== b.lines.map((id) => lines[lang][id]).join(' '))
        err(`block ${i + 1}: ${lang} text is not the approved line ${b.lines.join('+')}`)
    }
  })
  for (const lang of ['en', 'es'] as const) {
    if (!pack.siteStory.dek[lang]) err(`story dek is empty in ${lang}`)
    if (!pack.siteStory.outro[lang]) err(`story outro is empty in ${lang}`)
  }

  // 3. Posts may only state what their listed facts state.
  const facts = new Map(pack.facts.map((f) => [f.id, f]))
  const seen = new Set<string>()
  for (const p of pack.socialDrafts) {
    const at = `post ${p.id}`
    if (seen.has(p.id)) err(`${at}: duplicate id`)
    seen.add(p.id)
    if (!p.platforms.length) err(`${at}: no platform`)
    if (p.platforms.some((x) => x !== 'facebook') && !p.mediaUrl)
      err(`${at}: Instagram and TikTok posts need media`)
    if (!p.facts.length) err(`${at}: lists no facts, so nothing backs it`)
    const backing = p.facts.map((id) => facts.get(id))
    for (const [i, f] of backing.entries()) if (!f) err(`${at}: unknown fact ${p.facts[i]}`)
    const known = backing.filter((f): f is PackFact => Boolean(f))
    const factText = known.map((f) => f.text).join(' ')

    if (!p.caption.trim()) err(`${at}: empty caption`)
    if (p.caption.length > MAX_CAPTION) err(`${at}: ${p.caption.length} characters is over ${MAX_CAPTION}`)
    if (PHONE.test(p.caption)) err(`${at}: phone numbers are never posted`)
    if (PRICE.test(p.caption)) err(`${at}: prices are never posted`)
    if ((p.caption.match(HASHTAG) ?? []).length > MAX_TAGS) err(`${at}: too many hashtags`)
    for (const y of new Set(p.caption.match(YEAR) ?? [])) {
      if (!factText.includes(y)) err(`${at}: year ${y} is not in its facts`)
    }
    if (known.some((f) => f.label === 'Reported') && !ATTRIBUTION.test(p.caption))
      err(`${at}: leans on a Reported fact without saying who reported it`)
  }
  return { errors, warnings }
}

/* ------------------------------------------------------------------------ */
/* Plan                                                                      */
/* ------------------------------------------------------------------------ */

type StoryLocale = {
  title: string
  dek: string
  kicker: string
  outro: string
}

export type StoryBlockData = {
  blockType: 'dropCap' | 'paragraph' | 'sectionBreak' | 'calloutNote'
  text?: string
  title?: string
}

export type ImportPlan = {
  slug: string
  story: {
    byline: string
    readTime: string
    en: StoryLocale
    es: StoryLocale
    blocks: { en: StoryBlockData[]; es: StoryBlockData[] }
  }
  social: {
    id: string
    data: {
      caption: string
      platforms: Platform[]
      language: Lang | 'both'
      pillar: 'story'
      scheduledFor: string
      status: 'pending'
    }
  }[]
  stage: null | { eventSummary: string; taskTitle: string; taskDetail: string; data: Record<string, unknown> }
}

const toISO = (stamp: string) =>
  new Date(stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')).toISOString()

function plusDays(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function blocksFor(pack: StoryPack, lang: Lang): StoryBlockData[] {
  return pack.siteStory.blocks.map((b): StoryBlockData => {
    if (b.type === 'sectionBreak') return { blockType: 'sectionBreak' }
    if (b.type === 'callout') return { blockType: 'calloutNote', title: b.title[lang], text: b.text[lang] }
    return { blockType: b.type, text: b.text[lang] }
  })
}

/**
 * What an import would create. `start` is the Miami date of the first post; each next one lands
 * `socialCadenceDays` later at `time`. The pack carries no dates of its own: when a story goes out
 * is the owner's call.
 */
export function planImport(pack: StoryPack, opts: { start: string; time?: string }): ImportPlan {
  const time = opts.time ?? '11:30'
  const pending = pack.stages.filter((s) => s.status === 'awaiting-approval')
  const detail = pack.stageDetail
  return {
    slug: pack.slug,
    story: {
      byline: pack.siteStory.byline,
      readTime: pack.siteStory.readTime,
      en: { title: pack.title.en, dek: pack.siteStory.dek.en, kicker: pack.siteStory.kicker.en, outro: pack.siteStory.outro.en },
      es: { title: pack.title.es, dek: pack.siteStory.dek.es, kicker: pack.siteStory.kicker.es, outro: pack.siteStory.outro.es },
      blocks: { en: blocksFor(pack, 'en'), es: blocksFor(pack, 'es') },
    },
    social: pack.socialDrafts.map((p, i) => ({
      id: p.id,
      data: {
        caption: p.caption,
        platforms: p.platforms,
        language: p.language,
        pillar: 'story',
        scheduledFor: toISO(utcStamp(plusDays(opts.start, i * pack.socialCadenceDays), time)),
        status: 'pending',
      },
    })),
    stage: pending.length
      ? {
          eventSummary: `"${pack.title.en}" is waiting on you (${detail.id.replace(/^\d+_/, '').replace(/_/g, ' ')})`,
          taskTitle: `${pack.title.en}: ${detail.needs.length} choices to make`,
          taskDetail: [...detail.needs.map((n) => `- ${n}`), ...detail.knownIssues.map((n) => `Known issue: ${n}`)].join('\n'),
          data: { slug: pack.slug, stage: detail.id, needs: detail.needs },
        }
      : null,
  }
}
