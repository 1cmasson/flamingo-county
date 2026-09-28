import type { CollectionConfig } from 'payload'

/**
 * Public members — the people who signed in with Google so My Week follows
 * them between devices. See MEMBERS.md.
 *
 * Deliberately not an auth collection. Identity belongs to Better Auth
 * (src/lib/auth.ts, its own auth.db); this is only the data hung off it, joined
 * on `authId`. That keeps members out of the admin panel structurally rather
 * than by access rule: Payload only logs in against `users`.
 *
 * Staff can read and tidy rows here. Members never touch Payload's REST API —
 * they go through /api/me/saved, which checks the Better Auth session and then
 * uses the local API.
 */
export const Members: CollectionConfig = {
  slug: 'members',
  access: {
    create: ({ req }) => Boolean(req.user),
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'lang', 'updatedAt'],
    group: 'Inbox',
  },
  fields: [
    {
      name: 'authId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Better Auth user id. Do not edit.' },
    },
    { name: 'email', type: 'email', admin: { readOnly: true } },
    { name: 'name', type: 'text', admin: { readOnly: true } },
    {
      name: 'lang',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Español', value: 'es' },
      ],
      admin: { description: 'The language they last synced from.' },
    },
    {
      name: 'saved',
      type: 'json',
      defaultValue: [],
      admin: { description: 'Event slugs in their My Week.' },
    },
    {
      name: 'going',
      type: 'json',
      defaultValue: [],
      admin: { description: 'Event slugs they marked as going.' },
    },
  ],
}
