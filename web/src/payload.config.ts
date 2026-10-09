import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Videos } from './collections/Videos'
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
import { HqPublishRequests } from './collections/HqPublishRequests'
import { HqChatTurns } from './collections/HqChatTurns'
import { HqVisits } from './collections/HqVisits'
import { HqExperiments } from './collections/HqExperiments'
import { HqArtworkUploads } from './collections/HqArtworkUploads'
import { eveningWrap } from './jobs/eveningWrap'
import { morningBrief } from './jobs/morningBrief'
import { socialStats } from './jobs/socialStats'
import { hqMcpTools } from './lib/mcpTools'

import { SiteSettings } from './globals/SiteSettings'
import { AboutPage } from './globals/AboutPage'
import { ListYourSpotPage } from './globals/ListYourSpotPage'
import { HqPlaybook } from './globals/HqPlaybook'
import { LinkPage } from './globals/LinkPage'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    /**
     * The HQ dashboard at /admin/hq: a read-only overview for the owner's
     * phone. The view checks the admin session itself, since Payload skips its
     * login redirect for custom views. See components/hq/HqDashboard.tsx.
     */
    components: {
      beforeNavLinks: ['/components/hq/HqNavLink#HqNavLink'],
      views: {
        hq: {
          Component: '/components/hq/HqDashboard#HqDashboard',
          path: '/hq',
          exact: true,
          meta: { title: 'HQ' },
        },
      },
    },
  },
  collections: [
    Users,
    Media,
    Videos,
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
    HqPublishRequests,
    HqChatTurns,
    HqVisits,
    HqExperiments,
    HqArtworkUploads,
  ],
  globals: [SiteSettings, AboutPage, ListYourSpotPage, LinkPage, HqPlaybook],

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
    /**
     * A social draft's `status` is required in the database and defaults to
     * `pending`, but it is not Claude's to set: over MCP the field refuses
     * writes (`humanOnly`). The MCP plugin builds its tool input schemas from
     * this same JSON schema, so leaving `status` required made every create
     * over MCP demand a value the server then throws away. Dropping it from the
     * required list fixes the tool without a schema change or a migration.
     */
    schema: [
      ({ jsonSchema }) => {
        const drafts = jsonSchema.definitions?.['hq-social-drafts'] as { required?: string[] } | undefined
        if (Array.isArray(drafts?.required)) drafts.required = drafts.required.filter((f) => f !== 'status')
        return jsonSchema
      },
    ],
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [
    /**
     * Claude's way into HQ, at /api/mcp. Two layers decide what a client can
     * touch: this list (what is possible at all) and the boxes ticked on each
     * API key under Admin → MCP (what that key may use). Anything missing here
     * is unreachable whatever a key says — and `users`, `members`,
     * `subscribers` and the jobs are deliberately missing: no account data, no
     * visitor emails. The public `media` is here for find only (it is
     * public-read already); the two ways to add to it are tools:
     * hqAddSiteMediaFromUrl, which takes allowlisted hosts and licences only,
     * and the artwork upload (hqStartSiteArtworkUpload, then a PUT to a one-time
     * link; lib/artworkUpload.ts) for artwork Flamingo County made, always
     * credited to us with what it was drawn from. A picture there shows on a
     * page only once something using it is published by the owner's tap.
     *
     * Delete is off everywhere. Drafts can be written and edited but their
     * status cannot be changed over MCP (see `humanOnly` in fields/shared.ts):
     * nothing reaches a social account without the owner's tap in Telegram.
     *
     * The site's content collections take drafts only over MCP — any other
     * write is refused by `mcpDraftsOnly` on the collection itself — and
     * publishing is the owner's tap in Telegram (hqRequestPublish,
     * lib/publishRequests.ts). `hq-publish-requests` must never be added to
     * this list: a generic update tool on it would let a client approve its
     * own request.
     */
    mcpPlugin({
      collections: {
        'hq-events': {
          enabled: { find: true, create: true, update: true },
          description: 'HQ event log: everything that happened (intake, social, briefs). Mark status seen/done once handled.',
        },
        'hq-tasks': {
          enabled: { find: true, create: true, update: true },
          description: 'To-dos. assignee "claude" = filed for Claude (e.g. via /task in Telegram); set status doing/done as you work them.',
        },
        'hq-social-drafts': {
          enabled: { find: true, create: true, update: true },
          description:
            'Social posts awaiting the owner’s approval in Telegram. Creating one (or editing a pending one) sends a preview with Approve/Reject. Status cannot be set over MCP. Set pillar and language on every draft.',
        },
        'hq-media': {
          enabled: { find: true },
          description: 'Draft photos/videos. Add new ones with the hqAddDraftMediaFromUrl tool (a public link) or hqAddDraftMediaFromUpload (a file from the owner\'s computer).',
        },
        'hq-social-stats': {
          enabled: { find: true },
          description: 'Saved Postiz numbers: kind "post" at 24h/3d/7d checkpoints, kind "channel" daily 7-day snapshots.',
        },
        'hq-clicks': { enabled: { find: true }, description: 'Clicks on /go/ tracking links.' },
        'hq-visits': {
          enabled: { find: true },
          description:
            'Page views from the site’s own counter (no IPs or visitor ids). entry = first page of a visit. hqGrowthContext summarizes them; query rows only for a detail it lacks.',
        },
        'hq-experiments': {
          enabled: { find: true, create: true, update: true },
          description:
            'Growth experiments: hypothesis, metric, baseline, expected, result, verdict. The growth review (web/hq/growth-review.md) keeps them. Never delete; set status dropped.',
        },
        'listing-requests': {
          enabled: { find: true, update: true },
          description: '“List your spot” submissions from business owners. Update status as they are handled.',
        },
        listings: {
          enabled: { find: true, create: true, update: true },
          description:
            'Directory listings. Only publicationStatus "ready" is fully sourced; "unsourced" detail is design placeholder — never quote it as fact, and never invent owner details. Save with draft: true — drafts are never live; publish with hqRequestPublish.',
        },
        events: { enabled: { find: true, create: true, update: true }, description: 'Dated events on the site. Save with draft: true — drafts are never live; publish with hqRequestPublish.' },
        'weekly-events': { enabled: { find: true, create: true, update: true }, description: 'Recurring weekly events. Save with draft: true — drafts are never live; publish with hqRequestPublish.' },
        stories: { enabled: { find: true, create: true, update: true }, description: 'Stories. Save with draft: true — drafts are never live; publish with hqRequestPublish.' },
        spotlights: { enabled: { find: true, create: true, update: true }, description: 'Home-page spotlights. Save with draft: true — drafts are never live; publish with hqRequestPublish.' },
        cities: { enabled: { find: true } },
        categories: { enabled: { find: true } },
        // Read-only, to reuse a venue photo already imported (credit, licence,
        // source) rather than download it again. The public media library is
        // public-read anyway; new pictures come in only through
        // hqAddSiteMediaFromUrl, which checks the host and the licence, and
        // the artwork upload (hqStartSiteArtworkUpload), which takes only our own artwork.
        media: {
          enabled: { find: true },
          description:
            'The public site’s photos and artwork (read-only). Use it to find a venue photo already imported with hqAddSiteMediaFromUrl (credit, license, sourceUrl) or artwork added with hqStartSiteArtworkUpload (origin, basedOn), and set its id on a draft.',
        },
        videos: {
          enabled: { find: true },
          description:
            'Reels on the public site (read-only). Add one with hqAddSiteVideo, then set its id as a story’s `video` in that language, in a draft.',
        },
      },
      globals: {
        'link-page': {
          enabled: { find: true, update: true },
          description:
            'The link-in-bio page (flamingocounty.com/links): taglineEs/taglineEn, then ordered sections (emoji, titleEs, titleEn) of buttons (emoji, labelEs, labelEn, kind "link" with a url or "newestStory", featured, startsOn/endsOn days). Both languages are plain fields: no locale parameter. Internal urls are paths without the language (/events); outside ones are full https:// addresses. To change anything in sections, read the page (findLinkPage with draft: true), then send the WHOLE sections array back with your change: rows not sent are removed. Save with draft: true; drafts are never live. Publish with hqRequestPublish (collection "link-page", no id).',
        },
        'hq-playbook': {
          enabled: { find: true, update: true },
          description:
            'The growth playbook: what brings traffic (content, channels, social by pillar, language, hour and platform), each lesson with its sample size and the experiment behind it. The growth review rewrites it (web/hq/growth-review.md). Notes only; nothing is posted from it.',
        },
      },
      mcp: {
        tools: hqMcpTools,
        serverOptions: {
          serverInfo: { name: 'Flamingo HQ', version: '1.0.0' },
          instructions:
            'Flamingo HQ, the private ops layer of flamingocounty.com (a bilingual Miami-Dade directory: Hialeah, Miami Lakes, Little Havana). Start with hqBrief. Social posts are drafts in hq-social-drafts; the owner approves each one in Telegram and you cannot. Give every draft a pillar and language (the audience is Spanish-first). Use real listings, events and stories only — never invent business details. Site content (events, weekly events, stories, spotlights, listings) has drafts: save freely with draft: true — nothing you save is visible — then call hqRequestPublish; it goes live only when the owner taps Publish in Telegram. Never try to publish any other way. The goal is traffic: when an open hq-task whose title starts with "Growth review (asked" is assigned to claude, run the growth review (hqGrowthContext, then web/hq/growth-review.md in the repo).',
        },
      },
    }),
  ],

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
    tasks: [morningBrief, socialStats, eveningWrap],
    autoRun: [{ cron: '* * * * *', queue: 'hq' }],
    jobsCollectionOverrides: ({ defaultJobsCollection }) => ({
      ...defaultJobsCollection,
      admin: { ...defaultJobsCollection.admin, group: 'HQ', hidden: false },
    }),
  },
})
