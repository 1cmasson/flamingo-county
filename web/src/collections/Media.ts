import type { CollectionConfig } from 'payload'

/**
 * The source images are large and unoptimized — carlos.png is 5.3 MB and the
 * mascot busts run to 6.5 MB each, all served at full size today. Sharp
 * generates the responsive set on upload instead, which also replaces the
 * hand-rolled PHOTOS/pickPhoto picker in fc-data.js.
 */
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
    imageSizes: [
      { name: 'thumbnail', width: 400, position: 'centre' },
      { name: 'card', width: 828 },
      { name: 'hero', width: 1920 },
    ],
    focalPoint: true,
    mimeTypes: ['image/*'],
  },
}
