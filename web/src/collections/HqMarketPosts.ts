import type { CollectionConfig } from 'payload'
import { staffOnly } from '../fields/shared'

/**
 * Public posts of the accounts on the market watchlist (hq-market-accounts),
 * read daily through Business Discovery by lib/market.ts. One row per post.
 * Never the picture or the video: caption, public counts and the permalink.
 *
 * `snapshots` keeps the counts at each age, first-wins like the reel
 * checkpoints: `first` (whatever age the post had when first seen), `24h`
 * (read between 24 and 72 hours old) and `7d` (between 7 and 9 days), each
 * `{ at, ageHours, likes, comments, views, followers }`. `likes` is null when
 * the owner hides like counts; `views` exists for reels only.
 *
 * `outlierScore` compares the post with its own account at the same age: the
 * post's views (reels) or likes + comments (everything else) at its furthest
 * bucket, over the median of the account's other posts of the same kind at
 * that bucket among its last 30. 2 = twice its usual. Null until at least
 * three such posts exist.
 */
export const HqMarketPosts: CollectionConfig = {
  slug: 'hq-market-posts',
  access: staffOnly,
  admin: {
    group: 'HQ',
    useAsTitle: 'caption',
    defaultColumns: ['username', 'productType', 'postedAt', 'outlierScore', 'outlierBucket', 'likes', 'views'],
    description: 'Public posts of the watchlist accounts, with counts at equal ages and an outlier score. No media files.',
  },
  defaultSort: '-postedAt',
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'account', type: 'relationship', relationTo: 'hq-market-accounts', index: true },
        { name: 'username', type: 'text', index: true },
        { name: 'mediaId', type: 'text', required: true, unique: true, index: true },
      ],
    },
    { name: 'permalink', type: 'text' },
    {
      type: 'row',
      fields: [
        { name: 'postedAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'mediaType', type: 'text', admin: { description: 'IMAGE, VIDEO or CAROUSEL_ALBUM.' } },
        { name: 'productType', type: 'text', index: true, admin: { description: 'FEED, REELS…' } },
      ],
    },
    { name: 'caption', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'likes', type: 'number', admin: { description: 'Latest reading; empty when likes are hidden.' } },
        { name: 'comments', type: 'number' },
        { name: 'views', type: 'number', admin: { description: 'Reels only (Business Discovery’s view_count).' } },
        { name: 'followersAtFetch', type: 'number', admin: { description: 'The account’s followers at the latest reading.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'firstSeenAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'lastSeenAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    { name: 'snapshots', type: 'json' },
    {
      type: 'row',
      fields: [
        { name: 'outlierScore', type: 'number', index: true },
        {
          name: 'outlierBucket',
          type: 'select',
          options: [
            { label: '24 hours', value: '24h' },
            { label: '7 days', value: '7d' },
          ],
        },
        {
          name: 'outlierBasis',
          type: 'select',
          options: [
            { label: 'Views', value: 'views' },
            { label: 'Likes + comments', value: 'interactions' },
          ],
        },
        {
          name: 'engagementPerFollower',
          type: 'number',
          admin: { description: '(likes + comments) ÷ followers, at the outlier bucket (or the latest reading).' },
        },
      ],
    },
  ],
}
