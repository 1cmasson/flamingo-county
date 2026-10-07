// @vitest-environment node
// next/og and sharp want Node, not jsdom.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, describe, expect, it } from 'vitest'

import { renderEventCard } from '@/lib/eventCard'
import { renderFreeRidesCard } from '@/lib/freeRidesCard'
import type { Event } from '@/payload-types'

/**
 * The 2026-10-07 outage: Next's image optimizer blocks every libvips loader but
 * the raster ones the first time `/_next/image` runs, and `next/og` turns its
 * SVG into PNG with that same sharp, so every card after that failed with
 * "Input buffer contains unsupported image format". lib/ogImage.ts is the fix.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const SVG = new TextEncoder().encode(
  '<svg width="40" height="20" viewBox="0 0 40 20" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="20" fill="#ff2e88"/></svg>',
)

/** What next/dist/server/image-optimizer.js does to sharp on its first request. */
function blockLikeNextImage() {
  sharp.block({ operation: ['VipsForeignLoad'] })
  sharp.unblock({
    operation: [
      'VipsForeignLoadHeif',
      'VipsForeignLoadJpeg',
      'VipsForeignLoadNsgif',
      'VipsForeignLoadPng',
      'VipsForeignLoadTiff',
      'VipsForeignLoadWebp',
    ],
  })
}

const event = (title: string) =>
  ({
    id: 1,
    slug: 'og-image',
    title,
    date: '2026-10-31T12:00:00.000Z',
    timeLabel: '6 PM',
    venueType: 'place',
    place: 'Milander Park',
    city: { id: 2, slug: 'hialeah', name: 'HIALEAH' },
    kind: { id: 7, slug: 'church', label: 'COMUNIDAD' },
    eventStatus: 'scheduled',
  }) as unknown as Event

describe('cards after Next has blocked libvips loaders', () => {
  afterAll(() => {
    // Leave libvips as a fresh process has it for the other suites in this worker.
    sharp.unblock({ operation: ['VipsForeignLoad'] })
  })

  it('the lockfile holds one sharp, the one next/og uses', () => {
    const lock = readFileSync(join(process.cwd(), 'pnpm-lock.yaml'), 'utf8')
    const versions = new Set([...lock.matchAll(/^ {2}sharp@(\d+\.\d+\.\d+)/gm)].map((m) => m[1]))
    expect([...versions]).toHaveLength(1)
  })

  it('reproduces the outage without the fix: an SVG buffer no longer loads', async () => {
    blockLikeNextImage()
    await expect(sharp(SVG).png().toBuffer()).rejects.toThrow('unsupported image format')
  })

  it('still draws event and free-rides cards, then blocks the SVG loader again', async () => {
    blockLikeNextImage()
    for (const size of ['link', 'card', 'social'] as const) {
      const png = Buffer.from(await renderEventCard(event(`Blocked ${size}`), 'es', size, '2026-10-07'))
      expect(png.subarray(0, 4)).toEqual(PNG)
    }
    const rides = Buffer.from(await renderFreeRidesCard('es'))
    expect(rides.subarray(0, 4)).toEqual(PNG)
    // Next's hardening is back once no card is being drawn.
    await expect(sharp(SVG).png().toBuffer()).rejects.toThrow('unsupported image format')
  })

  it('draws cards side by side while the loader is shared', async () => {
    blockLikeNextImage()
    const pngs = await Promise.all(
      ['a', 'b', 'c', 'd'].map(async (t) => Buffer.from(await renderEventCard(event(`Parallel ${t}`), 'en', 'link', '2026-10-07'))),
    )
    for (const png of pngs) expect(png.subarray(0, 4)).toEqual(PNG)
  })
})
