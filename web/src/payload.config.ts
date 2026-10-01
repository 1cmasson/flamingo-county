import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Cities } from './collections/Cities'
import { Categories } from './collections/Categories'
import { EventKinds } from './collections/EventKinds'
import { Listings } from './collections/Listings'
import { Events } from './collections/Events'
import { WeeklyEvents } from './collections/WeeklyEvents'
import { Stories } from './collections/Stories'
import { Spotlights } from './collections/Spotlights'
import { Subscribers } from './collections/Subscribers'
import { ListingRequests } from './collections/ListingRequests'
import { Members } from './collections/Members'
import { HqEvents } from './collections/HqEvents'
import { HqTasks } from './collections/HqTasks'
import { HqMedia } from './collections/HqMedia'
import { HqSocialDrafts } from './collections/HqSocialDrafts'
import { HqSocialStats } from './collections/HqSocialStats'
import { HqClicks } from './collections/HqClicks'
import { morningBrief } from './jobs/morningBrief'
import { socialStats } from './jobs/socialStats'

import { SiteSettings } from './globals/SiteSettings'
import { AboutPage } from './globals/AboutPage'
import { ListYourSpotPage } from './globals/ListYourSpotPage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    Cities,
    Categories,
    EventKinds,
    Listings,
    Stories,
    Events,
    WeeklyEvents,
    Spotlights,
    Subscribers,
    ListingRequests,
    Members,
    HqEvents,
    HqTasks,
    HqMedia,
    HqSocialDrafts,
    HqSocialStats,
    HqClicks,
  ],
  globals: [SiteSettings, AboutPage, ListYourSpotPage],

  /**
   * Wired up front, not retrofitted: adding localization later is a schema
   * migration across every field, and the Spanish copy already exists — the
   * ES dictionary in fc-data.js covers 14/14 listing tags, 19/20 event titles
   * and 47/56 story block strings.
   *
   * `defaultLocale: 'en'` is an AUTHORING default — the source copy is English
   * and Spanish is the translation. It is NOT the site's default: the public
   * site resolves `?lang=` → localStorage → navigator.languages → 'es'. The
   * frontend port must not inherit EN-first rendering from this line.
   */
  localization: {
    locales: [
      { label: 'English', code: 'en' },
      { label: 'Español', code: 'es' },
    ],
    defaultLocale: 'en',
    fallback: true,
  },

  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],

  /**
   * The HQ jobs queue — the morning brief and the social stats collector (src/jobs).
   *
   * One in-process runner, checking every minute. That is safe here and only
   * here because the service is pinned to a single instance by SQLite on a
   * volume; a second replica would run every scheduled job twice.
   *
   * `autoRun` does nothing until something calls `getPayload({ cron: true })`.
   * Frontend code never does, so src/instrumentation.ts does it at boot —
   * without that, the crons would start only after someone logged in to the
   * admin, and a quiet night would skip the brief.
   */
  jobs: {
    tasks: [morningBrief, socialStats],
    autoRun: [{ cron: '* * * * *', queue: 'hq' }],
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      admin: { ...defaultJobsCollection.admin, group: 'HQ', hidden: false },
    }),
  },
})
