import type { CollectionConfig } from 'payload'

/**
 * Newsletter signups.
 *
 * This is a replacement, not a port. The static site's newsletter worked only
 * because Netlify scans deployed HTML at deploy time and registers any form it
 * finds — hence the unlinked forms.html carrying markup nobody ever saw, and
 * `netlifySubmit()` POSTing a matching payload to `/`. None of that machinery
 * exists on Railway, so submissions land here instead.
 *
 * `create` is open to anonymous visitors; reading is staff-only.
 */
export const Subscribers: CollectionConfig = {
  slug: 'subscribers',
  access: {
    create: () => true,
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'lang', 'createdAt'],
    group: 'Inbox',
  },
  fields: [
    { name: 'email', type: 'email', required: true, unique: true, index: true },
    {
      name: 'lang',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Español', value: 'es' },
      ],
      admin: { description: 'Which version of the site they signed up from.' },
    },
  ],
}
