/**
 * Imports the whole of fc-data.js into Payload.
 *
 * Re-runnable. Every write upserts on `slug`, so running this twice must leave
 * the counts unchanged — that is the acceptance test, and the reason the two
 * collections with no source id (WEEKLY, SPOTS) get synthetic slugs below.
 *
 *   pnpm seed
 */
// Next loads .env on its own; a standalone tsx script does not.
import 'dotenv/config'
import path from 'path'
import fs from 'fs'
import { getPayload } from 'payload'
import type { Payload } from 'payload'
import config from '../payload.config'
import type { ListYourSpotPage } from '../payload-types'
import {
  loadResearch,
  toListing,
  CITY,
  CATEGORY,
  SLUG_RENAMES,
  LISTING_PHOTO,
} from './research-listings'
import {
  loadFCBase,
  makeTranslator,
  decodeEntities,
  slugify,
  SITE_ROOT,
  type FCBase,
} from './load-fc-data'

/**
 * `fc-data.js` is design fiction: 14 listings whose phone and hours were
 * generated from the array index, plus the events, weekly events, spotlights
 * and stories written around them. None of it describes a real business, so by
 * default none of it is imported.
 *
 * What still comes from `fc-data.js` regardless: the three cities, the two
 * taxonomies, the photography and the site copy — those are real.
 *
 * Set `SEED_MOCK_CONTENT=1` to bring the fiction back. Nothing is lost by
 * leaving it off; `fc-data.js` is still in the repo and still the source.
 */
const SEED_MOCKS = process.env.SEED_MOCK_CONTENT === '1'

const base: FCBase = loadFCBase()
const T = makeTranslator(base)

/** Translate, decoding the browser entities on the way through. */
const es = (s?: string | null) => (s == null ? undefined : decodeEntities(T(s)))
const en = (s?: string | null) => (s == null ? undefined : decodeEntities(s))

type Dict = Record<string, any>

/* ------------------------------------------------------------------ upserts */

/**
 * Create-or-update on slug, then write the Spanish pass separately.
 *
 * Payload stores one locale per write, so localized values cannot ride along
 * with the English create — they need a second `update` carrying `locale`.
 */
async function upsert(
  payload: Payload,
  collection: any,
  slug: string,
  enData: Dict,
  esData?: Dict | ((enDoc: any) => Dict),
): Promise<any> {
  const existing = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })

  let doc
  if (existing.docs.length) {
    doc = await payload.update({
      collection,
      id: existing.docs[0].id,
      data: { ...enData, slug },
      locale: 'en',
      depth: 0,
    })
  } else {
    doc = await payload.create({
      collection,
      data: { ...enData, slug },
      locale: 'en',
      depth: 0,
    })
  }

  // Non-localized arrays (opening hours) are matched on their
  // generated row `id`, so callers that translate fields inside such an array
  // need to see the English doc first — pass a function to get it.
  const resolved = typeof esData === 'function' ? esData(doc) : esData
  if (resolved && Object.keys(resolved).length) {
    doc = await payload.update({
      collection,
      id: doc.id,
      data: resolved,
      locale: 'es',
      depth: 0,
    })
  }
  return doc
}

/** Attach the English rows' ids by position so an ES write updates in place. */
function withIds(rows: Dict[] | undefined, enRows: Dict[] | undefined): Dict[] {
  return (rows ?? []).map((r, i) => ({ ...r, id: enRows?.[i]?.id }))
}

/** Media is keyed on filename rather than slug — it has no slug field. */
/**
 * The taxonomy diverges from `fc-data.js` on purpose.
 *
 * The design source carries five categories written for a directory that would
 * cover trades and event venues. What exists is restaurants and bars, in two
 * cities — `research-listings.ts` maps the whole research corpus onto `food`
 * and `night` and nothing else. Advertising CONTRACTORS, HOME CLEANING and
 * BANQUET HALLS in the List Your Spot dropdown promised work we cannot take.
 *
 * Kept here rather than edited into `fc-data.js`, which is the Claude Design
 * source: a re-pull would put the five back. `night` is relabelled too — its
 * two listings are a taproom and a liquor lounge, not night clubs.
 */
const CAT_KEEP = ['food', 'night', 'nonprofit']
const CAT_RELABEL: Record<string, { en: string; es: string }> = {
  food: { en: 'RESTAURANTS', es: 'RESTAURANTES' },
  night: { en: 'BARS', es: 'BARES' },
  nonprofit: { en: 'NONPROFITS', es: 'ORGANIZACIONES' },
}

/**
 * Categories that exist here and nowhere upstream.
 *
 * `fc-data.js` was written for a directory of businesses, so its five
 * categories are all trades and venues — there is no nonprofit anywhere in it.
 * Club de la Amistad is not a business and does not belong under RESTAURANTS,
 * so the row is authored here instead, for the same reason `CAT_RELABEL` is: a
 * key added to `fc-data.js` is reverted by the next Claude Design re-pull.
 *
 * Every key here must also be in `CAT_KEEP` — `pruneCategories` deletes rows
 * outside it, and then throws once a listing references one. The ES label is
 * `ORGANIZACIONES` rather than the club's own `sin fines de lucro`, which is
 * accurate but three words too long for a filter chip.
 */
const EXTRA_CATS = [{ key: 'nonprofit', label: 'NONPROFITS' }]

/**
 * Events that are actually happening.
 *
 * `base.EVENTS` is 20 invented listings-parties behind `SEED_MOCK_CONTENT`, so
 * before this there was no way to seed a real one. These are authored here, in
 * both locales, because the announcements they come from are Spanish and the
 * EN→ES dictionary the rest of the seed leans on has never seen them.
 *
 * `listing` is a slug from `data-import/listings.json`, resolved after the
 * research loop. `photo` follows `LISTING_PHOTO`'s shape.
 */
const REAL_EVENTS = [
  {
    slug: 'encuentro-casa-marin',
    date: '2026-09-06',
    kind: 'church', // labelled COMMUNITY
    listing: 'casa-marin',
    star: true,
    photo: {
      file: 'assets/events/encuentro-casa-marin.jpg',
      altEn: 'Two breaded pork steaks on a plate under a pile of raw onion rings, with a wedge of lime.',
      altEs: 'Dos bistecs de puerco empanizados en un plato bajo una pila de aros de cebolla cruda, con un gajo de limón.',
      credit: 'Club de la Amistad por un Hialeah Mejor — event flyer',
    },
    en: {
      title: "We're meeting at Casa Marín",
      timeLabel: 'Time to be confirmed',
      freeLabel: 'MEMBERS AND VOLUNTEERS',
      note: 'Lunch among neighbours, members and volunteers of the Club de la Amistad, at the table of a Palm Avenue restaurant that has always been there.',
    },
    es: {
      title: 'Nos reunimos en Casa Marín',
      timeLabel: 'Por confirmar',
      freeLabel: 'SOCIOS Y VOLUNTARIOS',
      note: 'Un almuerzo entre vecinos, socios y voluntarios del Club de la Amistad, en la mesa de un restaurante de siempre en Palm Avenue.',
    },
  },
]

/**
 * Drop taxonomy rows that are no longer in `CAT_KEEP`.
 *
 * The seed only upserts, so without this the retired categories survive in a
 * database that has already been seeded once — which is every deployed one —
 * and keep showing up in the List Your Spot dropdown.
 *
 * Refuses rather than orphans: a category still referenced by a listing or by
 * a submitted listing request is a signal that the trim is wrong, not
 * something to delete around.
 */
async function pruneCategories(payload: Payload): Promise<void> {
  const { docs } = await payload.find({
    collection: 'categories',
    where: { slug: { not_in: CAT_KEEP } },
    limit: 100,
    depth: 0,
  })
  for (const doc of docs) {
    for (const collection of ['listings', 'listing-requests'] as const) {
      const used = await payload.count({
        collection,
        where: { category: { equals: doc.id } },
      })
      if (used.totalDocs) {
        throw new Error(
          `refusing to prune category "${(doc as any).slug}": ${used.totalDocs} ${collection} still reference it`,
        )
      }
    }
    await payload.delete({ collection: 'categories', id: doc.id })
    console.log(`  - pruned category ${(doc as any).slug}`)
  }
}

/**
 * Apply `SLUG_RENAMES` before the research loop runs.
 *
 * `upsert` keys on slug, so a listing whose slug changed in `listings.json`
 * would otherwise be *created* rather than renamed — leaving the old row behind
 * and taking the count from 11 to 12, which `verify` then fails on.
 *
 * Renaming in place matters beyond the count: the row keeps its id, so the
 * story blocks, hours, research sources and locale rows that hang off it stay
 * attached instead of being rebuilt.
 *
 * Refuses when both slugs exist, on the same grounds as `pruneCategories`:
 * two rows means an earlier run already created the duplicate, and picking one
 * to keep is a guess. The message names the fix rather than leaving a dead end.
 */
async function renameListings(payload: Payload): Promise<void> {
  for (const [from, to] of Object.entries(SLUG_RENAMES)) {
    const [oldRow, newRow] = await Promise.all([
      payload.find({ collection: 'listings', where: { slug: { equals: from } }, limit: 1, depth: 0 }),
      payload.find({ collection: 'listings', where: { slug: { equals: to } }, limit: 1, depth: 0 }),
    ])
    if (!oldRow.docs.length) continue // already renamed, or never seeded
    if (newRow.docs.length) {
      throw new Error(
        `cannot rename listing "${from}" → "${to}": both slugs exist. An earlier seed ran ` +
          `before the rename was in place and created a duplicate. Delete the orphaned ` +
          `"${from}" row (admin → Listings, or a delete by slug) and seed again.`,
      )
    }
    await payload.update({
      collection: 'listings',
      id: oldRow.docs[0].id,
      data: { slug: to },
      locale: 'en',
      depth: 0,
    })
    console.log(`  ~ renamed listing ${from} → ${to}`)
  }
}

async function upsertMedia(
  payload: Payload,
  relPath: string,
  altEn: string,
  altEs?: string,
  credit?: string,
): Promise<number | undefined> {
  const abs = path.join(SITE_ROOT, relPath)
  if (!fs.existsSync(abs)) {
    console.warn(`  ! missing media, skipped: ${relPath}`)
    return undefined
  }
  const filename = path.basename(abs)

  const existing = await payload.find({
    collection: 'media',
    where: { filename: { equals: filename } },
    limit: 1,
    depth: 0,
  })
  if (existing.docs.length) return existing.docs[0].id as number

  const doc = await payload.create({
    collection: 'media',
    data: { alt: altEn, ...(credit ? { credit } : {}) },
    filePath: abs,
    locale: 'en',
    depth: 0,
  })
  if (altEs && altEs !== altEn) {
    await payload.update({
      collection: 'media',
      id: doc.id,
      data: { alt: altEs },
      locale: 'es',
      depth: 0,
    })
  }
  return doc.id as number
}

/* -------------------------------------------------------------------- seeds */

async function seed() {
  const payload = await getPayload({ config })
  const id: Dict = { cities: {}, categories: {}, kinds: {}, listings: {} }

  /* --- Admin user --------------------------------------------------------- */
  // So a fresh clone is `pnpm seed` and nothing else. Skipped if any user
  // already exists, and skipped entirely when the env vars are unset — in which
  // case Payload's own create-first-user screen handles it at /admin.
  const adminEmail = process.env.PAYLOAD_ADMIN_EMAIL
  const adminPassword = process.env.PAYLOAD_ADMIN_PASSWORD
  const { totalDocs: userCount } = await payload.count({ collection: 'users' })
  if (userCount === 0 && adminEmail && adminPassword) {
    await payload.create({
      collection: 'users',
      data: { email: adminEmail, password: adminPassword },
    })
    console.log(`created admin user ${adminEmail}`)
  }

  /* --- Media -------------------------------------------------------------- */
  console.log('media…')
  // Only real photography. Every business photo, event image and story cover is
  // still an unfilled slot — the .image-slots.state.json sidecar was never
  // created — so there is nothing else to import. Favicons are chrome, not
  // content, and are deliberately left out.
  const cityPhoto: Dict = {
    // Largest available source per city; Payload derives the responsive set.
    hialeah: await upsertMedia(payload, 'assets/hialeah-516.webp', 'Hialeah street scene'),
    lakes: await upsertMedia(payload, 'assets/lakes-547.webp', 'Miami Lakes town center'),
    havana: await upsertMedia(payload, 'assets/havana-1920.webp', 'Little Havana, Calle Ocho'),
  }
  const mascotSolo: Dict = {
    'mascots/flamingo-hialeah.png': await upsertMedia(
      payload,
      'mascots/flamingo-hialeah.png',
      'Rafa, the Hialeah flamingo',
      'Rafa, el flamenco de Hialeah',
    ),
    'mascots/cow-miami-lakes.png': await upsertMedia(
      payload,
      'mascots/cow-miami-lakes.png',
      'Toni, the Miami Lakes cow',
      'Toni, la vaca de Miami Lakes',
    ),
    'mascots/rooster-havana.png': await upsertMedia(
      payload,
      'mascots/rooster-havana.png',
      'Rigo, the Little Havana rooster',
      'Rigo, el gallo de La Pequeña Habana',
    ),
  }
  const castArt: Dict = {
    'uploads/flako-y-rizza-bust.png': await upsertMedia(
      payload,
      'uploads/flako-y-rizza-bust.png',
      'Rafa and Yoli',
    ),
    'uploads/scene-los-mucho-close.png': await upsertMedia(
      payload,
      'uploads/scene-los-mucho-close.png',
      'Toni, Marisol, Mila and Chucho',
    ),
    'uploads/ocho-y-las-gallinas-bust.png': await upsertMedia(
      payload,
      'uploads/ocho-y-las-gallinas-bust.png',
      'Blanca, Rigo and Daysi',
    ),
  }
  const carlosPhoto = await upsertMedia(
    payload,
    'uploads/carlos.png',
    'Carlos Masson',
    'Carlos Masson',
  )
  // The all-cities hero, used on the home page when no city filter is applied.
  const skylineHero = await upsertMedia(
    payload,
    'assets/skyline-hero.png',
    'The Miami skyline',
    'El horizonte de Miami',
  )
  const losTres = await upsertMedia(
    payload,
    'uploads/los-tres-bust-536a000f.png',
    'Rigo, Rafa and Toni',
  )

  /* --- Cities ------------------------------------------------------------- */
  console.log('cities…')
  for (const [i, [key, c]] of Object.entries<any>(base.CITIES).entries()) {
    const doc = await upsert(
      payload,
      'cities',
      key,
      {
        name: en(c.name),
        sub: en(c.sub),
        blurb: en(c.blurb),
        // Source key order is the tab order: hialeah, lakes, havana.
        order: i,
        lead: c.lead ?? 0,
        accent: c.accent,
        castBg: c.castBg,
        photo: cityPhoto[key],
        photoPos: c.photoPos,
        solo: mascotSolo[c.solo],
        soloName: en(c.soloName),
        castCount: c.castCount,
        groupAR: c.groupAR,
        headOffset: c.head,
        cast: (c.cast ?? []).map((m: any) => ({
          image: castArt[m.src],
          name: decodeEntities(m.name),
          bg: m.bg,
          z: m.z,
          group: Boolean(m.group),
        })),
      },
      { sub: es(c.sub), blurb: es(c.blurb) },
    )
    id.cities[key] = doc.id
  }

  /* --- Taxonomies --------------------------------------------------------- */
  // `all` is the leading entry of both source arrays and is a filter-chip
  // affordance, not a taxonomy row. Dropped on purpose: 6 -> 5, 8 -> 7.
  console.log('categories…')
  const cats = [...base.CATS.filter((c: any) => CAT_KEEP.includes(c.key)), ...EXTRA_CATS]
  for (const [i, c] of cats.entries()) {
    const relabel = CAT_RELABEL[c.key]
    const doc = await upsert(
      payload,
      'categories',
      c.key,
      { label: relabel?.en ?? en(c.label), order: i },
      { label: relabel?.es ?? es(c.label) },
    )
    id.categories[c.key] = doc.id
  }
  await pruneCategories(payload)

  console.log('event kinds…')
  for (const [i, k] of base.EKINDS.filter((k: any) => k.key !== 'all').entries()) {
    const doc = await upsert(
      payload,
      'event-kinds',
      k.key,
      { label: en(k.label), bg: k.bg, ink: k.ink, order: i },
      { label: es(k.label) },
    )
    id.kinds[k.key] = doc.id
  }

  /* --- Listings ----------------------------------------------------------- */
  if (SEED_MOCKS) {
    console.log('listings…')
    for (const b of base.BIZ) {
      // DETAIL has exactly one authored entry. The other 13 listings' phone,
      // site, hours, story and quote are fabricated at render time from the array
      // index in Business.dc.html — importing that would launder placeholders in
      // as authored content, so anything without a DETAIL record gets no detail.
      const d = base.DETAIL[b.id]

      const detailEn = d
        ? {
            story: (d.story ?? []).map((t: string) => ({ text: en(t) })),
            quote: en(d.quote),
            quoteBy: en(d.quoteBy),
            crewLine: en(d.crewLine),
            address: d.address,
            phone: d.phone,
            site: d.site,
            cta: en(d.cta),
            hours: (d.hours ?? []).map((h: any) => ({ d: en(h.d), t: h.t })),
          }
        : undefined

      // `story` is a localized array (each locale owns its own rows), but `hours`
      // is not — only the fields inside it are. It needs the English row ids
      // carried over or the ES write rebuilds the array.
      const detailEs = (enDoc: any) => {
        if (!d) return {}
        const enDetail = enDoc?.detail ?? {}
        return {
          detail: {
            story: (d.story ?? []).map((t: string) => ({ text: es(t) })),
            quote: es(d.quote),
            crewLine: es(d.crewLine),
            cta: es(d.cta),
            hours: withIds(
              (d.hours ?? []).map((h: any) => ({ d: es(h.d), t: h.t })),
              enDetail.hours,
            ),
          },
        }
      }

      const doc = await upsert(
        payload,
        'listings',
        b.id,
        {
          name: en(b.name),
          city: id.cities[b.city],
          category: id.categories[b.cat],
          hood: b.hood,
          tag: en(b.tag),
          rating: b.rating,
          reviews: b.reviews,
          member: Boolean(b.member),
          // Design content, not researched: phone/hours/story were synthesized
          // from the array index. Flagged so a sourced record is distinguishable
          // from a plausible one at a glance and by query.
          publicationStatus: 'unsourced',
          imageHint: en(b.hint),
          ...(detailEn ? { detail: detailEn } : {}),
        },
        (enDoc) => ({
          tag: es(b.tag),
          imageHint: es(b.hint),
          ...detailEs(enDoc),
        }),
      )
      id.listings[b.id] = doc.id
    }
  }

  /* --- Researched listings ------------------------------------------------ */
  // Renames run first, and deliberately OUTSIDE the try below: that catch turns
  // a missing research file into a skip, and a duplicate-slug refusal must not
  // be swallowed by it.
  await renameListings(payload)

  // Additive: these carry their own slugs and never collide with BIZ. Skipped
  // rather than fatal when the sibling research repo is not checked out, so a
  // clone of this repo alone still seeds.
  try {
    const research = loadResearch()
    console.log(`researched listings… (${research.length})`)
    for (const r of research) {
      if (!CITY[r.city] || !CATEGORY[r.category]) {
        console.log(`  skip ${r.slug}: no mapping for ${r.city}/${r.category}`)
        continue
      }
      // The hero storefront shot, where one has been taken. Merged
      // conditionally: `upsert` issues a partial update, so omitting the key
      // leaves whatever an editor uploaded for the listings without one, rather
      // than clearing it on every seed.
      const photo = LISTING_PHOTO[r.slug]
      const mediaId = photo
        ? await upsertMedia(payload, photo.file, photo.altEn, photo.altEs, photo.credit)
        : undefined
      const data = { ...toListing(r, id), ...(mediaId ? { gallery: [mediaId] } : {}) }
      const doc = await upsert(payload, 'listings', r.slug, data)
      id.listings[r.slug] = doc.id
    }
  } catch (err) {
    console.log(`researched listings… skipped (${(err as Error).message})`)
  }

  /* --- Stories ------------------------------------------------------------ */
  if (SEED_MOCKS) {
    console.log('stories…')
    for (const s of base.STORIES) {
      // The source body is a positional tuple array: ['q', text, by],
      // ['pair', [hintA, capA], [hintB, capB]], ['img', hint, cap, ar] and so on,
      // decoded by storyBlocks() at fc-data.js:492.
      const toBlock = (b: any[], locale: 'en' | 'es') => {
        const t = locale === 'en' ? en : es
        switch (b[0]) {
          case 'drop':
            return { blockType: 'dropCap', text: t(b[1]) }
          case 'p':
            return { blockType: 'paragraph', text: t(b[1]) }
          case 'q':
            return { blockType: 'pullQuote', text: t(b[1]), attribution: en(b[2]) }
          case 'img':
            return {
              blockType: 'image',
              hint: t(b[1]),
              caption: t(b[2]),
              aspectRatio: b[3] ?? '16 / 9',
            }
          case 'pair':
            return {
              blockType: 'imagePair',
              a: { hint: t(b[1]?.[0]), caption: t(b[1]?.[1]) },
              b: { hint: t(b[2]?.[0]), caption: t(b[2]?.[1]) },
            }
          case 'note':
            return { blockType: 'calloutNote', title: t(b[1]), text: t(b[2]) }
          case 'beat':
            return { blockType: 'sectionBreak' }
          default:
            throw new Error(`Unknown story block type "${b[0]}" in story ${s.id}`)
        }
      }

      const doc = await upsert(payload, 'stories', s.id, {
        title: en(s.title),
        dek: en(s.dek),
        kicker: en(s.kicker),
        readTime: s.readTime,
        byline: en(s.byline),
        listing: id.listings[s.biz],
        bizCta: en(s.bizCta),
        coverHint: en(s.coverHint),
        coverCap: en(s.coverCap),
        outro: en(s.outro),
        blocks: s.blocks.map((b: any[]) => toBlock(b, 'en')),
      })

      // Block STRUCTURE is shared across locales; only the text inside is
      // localized. Payload matches array rows on their generated `id`, so the ES
      // pass has to carry the ids back from the EN write — without them the
      // update is treated as a replacement and the array is rebuilt (duplicated
      // or reordered) instead of translated in place.
      const fresh = await payload.findByID({
        collection: 'stories',
        id: doc.id,
        locale: 'en',
        depth: 0,
      })
      const enBlocks = (fresh as any).blocks ?? []

      await payload.update({
        collection: 'stories',
        id: doc.id,
        locale: 'es',
        depth: 0,
        data: {
          title: es(s.title),
          dek: es(s.dek),
          kicker: es(s.kicker),
          bizCta: es(s.bizCta),
          coverHint: es(s.coverHint),
          coverCap: es(s.coverCap),
          // KNOWN GAP: no story has a Spanish outro in the dictionary, so es()
          // returns the English string. The old site rendered English here too.
          outro: es(s.outro),
          blocks: s.blocks.map((b: any[], i: number) => ({
            ...toBlock(b, 'es'),
            id: enBlocks[i]?.id,
          })),
        },
      })
    }
  }

  /* --- Events ------------------------------------------------------------- */
  if (SEED_MOCKS) {
    console.log('events…')
    for (const e of base.EVENTS) {
      // Venue is a branch in the source: 16 events carry `biz`, 4 carry
      // `place` + `hood` + `city`.
      const atListing = Boolean(e.biz)
      await upsert(
        payload,
        'events',
        e.id,
        {
          title: en(e.title),
          date: new Date(`${e.d}T12:00:00.000Z`).toISOString(),
          timeLabel: e.time,
          kind: id.kinds[e.kind],
          venueType: atListing ? 'listing' : 'place',
          listing: atListing ? id.listings[e.biz] : undefined,
          place: atListing ? undefined : en(e.place),
          hood: atListing ? undefined : e.hood,
          city: atListing ? undefined : id.cities[e.city],
          star: Boolean(e.star),
          going: e.going ?? 0,
          freeLabel: en(e.free),
          note: en(e.note),
          imageHint: en(e.hint),
        },
        {
          title: es(e.title),
          place: atListing ? undefined : es(e.place),
          freeLabel: es(e.free),
          note: es(e.note),
          imageHint: es(e.hint),
        },
      )
    }
  }

  /* --- Real events -------------------------------------------------------- */
  // The 20 events above are design fiction and stay behind SEED_MOCK_CONTENT,
  // which left no route at all for an event that actually happens. These are
  // authored here for the same reason CAT_RELABEL and LISTING_PHOTO are: there
  // is no upstream file to put them in, and fc-data.js is re-pulled.
  //
  // Runs AFTER the researched-listings loop on purpose — a `listing` venue
  // needs id.listings to be populated, and a missing id would write an event
  // with no venue rather than fail.
  //
  // Spanish is the source language here, which inverts the listing importer's
  // English-only rule: these events are announced on Spanish flyers, so both
  // locales are authored rather than run through the EN→ES dictionary.
  console.log('real events…')
  for (const e of REAL_EVENTS) {
    const mediaId = e.photo
      ? await upsertMedia(payload, e.photo.file, e.photo.altEn, e.photo.altEs, e.photo.credit)
      : undefined
    const listingId = id.listings[e.listing]
    if (!listingId) {
      throw new Error(
        `event "${e.slug}" is at listing "${e.listing}", which was not seeded. ` +
          `Check that it is in data-import/listings.json and that its city and ` +
          `category both have a mapping in research-listings.ts.`,
      )
    }
    await upsert(
      payload,
      'events',
      e.slug,
      {
        title: e.en.title,
        // Midday UTC, matching the loop above: a bare calendar date lands on
        // the previous day once dateOnly() reads it back in America/New_York.
        date: new Date(`${e.date}T12:00:00.000Z`).toISOString(),
        timeLabel: e.en.timeLabel,
        kind: id.kinds[e.kind],
        venueType: 'listing',
        listing: listingId,
        star: e.star,
        going: 0,
        freeLabel: e.en.freeLabel,
        note: e.en.note,
        ...(mediaId ? { image: mediaId } : {}),
      },
      {
        title: e.es.title,
        timeLabel: e.es.timeLabel,
        freeLabel: e.es.freeLabel,
        note: e.es.note,
      },
    )
  }

  /* --- Weekly ------------------------------------------------------------- */
  if (SEED_MOCKS) {
    console.log('weekly events…')
    for (const w of base.WEEKLY) {
      // No id in the source — mint a stable one so re-runs update rather than
      // appending six more rows every time.
      const slug = `weekly-${w.dow}-${slugify(w.title)}`
      await upsert(
        payload,
        'weekly-events',
        slug,
        {
          title: en(w.title),
          dow: String(w.dow),
          time: w.time,
          listing: id.listings[w.biz],
          kind: id.kinds[w.kind],
        },
        { title: es(w.title) },
      )
    }
  }

  /* --- Spotlights --------------------------------------------------------- */
  if (SEED_MOCKS) {
    console.log('spotlights…')
    for (const [cityKey, s] of Object.entries<any>(base.SPOTS)) {
      // Same story: SPOTS is keyed by city with no id inside the record.
      await upsert(
        payload,
        'spotlights',
        `spotlight-${cityKey}`,
        {
          city: id.cities[cityKey],
          listing: id.listings[s.biz],
          kind: en(s.kind),
          deal: en(s.deal),
          blurb: en(s.blurb),
        },
        { kind: es(s.kind), deal: es(s.deal), blurb: es(s.blurb) },
      )
    }
  }

  /* --- Globals ------------------------------------------------------------ */
  console.log('globals…')
  // The data-props defaults carried on the Home/City/Business/Events/
  // ListYourSpot components.
  await payload.updateGlobal({
    slug: 'site-settings',
    locale: 'en',
    data: {
      showSpotlight: true,
      showRatings: true,
      memberBadges: true,
      contactEmail: 'hola@flamingocounty.com',
      contactPhone: '(305) 555-0100',
      heroPhoto: skylineHero,
      heroCast: losTres,
      heroCastBg: '#00feff',
    },
  })

  await seedAboutPage(payload, carlosPhoto)
  await seedListYourSpotPage(payload)

  /* --- Report ------------------------------------------------------------- */
  console.log('')
  for (const c of [
    'cities',
    'categories',
    'event-kinds',
    'listings',
    'stories',
    'events',
    'weekly-events',
    'spotlights',
    'media',
  ] as const) {
    const { totalDocs } = await payload.count({ collection: c })
    console.log(`  ${String(totalDocs).padStart(3)}  ${c}`)
  }
  console.log('\nseed complete. Re-run it — the counts above must not change.')
  process.exit(0)
}

/**
 * About-page copy. This lived as inline L(en, es) pairs in About.dc.html and is
 * in neither the ES dictionary nor fc-data.js, so both languages are written
 * out here rather than derived through T().
 */
async function seedAboutPage(payload: Payload, photo: any) {
  const EN = {
    kicker: 'WHY THIS EXISTS',
    h1a: 'BUILT BY ONE',
    h1b: 'OF US.',
    intro:
      'Flamingo County is a directory for neighborhoods that already know each other. Every listing is a restaurant or a bar somebody on these streets vouched for. I write the story pages myself, hunt down the city events nobody posts, and send one email on Fridays.',
    photoHint: 'Photo: Carlos, Hialeah/Miami Lakes',
    founderKicker: 'THE PERSON BEHIND THE PAGES',
    founderP1:
      'Miami-Dade has more personality than any directory gives it credit for. I grew up in Hialeah, live in Miami Lakes now with my wife and daughter, and build software for a living. Once AI put real production power in one person’s hands, I decided to spend it building the best business listing a county like ours has ever had — not a spreadsheet with a map pin, a place with a pulse.',
    founderP2:
      'That’s why every city gets its own cast of characters instead of a generic logo — the flamingo, the rooster, the cow — built to carry the chiste and the warmth of a Latin neighborhood, not just point at it. They introduce the businesses, tell how each one came to be, and show up again for the deals and events that keep this community moving.',
    founderSig: '— Carlos Masson',
    founderTag: 'SOFTWARE DEVELOPER · HIALEAH RAISED · MIAMI LAKES NOW',
    howH: 'HOW IT WORKS',
    ctaH: 'OWN A SPOT AROUND HERE?',
    ctaP: 'Your city mascot on the card.',
    ctaBtn: 'LIST YOUR BUSINESS',
    reachH: 'REACH ME',
    reachP:
      'Tips, corrections, and events I missed — send them over. I read every one myself.',
  }
  const ES = {
    kicker: 'POR QUÉ EXISTE ESTO',
    h1a: 'HECHO POR UNO',
    h1b: 'DE LOS NUESTROS.',
    intro:
      'Flamingo County es un directorio pa’ los barrios que ya se conocen. Cada ficha es un restaurante o un bar que alguien de estas calles respalda. Las historias las escribo yo mismo, cazo los eventos que nadie publica y mando un solo correo los viernes.',
    photoHint: 'Foto: Carlos, Hialeah/Miami Lakes',
    founderKicker: 'LA PERSONA DETRÁS DE LAS PÁGINAS',
    founderP1:
      'Miami-Dade tiene más personalidad de la que cualquier directorio le reconoce. Crecí en Hialeah, hoy vivo en Miami Lakes con mi esposa y mi hija, y me dedico al desarrollo de software. Cuando la IA le dio a una sola persona el poder de construir en serio, decidí usarlo para hacerle a nuestro condado el mejor directorio de negocios que ha tenido — no una hoja de cálculo con un pin en el mapa, un lugar con pulso.',
    founderP2:
      'Por eso cada ciudad tiene su propio elenco de personajes en vez de un logo genérico — el flamenco, el gallo, la vaca — hechos para llevar el chiste y el calor de un barrio latino, no solo señalarlo. Ellos presentan los negocios, cuentan cómo nacieron y vuelven a aparecer en las ofertas y eventos que mantienen viva a esta comunidad.',
    founderSig: '— Carlos Masson',
    founderTag: 'DESARROLLADOR DE SOFTWARE · CRIADO EN HIALEAH · AHORA EN MIAMI LAKES',
    howH: 'CÓMO FUNCIONA',
    ctaH: '¿TIENES UN NEGOCIO POR AQUÍ?',
    ctaP: 'La mascota de tu ciudad en la ficha.',
    ctaBtn: T('LIST YOUR BUSINESS'),
    reachH: 'ESCRÍBEME',
    reachP:
      'Datos, correcciones y eventos que se me escaparon — mándalos. Los leo yo mismo.',
  }

  const steps = [
    {
      n: '1',
      bg: 'linear-gradient(160deg,#7CF0FA 0%,#16E0F2 52%,#04AEBE 100%)',
      en: {
        t: 'THE NEIGHBORS VOUCH',
        d: 'A business gets listed because people who live here use it. No paid placement in the grid, no bought reviews.',
      },
      es: {
        t: 'EL BARRIO RESPONDE',
        d: 'Un negocio entra porque la gente de aquí lo usa. Sin puestos pagados en la lista, sin reseñas compradas.',
      },
    },
    {
      n: '2',
      bg: '#FFD400',
      en: {
        t: 'I WRITE IT DOWN',
        d: 'I sit with the owner, take pictures, and write the story page myself. They approve it before it goes up.',
      },
      es: {
        t: 'YO LO ESCRIBO',
        d: 'Me siento con el dueño, tomo fotos y escribo la página de la historia yo mismo. Él la aprueba antes de publicarla.',
      },
    },
    {
      n: '3',
      bg: 'linear-gradient(160deg,#FFFFFA 0%,#FFF6E5 55%,#F4E3C6 100%)',
      en: {
        t: 'THE CREWS SHOW UP',
        d: 'Events, the Friday email and the spotlight put people through the door — the part a map pin never does.',
      },
      es: {
        t: 'LA PANDILLA APARECE',
        d: 'Los eventos, el correo del viernes y el destacado meten gente por la puerta — eso no lo hace un punto en el mapa.',
      },
    },
  ]

  const doc = await payload.updateGlobal({
    slug: 'about-page',
    locale: 'en',
    data: { ...EN, photo, steps: steps.map((s) => ({ n: s.n, bg: s.bg, ...s.en })) },
  })

  // Same block-id rule as stories: carry the row ids so the ES write updates
  // rows in place instead of rebuilding the array.
  const rows = (doc as any).steps ?? []
  await payload.updateGlobal({
    slug: 'about-page',
    locale: 'es',
    data: {
      ...ES,
      steps: steps.map((s, i) => ({ id: rows[i]?.id, n: s.n, bg: s.bg, ...s.es })),
    },
  })
}

/**
 * Membership perks (ListYourSpot.dc.html:176) and the shared services list
 * (Business.dc.html:232). Both go through the ES dictionary, which covers them.
 *
 * `icon` is named per perk here. The old site derived it from array position
 * via perkIcon(i), so reordering the perks silently reassigned every icon.
 */
/** Narrow to the generated union so a typo'd icon name fails at compile time. */
type PerkIcon = NonNullable<NonNullable<NonNullable<ListYourSpotPage['perks']>[number]>['icon']>

async function seedListYourSpotPage(payload: Payload) {
  const perks: { icon: PerkIcon; t: string; d: string }[] = [
    {
      icon: 'map-pin',
      t: 'Listed in your own city',
      d: 'One listing on your city page, plus the main directory everyone lands on.',
    },
    {
      icon: 'nfc',
      t: 'NFC card + a landing page',
      d: 'We print your tap-to-open card and build the landing page it opens — hours, directions, all of it.',
    },
    {
      icon: 'qr-code',
      t: 'QR codes, hosted by us',
      d: 'Promo or contact QR codes we host for you. Change where they point anytime, the sticker stays the same.',
    },
    {
      icon: 'newspaper',
      t: 'A real story page',
      d: 'We interview you and write it. Services, hours, gallery included.',
    },
    {
      icon: 'megaphone',
      t: 'Spotlight rotation',
      d: 'Restaurants, bars and clubs rotate through the Friday spotlight with your own promo.',
    },
    {
      icon: 'bird',
      t: 'Your city mascot',
      d: 'The flamingo, the cow or the rooster on your card. Locals know what it means.',
    },
  ]

  // Trade copy, and it stays trade copy: the business page only renders it for
  // the trade categories, which nothing is filed under today. Rewriting it into
  // hospitality claims would be inventing facts about businesses nobody asked.
  const services = [
    'Estimates on request',
    'Licensed & insured',
    'Warranty on the work',
    'Bilingual crew',
  ]

  const doc = await payload.updateGlobal({
    slug: 'list-your-spot-page',
    locale: 'en',
    data: {
      perks: perks.map((p) => ({ icon: p.icon, t: en(p.t), d: en(p.d) })),
      services: services.map((s) => ({ text: en(s) })),
    },
  })

  const perkRows = (doc as any).perks ?? []
  const serviceRows = (doc as any).services ?? []
  await payload.updateGlobal({
    slug: 'list-your-spot-page',
    locale: 'es',
    data: {
      perks: perks.map((p, i) => ({ id: perkRows[i]?.id, icon: p.icon, t: es(p.t), d: es(p.d) })),
      services: services.map((s, i) => ({ id: serviceRows[i]?.id, text: es(s) })),
    },
  })
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
