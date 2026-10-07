import path from 'path'
import type { CollectionConfig } from 'payload'

/**
 * Where site videos land. Beside the public media on the volume in production
 * (`/data/media/videos`), in `web/videos` locally.
 */
export const videosDir = (): string =>
  process.env.MEDIA_DIR
    ? path.join(process.env.MEDIA_DIR, 'videos')
    : path.resolve(process.cwd(), 'videos')

/**
 * The finished reels, shown on the story they belong to.
 *
 * Not in `media`: that collection converts every upload to WebP and makes
 * three image sizes, none of which means anything for an MP4. Not `hq-media`
 * either: that one is staff-only, so its files 403 for a reader.
 *
 * A video comes in only through the hqAddSiteVideo tool, which copies a reel
 * already uploaded to HQ (and already approved for social) and pairs it with
 * its cover card as `poster`. Like a photo in `media`, the file has a public
 * URL from then on, but it is on a page only once a story using it is
 * published by the owner's tap.
 *
 * One file per language: the story's `video` field is localized, so the
 * Spanish page plays the Spanish cut.
 */
export const Videos: CollectionConfig = {
  slug: 'videos',
  access: {
    read: () => true,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'language', 'durationSeconds'],
    group: 'Content',
    description: 'Reels shown on story pages. Public once a story using one is published.',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'In the language of the video. Used as the VideoObject name.' },
    },
    {
      name: 'language',
      type: 'select',
      required: true,
      options: [
        { value: 'en', label: 'English' },
        { value: 'es', label: 'Spanish' },
      ],
    },
    {
      name: 'poster',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description:
          'The cover card (¿SABÍAS QUE? / DID YOU KNOW), 1080×1920. Shown before the video plays, and the thumbnail search engines see.',
      },
    },
    {
      name: 'durationSeconds',
      type: 'number',
      min: 1,
      admin: { description: 'Length in seconds, for the VideoObject duration.' },
    },
    {
      name: 'credits',
      type: 'text',
      admin: { description: 'Who the archive images belong to, as the captions credit them.' },
    },
  ],
  upload: {
    staticDir: videosDir(),
    mimeTypes: ['video/mp4'],
  },
}
