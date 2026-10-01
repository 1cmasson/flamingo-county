import type { CollectionConfig } from 'payload'
import { humanOnly, staffOnly } from '../fields/shared'

/**
 * Claude's requests to change the public site, and the codes that unlock them.
 *
 * The rule: Claude may not write to the site's content without the owner's
 * permission, and the server enforces it. Claude files a request through the
 * `hqRequestWrite` MCP tool. The owner sees the exact change in Telegram and
 * taps Approve, which sends a one-time code to the owner's chat alone. Claude
 * can only apply the change with that code, which the owner hands over (see
 * lib/writeRequests.ts).
 *
 * This collection is deliberately absent from the MCP plugin's list, so no
 * client can read or edit it through the generic tools — including approving
 * its own request. Every field is also `humanOnly` in case it is ever added.
 * Only a hash of the code is stored, keyed with the Payload secret.
 */
export const HqWriteRequests: CollectionConfig = {
  slug: 'hq-write-requests',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'createdAt'],
    description: 'Site changes Claude asked to make. Each needs your approval in Telegram and the code it sends you.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      access: humanOnly,
      options: [
        { label: 'Waiting for approval', value: 'pending' },
        { label: 'Approved — code sent', value: 'approved' },
        { label: 'Applying', value: 'applying' },
        { label: 'Applied', value: 'applied' },
        { label: 'Rejected', value: 'rejected' },
        { label: 'Replaced by a newer request', value: 'superseded' },
        { label: 'Expired', value: 'expired' },
        { label: 'Locked (wrong codes)', value: 'locked' },
        { label: 'Stale (page changed since)', value: 'stale' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'title', type: 'text', access: humanOnly, admin: { readOnly: true } },
    {
      type: 'row',
      fields: [
        { name: 'collection', type: 'text', required: true, access: humanOnly, admin: { readOnly: true } },
        {
          name: 'operation',
          type: 'select',
          required: true,
          access: humanOnly,
          options: [
            { label: 'Create', value: 'create' },
            { label: 'Update', value: 'update' },
          ],
          admin: { readOnly: true },
        },
        { name: 'targetId', type: 'text', access: humanOnly, admin: { readOnly: true } },
      ],
    },
    {
      name: 'targetUpdatedAt',
      type: 'text',
      access: humanOnly,
      admin: { hidden: true },
    },
    { name: 'reason', type: 'textarea', access: humanOnly, admin: { readOnly: true } },
    {
      name: 'locales',
      type: 'json',
      required: true,
      access: humanOnly,
      admin: { readOnly: true, description: 'Exactly what will be written, per language.' },
    },
    { name: 'preview', type: 'textarea', access: humanOnly, admin: { readOnly: true } },
    { name: 'codeHash', type: 'text', access: humanOnly, admin: { hidden: true } },
    { name: 'codeExpiresAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'attempts', type: 'number', defaultValue: 0, access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'expiresAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'telegramMessageId', type: 'number', access: humanOnly, admin: { hidden: true } },
    { name: 'appliedDocId', type: 'text', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'error', type: 'text', access: humanOnly, admin: { readOnly: true } },
  ],
}
