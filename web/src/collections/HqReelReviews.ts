import type { CollectionConfig } from 'payload'
import { humanOnly, staffOnly } from '../fields/shared'

/**
 * The 72-hour post-mortem of a reel: station 4 of the learning loop
 * (content-marketing-system/LEARNING-LOOP.md). Written by the `reelScore` job
 * (lib/reelScore.ts) once a draft's reels have their 3d reading in
 * `hq-social-stats`, one row per story — the Spanish and English cuts of the
 * same story together, so the pair comparison sits beside the numbers it
 * compares.
 *
 * Internal only (owner, 2026-10-20): a review is a note. Nothing reads it to
 * post, publish or message anyone; the job sends no Telegram and writes no
 * `hq-events` row, so it stays out of the brief. It is read by the growth
 * review (hqWeeklyReviewContext / hqGrowthContext, `reelReviews`) and is
 * find-only over MCP. Every field is `humanOnly`, so a client cannot rewrite
 * the numbers either; the job writes with `overrideAccess`.
 *
 * How to read one:
 * - `cuts`: one entry per language cut and platform — the draft, its language,
 *   permalink, real age at the reading, and `metrics` (views, reach, average
 *   watch in seconds and as % of length, skip rate, shares, saves and likes per
 *   person reached). `vsMedian` puts each beside the median of the account's
 *   previous reels of the same pillar at the same checkpoint, on the same
 *   platform: `ratio` 2 is twice the median, 0.5 half (skip rate: lower is
 *   better), with `n` the size of that baseline.
 * - `pair`: Spanish over English, per platform and metric, when both cuts were
 *   measured (lib/reelScore.ts `pairDrafts` says how cuts are paired).
 * - `retention`: where people left, from Facebook's curve — % still watching
 *   at 3 s, 15 s and half the length, and the steepest drop.
 * - `summary`: the same, as text, and what was appended to an experiment.
 */
export const HqReelReviews: CollectionConfig = {
  slug: 'hq-reel-reviews',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'title',
    defaultColumns: ['title', 'pillar', 'complete', 'publishedAt', 'createdAt'],
    description: 'Automatic 72-hour post-mortems of each reel (both language cuts), written by the reel scorer. Internal notes only.',
  },
  defaultSort: '-publishedAt',
  fields: [
    { name: 'title', type: 'text', required: true, access: humanOnly, admin: { readOnly: true } },
    {
      // At most one review per story, held by the database: `reel-review:<lowest draft id>`.
      name: 'key',
      type: 'text',
      required: true,
      unique: true,
      access: humanOnly,
      admin: { hidden: true },
    },
    {
      type: 'row',
      fields: [
        { name: 'pillar', type: 'text', access: humanOnly, admin: { readOnly: true } },
        {
          name: 'checkpoint',
          type: 'text',
          defaultValue: '3d',
          access: humanOnly,
          admin: { readOnly: true, description: 'The reading scored: 3d (72 hours).' },
        },
        {
          name: 'publishedAt',
          type: 'date',
          index: true,
          access: humanOnly,
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' }, description: 'When the first cut went out.' },
        },
      ],
    },
    {
      name: 'complete',
      type: 'checkbox',
      defaultValue: false,
      access: humanOnly,
      admin: {
        readOnly: true,
        description: 'Every cut had its 3d reading on every platform it was measured on. Unticked: scored after the window closed with what there was.',
      },
    },
    {
      name: 'drafts',
      type: 'relationship',
      relationTo: 'hq-social-drafts',
      hasMany: true,
      required: true,
      index: true,
      access: humanOnly,
      admin: { readOnly: true },
    },
    {
      name: 'permalinks',
      type: 'json',
      access: humanOnly,
      admin: { readOnly: true, description: '[{ draft, language, platform, permalink }]' },
    },
    {
      name: 'cuts',
      type: 'json',
      required: true,
      access: humanOnly,
      admin: { readOnly: true, description: 'Per cut and platform: metrics, and vsMedian { value, median, n, ratio }.' },
    },
    {
      name: 'pair',
      type: 'json',
      access: humanOnly,
      admin: { readOnly: true, description: 'Spanish over English, per platform and metric. Empty for a single cut.' },
    },
    {
      name: 'retention',
      type: 'json',
      access: humanOnly,
      admin: { readOnly: true, description: 'Facebook: % still watching at 3 s, 15 s and half, and the steepest drop.' },
    },
    { name: 'summary', type: 'textarea', required: true, access: humanOnly, admin: { readOnly: true } },
    {
      name: 'experiments',
      type: 'relationship',
      relationTo: 'hq-experiments',
      hasMany: true,
      access: humanOnly,
      admin: { readOnly: true, description: 'Experiments whose result this review was appended to. Their verdict is left alone.' },
    },
  ],
}
