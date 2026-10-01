import path from 'path'
import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * Where HQ uploads land. Beside the public media on the volume in production
 * (`/data/media/hq`), in `web/hq-media` locally. Exported because the Telegram
 * preview and the Postiz upload read the file straight off disk.
 */
export const hqMediaDir = (): string =>
  process.env.MEDIA_DIR
    ? path.join(process.env.MEDIA_DIR, 'hq')
    : path.resolve(process.cwd(), 'hq-media')

/**
 * Photos and videos for social drafts — kept apart from `media` on purpose.
 *
 * `media` is public-read and sized for the site; these are unpublished drafts
 * that may never go out, so they are staff-only and Payload serves them only
 * to a logged-in admin. Nothing is resized: the file is sent to Telegram and
 * Postiz as uploaded.
 *
 * The MIME list is what all three platforms and Postiz's upload allowlist
 * accept in common. Instagram rejects WebP and Postiz accepts only MP4 video,
 * so a .mov or .webp is refused here rather than failing at approval time.
 */
export const HqMedia: CollectionConfig = {
  slug: 'hq-media',
  access: staffOnly,
  admin: {
    group: 'HQ',
    description: 'Photos and videos for social drafts. Private.',
  },
  fields: [{ name: 'note', type: 'text' }],
  upload: {
    staticDir: hqMediaDir(),
    mimeTypes: ['image/jpeg', 'image/png', 'video/mp4'],
  },
}
