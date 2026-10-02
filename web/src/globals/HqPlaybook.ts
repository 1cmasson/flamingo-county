import type { GlobalConfig } from 'payload'

const staff = ({ req }: { req: { user?: unknown } }) => Boolean(req.user)

/**
 * What the growth review has learned so far about bringing traffic: which
 * content and channels work, and on social which pillars, languages, posting
 * hours and platforms do well, each with how many posts or visits it rests on.
 *
 * Rewritten by each growth review (web/hq/growth-review.md), which runs when the
 * owner asks with /review, through the MCP `updateHqPlaybook` tool, and readable
 * through `hqGrowthContext`. Staff-only: nothing here is public. Claude may write
 * every field, because the playbook is notes, not a switch. Nothing reads it to
 * decide what gets posted; the owner's Approve tap still does that.
 */
export const HqPlaybook: GlobalConfig = {
  slug: 'hq-playbook',
  label: 'Growth playbook',
  access: { read: staff, update: staff },
  admin: {
    group: 'HQ',
    description:
      'What brings traffic: content, channels, and on social by pillar, language, hour and platform. Rewritten by each Claude growth review; edit it freely.',
  },
  fields: [
    {
      name: 'body',
      type: 'textarea',
      // A playbook, not a report: short enough to read on a phone.
      maxLength: 4000,
      admin: {
        rows: 20,
        description:
          'Markdown. Each lesson names how many posts or visits it rests on. Fewer than about 3 posts in a group is "not enough data yet", not a lesson.',
      },
    },
    {
      name: 'updatedFrom',
      type: 'group',
      label: 'Window it was written from',
      admin: { description: 'The days of results the current text is based on.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'from', type: 'date', admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' } } },
            { name: 'to', type: 'date', admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' } } },
          ],
        },
      ],
    },
    {
      name: 'sampleSize',
      type: 'number',
      min: 0,
      admin: { description: 'How many published posts in that window the text is based on.' },
    },
  ],
}
