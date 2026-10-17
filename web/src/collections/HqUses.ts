import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'
import { USE_ACTIONS, USE_BROWSERS, USE_SECTIONS } from '../lib/useKinds'

/**
 * One row per thing someone did on the address tool (lib/uses.ts): looked an
 * address up, added the trash days to their calendar, copied the link out of
 * Instagram's browser, opened a card's links.
 *
 * Deliberately thin, like `hq-visits`: no IP, no user agent, no cookie, no
 * visitor id and never the address, only its municipality.
 */
export const HqUses: CollectionConfig = {
  slug: 'hq-uses',
  access: staffOnly,
  admin: {
    group: 'HQ',
    defaultColumns: ['action', 'section', 'area', 'browser', 'lang', 'createdAt'],
    description:
      'What people do on the address tool. Never the address, no IPs, cookies or visitor ids. Bots and signed-in staff are not counted.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'tool', type: 'select', required: true, defaultValue: 'address', options: ['address'], index: true },
    { name: 'action', type: 'select', required: true, options: [...USE_ACTIONS], index: true },
    {
      name: 'section',
      type: 'select',
      options: [...USE_SECTIONS],
      admin: { description: 'For "link": which card of the report.' },
    },
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
