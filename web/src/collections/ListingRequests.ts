import type { CollectionConfig } from 'payload'
import { recordEvent } from '../lib/hq'
import { esc } from '../lib/telegram'

/**
 * "List your spot" submissions — a business owner asking to be added.
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
    defaultColumns: ['business', 'owner', 'city', 'status', 'createdAt'],
    group: 'Inbox',
  },
  hooks: {
    // Tell the owner. A request used to sit in the admin until someone looked.
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation !== 'create') return doc
        const lines = [
          `<b>🦩 New listing request</b>`,
          `<b>${esc(doc.business)}</b>${doc.owner ? ` — ${esc(doc.owner)}` : ''}`,
          `📞 ${esc(doc.phone)}${doc.email ? ` · ✉️ ${esc(doc.email)}` : ''}`,
        ]
        if (doc.story) lines.push('', esc(doc.story))
        await recordEvent(
          req.payload,
          {
            type: 'listing_request.created',
            summary: `Listing request: ${doc.business}`,
            refCollection: 'listing-requests',
            refId: doc.id,
            data: { lang: doc.lang },
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
    { name: 'business', type: 'text', required: true },
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
    { name: 'story', type: 'textarea', admin: { description: 'What they told us about the place.' } },
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
