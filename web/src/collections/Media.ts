import type { CollectionConfig } from 'payload'

import { PHOTO_LICENSES, licenseLabel } from '../lib/photoLicense'

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
      admin: { description: 'Photographer or source, where there is one. Shown wherever the photo is.' },
    },
    /**
     * Where a photo came from and under what terms, for photos the site does
     * not own (a venue from Wikimedia Commons, Flickr, the Library of
     * Congress). The event page, the board and the generated cards print the
     * credit with these; see lib/photoLicense.ts. Left empty on the site's own
     * photos and a partner's, which are credited by name only.
     */
    {
      name: 'license',
      type: 'select',
      options: PHOTO_LICENSES.map((value) => ({ value, label: licenseLabel(value, 'en') })),
      admin: {
        description:
          'Public domain, or Creative Commons that allows commercial reuse. Never non-commercial (NC) or no-derivatives (ND): the cards crop the photo and set type on it.',
      },
    },
    {
      name: 'licenseUrl',
      type: 'text',
      admin: { description: 'The licence deed, e.g. https://creativecommons.org/licenses/by/2.0/' },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: { description: 'The photo’s description page (Commons, Flickr, loc.gov), where its licence is stated.' },
    },
    {
      name: 'modified',
      type: 'checkbox',
      admin: { description: 'The file was cropped or edited. CC 3.0 and 4.0 require saying so; the credit adds “cropped”.' },
    },
    /**
     * Artwork Flamingo County made itself (a drawn cover, our own photo), as
     * opposed to a licensed photo from an archive. Set by the
     * artwork upload tools (lib/artworkUpload.ts). An illustration is credited
     * "Ilustración: Flamingo County" and, when it was drawn from someone
     * else's pictures, says which (`basedOn`), so the archive still gets its
     * credit. See lib/photoLicense.ts.
     */
    {
      name: 'origin',
      type: 'select',
      options: [
        { value: 'own-illustration', label: 'Our illustration' },
        { value: 'own-photo', label: 'Our photo' },
      ],
      admin: { description: 'Made by Flamingo County. Empty for a licensed photo from an archive.' },
    },
    {
      name: 'basedOn',
      type: 'text',
      localized: true,
      admin: {
        description:
          'What our artwork was drawn from, as the credit says it, e.g. "basada en fotos del Historic American Buildings Survey (dominio público)".',
      },
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
