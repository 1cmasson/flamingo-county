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
})
