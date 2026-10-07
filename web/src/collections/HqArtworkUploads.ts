import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * Upload links for our own artwork (lib/artworkUpload.ts). Claude asks for one
 * over MCP with the picture's credit and alt text, then sends the file with a
 * plain PUT to /api/hq/artwork-upload/<token>, or in checked chunks over MCP.
 *
 * Only a hash of the token is kept, so a row cannot be turned back into a
 * working link. A link works once, for 15 minutes. Rows are removed a day after
 * they expire. Not in the MCP list and hidden in the admin: nothing here is
 * for reading, it is bookkeeping between the two halves of one upload.
 */
export const HqArtworkUploads: CollectionConfig = {
  slug: 'hq-artwork-uploads',
  access: staffOnly,
  admin: {
    group: 'HQ',
    hidden: true,
    defaultColumns: ['status', 'media', 'expiresAt', 'createdAt'],
    description: 'Upload links for our own artwork. Bookkeeping only.',
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'tokenHash', type: 'text', required: true, unique: true, index: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Waiting for the file', value: 'pending' },
        { label: 'Storing', value: 'storing' },
        { label: 'Stored', value: 'stored' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    { name: 'expiresAt', type: 'date', required: true, index: true },
    /** The checked credit, alt text and focal point (lib/siteArtwork.ts `ArtworkMeta`). */
    { name: 'meta', type: 'json', required: true },
    /** The chunked fallback's pieces so far, by index: `{ "0": { "b64": "...", "sha256": "..." } }`. Cleared once stored. */
    { name: 'chunks', type: 'json' },
    { name: 'chunkTotal', type: 'number' },
    { name: 'media', type: 'relationship', relationTo: 'media' },
    { name: 'result', type: 'json' },
    { name: 'error', type: 'text' },
  ],
}
