import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'
import { USE_ACTIONS, USE_BROWSERS, USE_NETWORKS, USE_SECTIONS, USE_TOOLS } from '../lib/useKinds'

/**
 * One row per thing someone did on the site (lib/uses.ts): looked an address
 * up, called a business, asked for directions, saved an event, read a story to
 * the end, searched.
 *
 * Deliberately thin, like `hq-visits`: no IP, no user agent, no cookie, no
 * visitor id and never an address, only its municipality. `target` is a public
 * page's slug, and a search is kept only when it is one of the site's words.
 */
export const HqUses: CollectionConfig = {
  slug: 'hq-uses',
  access: staffOnly,
  admin: {
    group: 'HQ',
    defaultColumns: ['tool', 'action', 'target', 'network', 'term', 'browser', 'createdAt'],
    description:
      'What people do on the site: calls, directions, website taps, saves, searches, the address tool. Never an address, no IPs, cookies or visitor ids. Bots and signed-in staff are not counted.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'tool', type: 'select', required: true, defaultValue: 'address', options: [...USE_TOOLS], index: true },
    { name: 'action', type: 'select', required: true, options: [...USE_ACTIONS], index: true },
    {
      name: 'section',
      type: 'select',
      options: [...USE_SECTIONS],
      admin: { description: 'For "link": which card of the report.' },
    },
    {
      name: 'target',
      type: 'text',
      index: true,
      admin: { description: 'The public page it was about: a business, event or story slug, or a free-ride line.' },
    },
    {
      name: 'network',
      type: 'select',
      options: [...USE_NETWORKS],
      admin: { description: 'For "social": which network.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'term',
          type: 'text',
          index: true,
          admin: { description: 'A search, only when it is one of the site’s own words.' },
        },
        { name: 'results', type: 'number', admin: { description: 'How many businesses the search found.' } },
      ],
    },
    { name: 'path', type: 'text', index: true, admin: { description: 'The page, without its query.' } },
    {
      name: 'area',
      type: 'text',
      index: true,
      admin: { description: 'The municipality of the address looked up ("HIALEAH"). Never the address.' },
    },
    {
      type: 'row',
      fields: [
        { name: 'lang', type: 'select', options: ['es', 'en'] },
        {
          name: 'browser',
          type: 'select',
          options: [...USE_BROWSERS],
          admin: { description: 'A normal browser, or an app’s built-in one (where the calendar button is hidden).' },
        },
        { name: 'device', type: 'select', options: ['mobile', 'desktop'] },
        { name: 'country', type: 'text' },
      ],
    },
  ],
}
