import { getPayload } from 'payload'
import type { Where } from 'payload'
import config from '../payload.config'
import type { Lang } from '../i18n'
import type { City, Listing, Story, Event, WeeklyEvent, Spotlight, Category, EventKind } from '../payload-types'

/**
 * Data access through Payload's local API — an in-process call, no HTTP, so
 * these run inside server components with no fetch waterfall.
 */
async function db() {
  return getPayload({ config })
}

/* ----------------------------------------------------------------- taxonomy */

export async function getCities(lang: Lang): Promise<City[]> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'cities',
    locale: lang,
    limit: 20,
    depth: 1,
    sort: 'order',
  })
  return docs
}

export async function getCity(lang: Lang, slug: string): Promise<City | null> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'cities',
    where: { slug: { equals: slug } },
    locale: lang,
    limit: 1,
    depth: 1,
  })
  return docs[0] ?? null
}

export async function getCategories(lang: Lang): Promise<Category[]> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'categories',
    locale: lang,
    limit: 50,
    sort: 'order',
  })
  return docs
}

export async function getEventKinds(lang: Lang): Promise<EventKind[]> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'event-kinds',
    locale: lang,
    limit: 50,
    sort: 'order',
  })
  return docs
}

/* ----------------------------------------------------------------- listings */

export type ListingFilter = { city?: string; category?: string; q?: string }

export async function getListings(lang: Lang, filter: ListingFilter = {}): Promise<Listing[]> {
  const payload = await db()
  const where: Where = {}
  const and: Where[] = []

  if (filter.city) and.push({ 'city.slug': { equals: filter.city } })
  if (filter.category) and.push({ 'category.slug': { equals: filter.category } })
  if (filter.q) {
    // Mirrors the old client-side search, which matched name, tag and hood.
    and.push({
      or: [
        { name: { like: filter.q } },
        { tag: { like: filter.q } },
        { hood: { like: filter.q } },
      ],
    })
  }
  if (and.length) where.and = and

  const { docs } = await payload.find({
    collection: 'listings',
    where,
    locale: lang,
    limit: 200,
    // Same reason as stories: seed order is the authored order, and the default
    // would hand the grids back newest-first.
    sort: 'createdAt',
    // depth 2, not 1: the card draws the city's mascot, which is an upload
    // hanging off the city — one level below the listing's own relationship.
    depth: 2,
  })
  return docs.sort(byResearchThenAuthored)
}

/** Sourced records lead the grids; within a tier, authored order is preserved. */
const STATUS_RANK: Record<string, number> = {
  ready: 0,
  needs_owner_confirmation: 1,
  unsourced: 2,
}

/**
 * Real businesses first, design placeholders last.
 *
 * Sorted here rather than in the query because Payload would order
 * `publicationStatus` alphabetically, which puts `needs_owner_confirmation`
 * ahead of `ready` — backwards, since `ready` is the tier where every field
 * traces to a source. The alternative was a numeric rank column and another
 * migration for what is purely a display concern. `find` already caps at 200,
 * so this sorts a bounded list.
 *
 * `sort: 'createdAt'` above still does the real work: it fixes the order
 * *within* each tier, and this is a stable sort, so seed order survives.
 */
function byResearchThenAuthored(a: Listing, b: Listing): number {
  const ra = STATUS_RANK[a.publicationStatus ?? 'unsourced'] ?? 2
  const rb = STATUS_RANK[b.publicationStatus ?? 'unsourced'] ?? 2
  return ra - rb
}

export async function getListing(lang: Lang, slug: string): Promise<Listing | null> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'listings',
    where: { slug: { equals: slug } },
    locale: lang,
    limit: 1,
    depth: 2,
  })
  return docs[0] ?? null
}

/* ------------------------------------------------------------------ stories */

export async function getStories(lang: Lang): Promise<Story[]> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'stories',
    locale: lang,
    limit: 50,
    // Seed order, which is `fc-data.js` order. The index features whichever
    // story comes back first, so leaving this to Payload's default `-createdAt`
    // silently featured the newest one and reversed the shelf below it.
    sort: 'createdAt',
    depth: 2,
  })
  return docs
}

export async function getStory(lang: Lang, slug: string): Promise<Story | null> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { slug: { equals: slug } },
    locale: lang,
    limit: 1,
    depth: 2,
  })
  return docs[0] ?? null
}

/** The story written about a given business, if there is one. */
export async function getStoryForListing(lang: Lang, listingId: number | string) {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'stories',
    where: { listing: { equals: listingId } },
    locale: lang,
    limit: 1,
    depth: 1,
  })
  return docs[0] ?? null
}

/* ------------------------------------------------------------------- events */

export async function getEvents(lang: Lang): Promise<Event[]> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'events',
    locale: lang,
    limit: 500,
    sort: 'date',
    // depth 3: the card draws the city's mascot. For a place-venue event the
    // city hangs directly off the event (depth 2 is enough), but for a
    // listing-venue one it is event -> listing -> city -> mascot upload.
    depth: 3,
  })
  return docs
}

export async function getEvent(lang: Lang, slug: string): Promise<Event | null> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'events',
    where: { slug: { equals: slug } },
    locale: lang,
    limit: 1,
    depth: 3,
  })
  return docs[0] ?? null
}

export async function getWeeklyEvents(lang: Lang): Promise<WeeklyEvent[]> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'weekly-events',
    locale: lang,
    limit: 50,
    sort: 'dow',
    depth: 2,
  })
  return docs
}

/* --------------------------------------------------------------- spotlights */

export async function getSpotlights(lang: Lang): Promise<Spotlight[]> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'spotlights',
    locale: lang,
    limit: 20,
    // Seed order is city order — Hialeah, Miami Lakes, Little Havana — and the
    // home page prints the row as it arrives. The default `-createdAt` reversed
    // it into Havana-first.
    sort: 'createdAt',
    depth: 2,
  })
  return docs
}

/* ------------------------------------------------------------------ globals */

export async function getSiteSettings(lang: Lang) {
  const payload = await db()
  return payload.findGlobal({ slug: 'site-settings', locale: lang })
}

export async function getAboutPage(lang: Lang) {
  const payload = await db()
  return payload.findGlobal({ slug: 'about-page', locale: lang, depth: 1 })
}

export async function getListYourSpotPage(lang: Lang) {
  const payload = await db()
  return payload.findGlobal({ slug: 'list-your-spot-page', locale: lang })
}

/* ------------------------------------------------------------------ helpers */

/** Relationship fields come back as an id or the populated doc, depending on depth. */
export function rel<T extends { id: number | string }>(v: T | number | string | null | undefined): T | null {
  return v && typeof v === 'object' ? (v as T) : null
}
