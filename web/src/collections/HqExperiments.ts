import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

const day = { date: { pickerAppearance: 'dayOnly' as const, displayFormat: 'yyyy-MM-dd' } }

/**
 * The growth experiment ledger — how HQ learns what brings traffic. Each row is
 * one thing tried: what we expect it to do, which number should move, the
 * number before, and what actually happened. The growth review
 * (web/hq/growth-review.md) opens, checks and closes them, and only a closed
 * experiment with a verdict feeds the playbook.
 *
 * Notes, not switches: nothing reads this to publish or post anything, so
 * Claude may write every field over MCP. Delete is off there; drop an
 * experiment with status `dropped` instead, so the history stays.
 */
export const HqExperiments: CollectionConfig = {
  slug: 'hq-experiments',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'verdict', 'checkOn', 'updatedAt'],
    description: 'Growth experiments: what we tried, what we expected, what happened. Kept by the growth review.',
  },
  defaultSort: '-updatedAt',
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'planned',
          index: true,
          options: [
            { label: 'Planned', value: 'planned' },
            { label: 'Running', value: 'running' },
            { label: 'Done', value: 'done' },
            { label: 'Dropped', value: 'dropped' },
          ],
        },
        {
          name: 'verdict',
          type: 'select',
          options: [
            { label: 'Worked', value: 'worked' },
            { label: 'No effect', value: 'no_effect' },
            { label: 'Worse', value: 'worse' },
            { label: 'Inconclusive', value: 'inconclusive' },
          ],
          admin: { description: 'Set when it is done.' },
        },
      ],
    },
    {
      name: 'hypothesis',
      type: 'textarea',
      required: true,
      admin: { description: 'If we do X, then Y goes up, because Z.' },
    },
    {
      name: 'metric',
      type: 'text',
      required: true,
      admin: {
        description:
          'The one number that decides it, and where it is read: e.g. "visits from facebook to /es/…, hqGrowthContext traffic".',
      },
    },
    {
      type: 'row',
      fields: [
        { name: 'baseline', type: 'text', admin: { description: 'The number before, with its window.' } },
        { name: 'expected', type: 'text', admin: { description: 'What would count as working, and by when.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'startedOn', type: 'date', admin: day },
        { name: 'checkOn', type: 'date', admin: { ...day, description: 'When there should be enough data to judge.' } },
      ],
    },
    {
      name: 'result',
      type: 'textarea',
      admin: { description: 'What happened, with the numbers and sample size. What we keep doing, or stop.' },
    },
  ],
}
