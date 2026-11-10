import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The site never sends a visitor to Google Maps (owner, Nov 10: it is the
 * competitor). Walking directions are Apple Maps on Apple devices only
 * (lib/walkLink); everything else is our own map and trip planner.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : []
  })
}

describe('no Google Maps links', () => {
  it('has no google.com/maps link anywhere in the site', () => {
    const hits = files(join(import.meta.dirname, '../../src')).filter((p) =>
      /google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl/.test(readFileSync(p, 'utf8')),
    )
    expect(hits).toEqual([])
  })
})
