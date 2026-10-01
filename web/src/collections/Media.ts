import type { CollectionConfig } from 'payload'

/**
 * The source images are large and unoptimized — carlos.png is 5.3 MB and the
 * mascot busts run to 6.5 MB each, all served at full size today. Sharp
 * generates the responsive set on upload instead, which also replaces the
 * hand-rolled PHOTOS/pickPhoto picker in fc-data.js.
 *
 * Resizing alone isn't enough: Sharp re-encodes a resized PNG in the same
 * format, which can land *bigger* than the untouched original (a photographic
 * PNG has nowhere to shrink without changing codec). `formatOptions` forces
 * every size — and the stored original — to WebP, which is why it needs to sit
 * on each `imageSizes` entry as well as at the top level; Payload only applies
 * format conversion to a size when that size defines its own `formatOptions`.
 */
const WEBP = { format: 'webp', options: { quality: 80 } } as const

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'credit',
      type: 'text',
      admin: { description: 'Photographer or source, where there is one.' },
    },
  ],
  upload: {
    /**
     * Where the files actually land.
     *
     * Payload's default is a `media` directory beside the config, which lives
     * inside the deployed app — so on Railway every uploaded photo, plus the
     * three resized variants Sharp writes per image, disappears on the next
     * redeploy. `MEDIA_DIR` points this at the persistent volume in production
     * (`/data/media`) and is simply unset locally, where the default is fine.
     *
     * This and `DATABASE_URL` are the two paths that must sit under the mount.
     * Getting one right and not the other loses half the content.
     */
    staticDir: process.env.MEDIA_DIR || undefined,
    formatOptions: WEBP,
    imageSizes: [
      { name: 'thumbnail', width: 400, position: 'centre', formatOptions: WEBP },
      { name: 'card', width: 828, formatOptions: WEBP },
      { name: 'hero', width: 1920, formatOptions: WEBP },
    ],
    focalPoint: true,
    mimeTypes: ['image/*'],
  },
}
