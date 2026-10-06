import type { CollectionConfig } from 'payload'
import { recordEvent } from '../lib/hq'
import { esc } from '../lib/telegram'
import { KIND_LABEL, type RequestKind } from '../lib/requestKinds'

const KIND_EMOJI: Record<RequestKind, string> = {
  listing: '🦩',
  event: '📅',
  interview: '🎙️',
  story: '📰',
}

/**
 * "List your spot" submissions — a business owner asking to be added, and,
 * since the page became a request hub, events, interviews and story pitches too
 * (`kind`). Rows from before `kind` existed are listings, which is its default.
 *
 * Same story as Subscribers: this replaces the Netlify Forms path, which does
 * not survive the move to Railway. Field names match the old `list-your-spot`
 * form so nothing is lost in translation.
 *
 * One real improvement over the old form: it submitted whatever the <select>
 * displayed, so the city and category arrived as *translated labels* — "La
 * Pequeña Habana" from the Spanish page, "Little Havana" from the English one.
 * These are relationships now, so the value is the same either way.
 */
export const ListingRequests: CollectionConfig = {
  slug: 'listing-requests',
  access: {
    create: () => true,
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  admin: {
    useAsTitle: 'business',
    defaultColumns: ['business', 'kind', 'owner', 'city', 'status', 'createdAt'],
    group: 'Inbox',
  },
  hooks: {
    // Tell the owner. A request used to sit in the admin until someone looked.
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return doc
        const kind: RequestKind = doc.kind ?? 'listing'
        const label = KIND_LABEL[kind]
        const lines = [
          `<b>${KIND_EMOJI[kind]} New ${label.toLowerCase()}</b>`,
          `<b>${esc(doc.business)}</b>${doc.owner ? ` — ${esc(doc.owner)}` : ''}`,
          `📞 ${esc(doc.phone)}${doc.email ? ` · ✉️ ${esc(doc.email)}` : ''}`,
        ]
        if (doc.eventWhen) lines.push(`🗓️ ${esc(doc.eventWhen)}`)
        if (doc.venue) lines.push(`📍 ${esc(doc.venue)}`)
        if (doc.link) lines.push(`🔗 ${esc(doc.link)}`)
        if (doc.story) lines.push('', esc(doc.story))
        await recordEvent(
          req.payload,
          {
            type: 'listing_request.created',
            summary: `${label}: ${doc.business}`,
            refCollection: 'listing-requests',
            refId: doc.id,
            data: { lang: doc.lang, kind },
          },
          { req, ping: lines.join('\n') },
        )
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      options: [
        { label: 'New', value: 'new' },
        { label: 'Contacted', value: 'contacted' },
        { label: 'Listed', value: 'listed' },
        { label: 'Declined', value: 'declined' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'listing',
      index: true,
      options: [
        { label: 'Add a listing', value: 'listing' },
        { label: 'Add an event', value: 'event' },
        { label: 'Interview request', value: 'interview' },
        { label: 'Story pitch', value: 'story' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      // Named for the original form. It holds whatever the request is *called*:
      // the business, the event, the interviewee's business, or the story's one line.
      name: 'business',
      type: 'text',
      required: true,
      label: 'Name / title',
      admin: { description: 'The business, the event name, or the story in one line.' },
    },
    { name: 'owner', type: 'text' },
    {
      type: 'row',
      fields: [
        { name: 'phone', type: 'text', required: true },
        { name: 'email', type: 'email' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'city', type: 'relationship', relationTo: 'cities' },
        { name: 'category', type: 'relationship', relationTo: 'categories' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'eventWhen', type: 'text', label: 'When', admin: { description: 'As they wrote it.' } },
        { name: 'venue', type: 'text', label: 'Where' },
      ],
    },
    { name: 'link', type: 'text', admin: { description: 'Flyer, tickets, Instagram or a source.' } },
    { name: 'story', type: 'textarea', admin: { description: 'What they told us.' } },
    {
      name: 'lang',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Español', value: 'es' },
      ],
      admin: { position: 'sidebar', description: 'Which version of the site they submitted from.' },
    },
  ],
}
