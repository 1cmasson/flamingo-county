/**
 * Import a story pack into HQ as drafts.
 *
 *   pnpm tsx scripts/import-story-pack.ts path/to/story-pack.json            # dry run, no database
 *   pnpm tsx scripts/import-story-pack.ts path/to/story-pack.json --apply    # writes drafts
 *
 *   --only site,social,stage   import only some parts
 *   --start 2026-10-06         Miami date of the first post (default: tomorrow)
 *   --limit 2                  at most N social drafts. Each one sends a Telegram preview.
 *
 * Nothing here publishes. The story is a site draft and each post is a pending HQ draft, both
 * waiting for the owner's tap. A pack is made by content-marketing-system's story_pack.py.
 */
import fs from 'node:fs'

import { todayISO, parseISO } from '../src/lib/dates'
import { planImport, validatePack, type StoryPack } from '../src/lib/storyPack'
import type { Part } from '../src/lib/storyImport'

const argv = process.argv.slice(2)
const flag = (name: string) => {
  const i = argv.indexOf(name)
  return i < 0 ? undefined : argv[i + 1]
}
const file = argv[0]
if (!file || file.startsWith('--')) {
  console.error('usage: import-story-pack.ts <story-pack.json> [--apply] [--only site,social,stage] [--start YYYY-MM-DD] [--limit N]')
  process.exit(2)
}

const tomorrow = () => {
  const d = parseISO(todayISO())
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const pack = JSON.parse(fs.readFileSync(file as string, 'utf8')) as StoryPack
  const { errors, warnings } = validatePack(pack)
  for (const w of warnings) console.log(`  note: ${w}`)
  if (errors.length) {
    console.error(`\nThis pack cannot be imported (${errors.length}):`)
    for (const e of errors) console.error(`  x ${e}`)
    process.exit(1)
  }

  const start = flag('--start') ?? tomorrow()
  const only = flag('--only')?.split(',') as Part[] | undefined
  const limit = flag('--limit') === undefined ? undefined : Number(flag('--limit'))
  const plan = planImport(pack, { start })

  console.log(`\n"${pack.title.en}" (${pack.slug}), approved by ${pack.approvals.script.approvedBy} on ${pack.approvals.script.date}`)
  console.log(`  site story : draft, ${plan.story.blocks.en.length} blocks, English and Spanish`)
  console.log(`  social     : ${plan.social.length} pending drafts (pillar story)`)
  for (const s of plan.social) console.log(`    ${s.id.padEnd(8)} ${s.data.platforms.join('+')}  ${s.data.scheduledFor}  ${s.data.caption.slice(0, 60)}…`)
  console.log(`  stage      : ${plan.stage ? plan.stage.taskTitle : 'nothing waiting'}`)

  if (!argv.includes('--apply')) {
    console.log('\nDry run. Nothing written. Add --apply to create the drafts.')
    return
  }

  // Loaded only now so a dry run needs neither a database nor an env file.
  await import('dotenv/config')
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const { applyImport } = await import('../src/lib/storyImport')
  const payload = await getPayload({ config })
  console.log('\nApplying…')
  const results = await applyImport(payload, plan, { only, limit })
  for (const r of results) console.log(`  ${r.result === 'created' ? '+' : '-'} ${r.part.padEnd(6)} ${r.item}  ${r.why ?? ''}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
