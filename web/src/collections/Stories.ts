import type { Block, CollectionConfig } from 'payload'
import { slugField, publicRead } from '../fields/shared'

/**
 * Long-form stories — `STORIES` (3 records, 33 blocks) in fc-data.js.
 *
 * The body is currently a positional tuple array decoded by `storyBlocks()`
 * (fc-data.js:492) — `['q', text, by]`, `['pair', [hintA, capA], [hintB, capB]]`
 * and so on. Those seven shapes become seven named Payload blocks below, which
 * is the whole reason a CMS is worth it here: a tuple where index 3 silently
 * means "aspect ratio" is not something anyone should have to edit by hand.
 *
 * Only the text inside a block is `localized`; block structure and order are
 * shared across locales. That means the ES write must carry each block's
 * generated `id` back, or Payload treats the array as replaced rather than
 * translated — see the two-pass write in src/seed/index.ts.
 */

const imageSlotFields = [
  {
    name: 'image',
    type: 'upload' as const,
    relationTo: 'media' as const,
  },
  {
    name: 'hint',
    type: 'text' as const,
    localized: true,
    admin: {
      description:
        'Art direction for the empty slot. The image-slot sidecar was never created, so every story image is still a labelled placeholder.',
    },
  },
  {
    name: 'caption',
    type: 'text' as const,
    localized: true,
  },
]

const DropCap: Block = {
  slug: 'dropCap',
  labels: { singular: 'Opening paragraph', plural: 'Opening paragraphs' },
  fields: [
    {
      name: 'text',
      type: 'textarea',
      required: true,
      localized: true,
      admin: { description: 'The first character renders as a drop cap.' },
    },
  ],
}

const Paragraph: Block = {
  slug: 'paragraph',
  fields: [{ name: 'text', type: 'textarea', required: true, localized: true }],
}

const PullQuote: Block = {
  slug: 'pullQuote',
  fields: [
    { name: 'text', type: 'textarea', required: true, localized: true },
    {
      name: 'attribution',
      type: 'text',
      admin: { description: 'e.g. "RIGO PEÑA, OWNER". Not translated — a name and a role.' },
    },
  ],
}

const StoryImage: Block = {
  slug: 'image',
  labels: { singular: 'Full-width image', plural: 'Full-width images' },
  fields: [
    ...imageSlotFields,
    {
      name: 'aspectRatio',
      type: 'text',
      defaultValue: '16 / 9',
      admin: { description: 'CSS aspect-ratio. Defaults to 16 / 9.' },
    },
  ],
}

const ImagePair: Block = {
  slug: 'imagePair',
  labels: { singular: 'Image pair', plural: 'Image pairs' },
  fields: [
    { name: 'a', type: 'group', fields: imageSlotFields },
    { name: 'b', type: 'group', fields: imageSlotFields },
  ],
}

const CalloutNote: Block = {
  slug: 'calloutNote',
  labels: { singular: 'Callout', plural: 'Callouts' },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'text', type: 'textarea', required: true, localized: true },
  ],
}

const SectionBreak: Block = {
  slug: 'sectionBreak',
  labels: { singular: 'Section break', plural: 'Section breaks' },
  fields: [],
}

export const Stories: CollectionConfig = {
  slug: 'stories',
  access: publicRead,
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'listing', 'readTime'],
    group: 'Content',
  },
  fields: [
    slugField,
    { name: 'title', type: 'text', required: true, localized: true },
    {
      name: 'dek',
      type: 'textarea',
      localized: true,
      admin: { description: 'The standfirst under the headline.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'kicker',
          type: 'text',
          localized: true,
          admin: { description: 'e.g. "LITTLE HAVANA · SINCE 1994".' },
        },
        {
          name: 'readTime',
          type: 'text',
          admin: { description: 'e.g. "6 MIN READ".' },
        },
      ],
    },
    {
      name: 'byline',
      type: 'text',
      admin: { description: 'e.g. "AS TOLD TO FLAMINGO COUNTY".' },
    },
    {
      name: 'listing',
      type: 'relationship',
      relationTo: 'listings',
      admin: { description: 'The business this story is about. Drives the "see the listing" CTA.' },
    },
    {
      name: 'bizCta',
      type: 'text',
      localized: true,
      admin: { description: 'e.g. "SEE THE LISTING →".' },
    },
    {
      type: 'collapsible',
      label: 'Cover',
      fields: [
        { name: 'cover', type: 'upload', relationTo: 'media' },
        { name: 'coverHint', type: 'text', localized: true },
        { name: 'coverCap', type: 'text', localized: true },
      ],
    },
    {
      name: 'blocks',
      type: 'blocks',
      blocks: [DropCap, Paragraph, PullQuote, StoryImage, ImagePair, CalloutNote, SectionBreak],
    },
    {
      name: 'outro',
      type: 'textarea',
      localized: true,
      admin: {
        description:
          'The practical sign-off after the body. KNOWN GAP: all 3 stories are missing a Spanish outro in the source dictionary — the old site silently rendered English here on ES pages. Worth writing.',
      },
    },
  ],
}
