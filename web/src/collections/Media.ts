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
    imageSizes: [
      { name: 'thumbnail', width: 400, position: 'centre' },
      { name: 'card', width: 828 },
      { name: 'hero', width: 1920 },
    ],
    focalPoint: true,
    mimeTypes: ['image/*'],
  },
}
