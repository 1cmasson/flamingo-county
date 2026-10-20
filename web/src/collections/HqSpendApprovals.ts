import type { CollectionConfig } from 'payload'
import { humanOnly, staffOnly } from '../fields/shared'

/**
 * Paid steps Claude asked to run on the owner's machine, and his answer.
 *
 * The rule (owner, 2026-10-20): anything metered beyond the free allowance — a
 * fal call, more than 15 images for one story — waits for his yes. A local hook
 * blocks the exact command; Claude files it here (`hqRequestSpendApproval`); the
 * owner sees the command, the reason and the cost in Telegram and taps Yes or
 * No. The hook then lets that one command through once (`hqRedeemSpendApproval`).
 * See lib/spendApprovals.ts.
 *
 * Deliberately absent from the MCP plugin's list, so no client can mark its own
 * request approved through the generic tools. Every field is also `humanOnly`.
 */
export const HqSpendApprovals: CollectionConfig = {
  slug: 'hq-spend-approvals',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'reason',
    defaultColumns: ['reason', 'cost', 'status', 'createdAt'],
    description: 'Paid steps Claude asked to run. Each runs once, only after you tap Yes in Telegram.',
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
        { label: 'Waiting for you', value: 'pending' },
        { label: 'Approved, not run yet', value: 'approved' },
        { label: 'Declined', value: 'declined' },
        { label: 'Ran (approval used)', value: 'used' },
        { label: 'Expired', value: 'expired' },
      ],
      admin: { position: 'sidebar' },
    },
    { name: 'reason', type: 'text', required: true, access: humanOnly, admin: { readOnly: true } },
    { name: 'cost', type: 'text', access: humanOnly, admin: { readOnly: true } },
    { name: 'command', type: 'textarea', required: true, access: humanOnly, admin: { readOnly: true } },
    // sha256 of the trimmed command: the hook redeems by this, so only the exact command runs.
    { name: 'commandHash', type: 'text', required: true, index: true, access: humanOnly, admin: { hidden: true } },
    { name: 'expiresAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'decidedAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'usedAt', type: 'date', access: humanOnly, admin: { readOnly: true, position: 'sidebar' } },
    { name: 'telegramMessageId', type: 'number', access: humanOnly, admin: { hidden: true } },
  ],
}
