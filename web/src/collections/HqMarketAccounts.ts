import type { CollectionConfig, FieldAccess } from 'payload'
import { notFromMcp, staffOnly } from '../fields/shared'
import { IG_USERNAME } from '../lib/metaAccount'

/** "@Only.In.Dade", "instagram.com/onlyindade/" → "onlyindade" style handles. */
export function normalizeIgUsername(input: unknown): string {
  return String(input ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase()
}

/** The job's bookkeeping: shown, never written by hand or over MCP. */
const jobOnly: { create: FieldAccess; update: FieldAccess } = { create: notFromMcp, update: notFromMcp }

/**
 * The market watchlist: other Instagram accounts whose public posts HQ reads
 * every day through Meta's Business Discovery (lib/market.ts), to see what
 * works for Miami accounts at the same post age. Edit it in the admin or over
 * MCP; the job fills `status`, `checkedAt` and the counts.
 *
 * Business Discovery only answers for business and creator accounts; any
 * other account gets `status: 'not_professional'` and is skipped until edited.
 * Accounts the Meta token manages besides @flamingo.county (Club de la
 * Amistad's) are refused by the job whatever this list says.
 */
export const HqMarketAccounts: CollectionConfig = {
  slug: 'hq-market-accounts',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'username',
    defaultColumns: ['username', 'category', 'active', 'status', 'followersCount', 'checkedAt'],
    description: 'Instagram accounts to compare against (public posts via Business Discovery). Captions and public counts only.',
  },
  defaultSort: 'username',
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && 'username' in data) data.username = normalizeIgUsername(data.username)
        return data
      },
    ],
  },
  fields: [
    {
      name: 'username',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: (v: unknown) =>
        (typeof v === 'string' && IG_USERNAME.test(v)) || 'An Instagram username: letters, digits, dots and underscores, up to 30.',
      admin: { description: 'Without the @, e.g. onlyindade.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'category',
          type: 'text',
          index: true,
          admin: { description: 'A short tag to compare like with like: news, history, food, culture, city, peer…' },
        },
        { name: 'active', type: 'checkbox', defaultValue: true, index: true, admin: { description: 'Read daily while ticked.' } },
      ],
    },
    { name: 'notes', type: 'textarea' },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          defaultValue: 'pending',
          access: jobOnly,
          options: [
            { label: 'Not read yet', value: 'pending' },
            { label: 'OK', value: 'ok' },
            { label: 'Not a business/creator account', value: 'not_professional' },
            { label: 'Refused (managed by our token)', value: 'refused' },
            { label: 'Error', value: 'error' },
          ],
          admin: { readOnly: true },
        },
        { name: 'checkedAt', type: 'date', index: true, access: jobOnly, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    { name: 'statusDetail', type: 'text', access: jobOnly, admin: { readOnly: true, description: 'Graph’s error code and message, when the last read failed.' } },
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', access: jobOnly, admin: { readOnly: true } },
        { name: 'followersCount', type: 'number', access: jobOnly, admin: { readOnly: true } },
        { name: 'mediaCount', type: 'number', access: jobOnly, admin: { readOnly: true } },
      ],
    },
  ],
}
