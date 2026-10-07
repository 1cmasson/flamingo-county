import { autoDraftHook } from '../lib/autoDraft'
import { indexNowHooks } from '../lib/indexnow'
import type { Block, CollectionConfig } from 'payload'
import { draftVersions, mcpDraftsOnly, publishedRead, slugField } from '../fields/shared'

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

/*
 * The blog shapes (2026-10-07). A story told for the reel reads as a chain of
 * short paragraphs; a page written to be found in search needs the answer up
 * top, headings to scan, lists, questions people actually type and a real
 * source list. These five give it that. See web/CMS.md, "Writing a story as a
 * blog post".
 */

/** A link is a path on this site or an https page; nothing else renders. */
const linkUrl = (v: unknown) =>
  typeof v === 'string' && (/^\/(?!\/)/.test(v) || /^https?:\/\/[^\s]+$/i.test(v))
    ? true
    : 'A path on this site (/es/...) or a full https:// address.'

const QuickAnswer: Block = {
  slug: 'quickAnswer',
  labels: { singular: 'Short answer', plural: 'Short answers' },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
      localized: true,
      admin: { description: 'The question the page answers, as people search it, e.g. "¿Hay flamencos en Hialeah Park?"' },
    },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
      localized: true,
      admin: { description: 'Two or three sentences: the plain answer, the key date and who says so. Answer engines quote this.' },
    },
  ],
}

const Heading: Block = {
  slug: 'heading',
  labels: { singular: 'Subheading', plural: 'Subheadings' },
  fields: [{ name: 'text', type: 'text', required: true, localized: true }],
}

const List: Block = {
  slug: 'list',
  labels: { singular: 'List', plural: 'Lists' },
  fields: [
    {
      name: 'style',
      type: 'select',
      defaultValue: 'bullets',
      options: [
        { value: 'bullets', label: 'Bullets' },
        { value: 'numbered', label: 'Numbered' },
        { value: 'timeline', label: 'Timeline (a year or date beside each point)' },
      ],
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      fields: [
        {
          name: 'label',
          type: 'text',
          localized: true,
          admin: { description: 'Timeline only: the year or date, e.g. "1932".' },
        },
        { name: 'text', type: 'textarea', required: true, localized: true },
      ],
    },
  ],
}

const Faq: Block = {
  slug: 'faq',
  labels: { singular: 'Questions & answers', plural: 'Questions & answers' },
  fields: [
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      fields: [
        { name: 'question', type: 'text', required: true, localized: true },
        { name: 'answer', type: 'textarea', required: true, localized: true },
      ],
    },
  ],
}

const Links: Block = {
  slug: 'links',
  labels: { singular: 'Links', plural: 'Links' },
  fields: [
    { name: 'title', type: 'text', localized: true, admin: { description: 'e.g. "Fuentes" or "Visítalo".' } },
    {
      name: 'style',
      type: 'select',
      defaultValue: 'sources',
      options: [
        { value: 'sources', label: 'Sources (numbered, opens the source)' },
        { value: 'related', label: 'Related pages on this site' },
      ],
    },
    {
      name: 'items',
      type: 'array',
      minRows: 1,
      fields: [
        { name: 'label', type: 'text', required: true, localized: true },
        { name: 'url', type: 'text', required: true, validate: linkUrl },
      ],
    },
  ],
}

const indexNow = indexNowHooks('stories')

export const Stories: CollectionConfig = {
  slug: 'stories',
  // Drafts: saved changes stay off the site until published. Claude can only
  // save drafts; publishing is the owner's tap in Telegram. See shared.ts.
  access: publishedRead,
  versions: draftVersions,
  // IndexNow and the social auto-draft both run after a save; the spread
  // alone would let one replace the other.
  hooks: {
    ...indexNow,
    afterChange: [...indexNow.afterChange, autoDraftHook('stories')],
    beforeOperation: [mcpDraftsOnly],
  },
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
      type: 'collapsible',
      label: 'Search',
      admin: { initCollapsed: true },
      fields: [
        {
          name: 'metaTitle',
          type: 'text',
          localized: true,
          admin: { description: 'The title search engines show, if it should differ from the headline. Aim for the words people search; under 60 characters.' },
        },
        {
          name: 'metaDescription',
          type: 'textarea',
          localized: true,
          admin: { description: 'The snippet under the title in search results; the dek when empty. Under 155 characters.' },
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
        {
          name: 'cardTagline',
          type: 'text',
          localized: true,
          admin: {
            description:
              'Set it to show the cover as the DID YOU KNOW? card, like the reel’s thumbnail: the photo in a polaroid with the caption as its credit, the card title, and this line under it. e.g. "At the races “nearly every afternoon”".',
          },
        },
        {
          name: 'cardTitle',
          type: 'text',
          localized: true,
          admin: {
            description: 'The big title on the card, when it should differ from the headline. e.g. "HARD ROCK STADIUM".',
            condition: (data, sibling) => Boolean(sibling?.cardTagline),
          },
        },
      ],
    },
    {
      name: 'video',
      type: 'upload',
      relationTo: 'videos',
      localized: true,
      admin: {
        description:
          'The reel this story was made from, in this language. Plays under the cover. Add one with the hqAddSiteVideo tool.',
      },
    },
    {
      name: 'blocks',
      type: 'blocks',
      blocks: [DropCap, Paragraph, PullQuote, StoryImage, ImagePair, CalloutNote, SectionBreak, QuickAnswer, Heading, List, Faq, Links],
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
