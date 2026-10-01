/**
 * AEO probe: asks a fixed bank of questions to several answer engines and
 * records whether flamingocounty.com is cited, who else is, and what was said.
 *
 *   pnpm aeo:probe                       # default models, 3 runs per question
 *   pnpm aeo:probe --dry                 # show what would run, call nothing
 *   pnpm aeo:probe --runs 1 --only perplexity/sonar
 *
 * One key: OPENROUTER_API_KEY (read from the environment or web/.env.local).
 * Models come from OPENROUTER_MODELS (comma-separated) or the defaults below.
 *
 * What the numbers mean. Perplexity's sonar searches natively. For the other
 * models the `:online` suffix makes OpenRouter run its OWN web-search plugin, so
 * those models are served the same retrieved sources (checked: GPT and Claude
 * returned identical citation sets). They differ in how they answer, not in what
 * they find, and neither matches what ChatGPT or Claude show a consumer. Treat
 * results as a consistent trend line for before/after comparisons, and spot-check
 * the real apps by hand now and then.
 *
 * Answers vary run to run, so each question runs several times and is reported
 * as a rate. Output: scripts/aeo/results/<timestamp>.jsonl, then a summary.
 * Cost is about $0.005-0.025 per call.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const DOMAIN = 'flamingocounty.com'

type Question = { id: string; lang: 'en' | 'es'; intent: string; q: string }
type Answer = { text: string; urls: string[] }
type Engine = { name: string; model: string }

const argv = process.argv.slice(2)
const flag = (n: string) => argv.includes(`--${n}`)
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}

const DEFAULT_MODELS = ['perplexity/sonar', 'openai/gpt-4.1:online', 'anthropic/claude-sonnet-4.5:online']

function loadKey(): string | undefined {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const env = readFileSync(join(here, '..', '..', '.env.local'), 'utf8')
    return env.match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1]?.trim()
  } catch {
    return undefined
  }
}

async function ask(model: string, q: string, key: string): Promise<Answer> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 900, messages: [{ role: 'user', content: q }] }),
  })
  const j: any = await res.json()
  if (!res.ok || j.error) throw new Error(`${res.status} ${JSON.stringify(j.error ?? j).slice(0, 300)}`)
  const m = j.choices?.[0]?.message ?? {}
  const urls: string[] = (m.annotations ?? []).map((a: any) => a.url_citation?.url).filter(Boolean)
  return { text: m.content ?? '', urls }
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}

async function main() {
  const { questions } = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8')) as { questions: Question[] }
  const runs = Number(opt('runs') ?? 3)
  const key = loadKey()
  const models = (opt('only') ?? process.env.OPENROUTER_MODELS ?? DEFAULT_MODELS.join(',')).split(',')
  const active: Engine[] = models.map((m) => ({ name: m, model: m }))
  console.log(`${questions.length} questions x ${runs} runs x models [${models.join(', ')}]`)
  if (!key) {
    console.log('No OPENROUTER_API_KEY (environment or web/.env.local) — nothing to run.')
    return
  }
  if (flag('dry')) return

  const dir = join(here, 'results')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)
  const rows: any[] = []

  for (const e of active) {
    for (const q of questions) {
      for (let run = 1; run <= runs; run++) {
        try {
          const a = await ask(e.model, q.q, key)
          const hosts = a.urls.map(host)
          const pos = hosts.indexOf(DOMAIN)
          rows.push({
            t: new Date().toISOString(), engine: e.name, id: q.id, lang: q.lang, intent: q.intent, run,
            cited: pos >= 0, position: pos >= 0 ? pos + 1 : null,
            mentioned: /flamingo county|flamingocounty/i.test(a.text),
            domains: [...new Set(hosts)], answer: a.text,
          })
        } catch (err) {
          rows.push({ t: new Date().toISOString(), engine: e.name, id: q.id, run, error: String(err) })
        }
      }
    }
  }
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

  console.log(`\nwrote ${file}\n`)
  for (const e of active) {
    const r = rows.filter((x) => x.engine === e.name && !x.error)
    const errs = rows.filter((x) => x.engine === e.name && x.error).length
    const cited = r.filter((x) => x.cited).length
    const share: Record<string, number> = {}
    for (const x of r) for (const d of x.domains) share[d] = (share[d] ?? 0) + 1
    const top = Object.entries(share).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, n]) => `${d} ${n}`).join(' · ')
    console.log(`${e.name}: cited ${cited}/${r.length} (${r.length ? Math.round((100 * cited) / r.length) : 0}%), mentioned ${r.filter((x) => x.mentioned).length}, errors ${errs}`)
    console.log(`  most-cited domains: ${top}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
