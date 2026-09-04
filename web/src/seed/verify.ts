/**
 * Reads back what the seed wrote and asserts the things that would otherwise
 * fail silently: locale coverage, the block-id two-pass write, the venue
 * branch, and that fabricated business detail did NOT come along.
 *
 *   pnpm verify
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '../payload.config'
import { LISTING_PHOTO, LISTING_LOGO, SLUG_RENAMES } from './research-listings'
import { REAL_EVENTS } from './real-events'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * Mirrors the seed's `SEED_MOCK_CONTENT`. Most of the assertions below describe
 * `fc-data.js` fiction — el-gallo's story blocks, the event venues.
 * With the mocks not imported there is nothing for them to check, so they are
 * gated rather than deleted: turn the flag back on and the full suite runs.
 */
const SEED_MOCKS = process.env.SEED_MOCK_CONTENT === '1'

async function main() {
  const payload = await getPayload({ config })

  /* counts */
  const want: Record<string, number> = {
    cities: 3,
    categories: 3,
    'event-kinds': 7,
    // 13 researched imports; +14 fc-data mocks only when they are seeded.
    listings: SEED_MOCKS ? 27 : 13,
    stories: SEED_MOCKS ? 3 : 0,
    // The 20 mocks, plus the one real event that seeds either way.
    events: SEED_MOCKS ? 21 : 1,
    'weekly-events': SEED_MOCKS ? 6 : 0,
    spotlights: SEED_MOCKS ? 3 : 0,
  }
  for (const [c, n] of Object.entries(want)) {
    const { totalDocs } = await payload.count({ collection: c as any })
    check(`${c} = ${n}`, totalDocs === n, `got ${totalDocs}`)
  }

  /* the "all" chip must not have been imported as a taxonomy row */
  for (const c of ['categories', 'event-kinds'] as const) {
    const r = await payload.find({ collection: c, where: { slug: { equals: 'all' } }, limit: 1 })
    check(`${c} has no "all" row`, r.docs.length === 0)
  }

  /* the taxonomy is trimmed to what has listings behind it, and relabelled */
  {
    const cats = await payload.find({ collection: 'categories', limit: 50, sort: 'order' })
    const slugs = cats.docs.map((d: any) => d.slug).sort()
    check(
      'categories are food + night + nonprofit only',
      slugs.join(',') === 'food,night,nonprofit',
      `got ${slugs.join(',') || '(none)'}`,
    )
    const labels = Object.fromEntries(cats.docs.map((d: any) => [d.slug, d.label]))
    check('food is labelled RESTAURANTS', labels.food === 'RESTAURANTS', `got ${labels.food}`)
    check('night is labelled BARS', labels.night === 'BARS', `got ${labels.night}`)
    const es = await payload.find({ collection: 'categories', limit: 50, locale: 'es' })
    const esLabels = Object.fromEntries(es.docs.map((d: any) => [d.slug, d.label]))
    check('food ES is RESTAURANTES', esLabels.food === 'RESTAURANTES', `got ${esLabels.food}`)
    check('night ES is BARES', esLabels.night === 'BARES', `got ${esLabels.night}`)
  }

  /* --- the researched imports ------------------------------------------- */
  const sourced = await payload.find({
    collection: 'listings',
    where: { publicationStatus: { not_equals: 'unsourced' } },
    limit: 100,
    depth: 0,
  })
  check('13 researched listings imported', sourced.totalDocs === 13, `got ${sourced.totalDocs}`)
  check(
    'no unsourced listing is present unless mocks were seeded',
    (await payload.count({
      collection: 'listings',
      where: { publicationStatus: { equals: 'unsourced' } },
    })).totalDocs === (SEED_MOCKS ? 14 : 0),
  )
  /* Listings with no premises to give an address for.
   *
   * The check below exists to catch an import that silently dropped its
   * contact fields, and it held while every listing was a business with a
   * front door. Club de la Amistad is a volunteer club that walks the city and
   * reports from phones — it has no office and publishes no number, so an
   * address here would be an invention rather than a fact.
   *
   * Named one by one rather than exempting the whole `nonprofit` category: a
   * nonprofit with an office should still be held to the rule, and this way
   * the exemption cannot widen without someone editing this list. The second
   * check is the price of the first — an exempted listing has to say in
   * `blockingGaps` why it has nothing, so "no address" stays a recorded fact
   * and not an empty field nobody noticed. */
  const NO_PREMISES = new Set(['el-club-de-la-amistad'])
  const withPremises = sourced.docs.filter((d: any) => !NO_PREMISES.has(d.slug))
  check(
    'every researched listing with premises has a phone and an address',
    withPremises.every((d: any) => d.detail?.phone && d.detail?.address),
    withPremises
      .filter((d: any) => !(d.detail?.phone && d.detail?.address))
      .map((d: any) => d.slug)
      .join(', '),
  )
  check(
    'every listing without premises says so in its blocking gaps',
    sourced.docs
      .filter((d: any) => NO_PREMISES.has(d.slug))
      .every((d: any) =>
        (d.research?.blockingGaps ?? []).some((g: string) => /address|premises/i.test(g)),
      ),
  )
  check(
    'every researched listing cites at least one source',
    sourced.docs.every((d: any) => (d.research?.sources?.length ?? 0) > 0),
  )
  /* --- the storefront photography ---------------------------------------- */
  // `upsertMedia` warns and returns undefined when it cannot find a file, and
  // the research loop sits inside a catch that downgrades a throw to a skip —
  // so a wrong path produces a green seed and a blank slot. Seven of the eleven
  // source files were named differently from the listing they belong to, which
  // is exactly the mistake this catches.
  {
    const slugs = Object.keys(LISTING_PHOTO)
    const withPhoto = await payload.find({
      collection: 'listings',
      where: { slug: { in: slugs } },
      limit: 100,
      depth: 1,
    })
    const missing = slugs.filter((slug) => {
      const doc: any = withPhoto.docs.find((d: any) => d.slug === slug)
      return !doc?.gallery?.[0]?.url
    })
    check(
      `all ${slugs.length} listings with a storefront photo have a hero image`,
      missing.length === 0,
      missing.length ? `no gallery[0]: ${missing.join(', ')}` : '',
    )
  }

  /* --- the venue marks ---------------------------------------------------- */
  // Same trap as the photos above, and worse hidden: `logo` is merged
  // conditionally, so a moved or renamed file writes no key at all and leaves
  // whatever was there. The event page then draws no venue mark and says
  // nothing about it — the only symptom is a corner of a photograph that is
  // emptier than it should be.
  {
    const slugs = Object.keys(LISTING_LOGO)
    const withLogo = await payload.find({
      collection: 'listings',
      where: { slug: { in: slugs } },
      limit: 100,
      depth: 1,
    })
    const missing = slugs.filter((slug) => {
      const doc: any = withLogo.docs.find((d: any) => d.slug === slug)
      return !doc?.logo?.url
    })
    check(
      `all ${slugs.length} listings with a logo have it on the listing`,
      missing.length === 0,
      missing.length ? `no logo: ${missing.join(', ')}` : '',
    )
  }

  /* --- the events that carry a clock -------------------------------------- */
  // `startTime` is merged conditionally, so a typo in the key writes nothing
  // and says nothing: the page still prints `timeLabel` and looks right, while
  // the .ics quietly reverts to an all-day banner. Nobody would find that
  // without opening the downloaded file.
  //
  // The pair cannot be checked for agreement — '9:00 AM' and '09:00' are the
  // same instant said twice, in two notations, and only a human knows that.
  // What is checkable is that an event claiming an hour actually has both
  // halves, in both languages.
  for (const e of REAL_EVENTS) {
    if (!e.startTime) continue
    for (const locale of ['en', 'es'] as const) {
      const { docs } = await payload.find({
        collection: 'events',
        where: { slug: { equals: e.slug } },
        locale,
        limit: 1,
        depth: 0,
      })
      const doc: any = docs[0]
      // `check` prints its third argument whether it passed or not, so the
      // detail is only built for the failing case — the existing photo check
      // does the same.
      const started = doc?.startTime === e.startTime
      check(
        `"${e.slug}" has a start time the calendar can read (${locale})`,
        started,
        started ? '' : `expected ${e.startTime}, got ${doc?.startTime ?? 'nothing'}`,
      )
      const labelled = Boolean(doc?.timeLabel)
      check(
        `"${e.slug}" still prints a time to the reader (${locale})`,
        labelled,
        labelled ? '' : 'timeLabel is empty, so the page shows an hour nowhere',
      )
    }
  }

  /* --- slug renames actually renamed, rather than duplicating ------------- */
  for (const [from, to] of Object.entries(SLUG_RENAMES)) {
    const stale = await payload.count({ collection: 'listings', where: { slug: { equals: from } } })
    check(`no listing still uses the pre-rename slug "${from}"`, stale.totalDocs === 0)
    const renamed = await payload.find({
      collection: 'listings',
      where: { slug: { equals: to } },
      limit: 1,
      depth: 0,
    })
    check(`"${to}" exists exactly once`, renamed.totalDocs === 1, `got ${renamed.totalDocs}`)
  }

  // "N/A" is the research file's gap marker; letting it through as a value is
  // the single most likely way this import quietly lies.
  const na = sourced.docs.filter((d: any) => JSON.stringify(d).includes('"N/A"'))
  check(
    'no "N/A" gap marker survived the import as a value',
    na.length === 0,
    na.length ? `leaked: ${na.map((d: any) => d.slug).join(', ')}` : '',
  )
  const bend: any = sourced.docs.find((d: any) => d.slug === 'the-bend-liquor-lounge')
  check(
    'the disputed city label is recorded rather than asserted',
    (bend?.research?.blockingGaps ?? []).some((g: string) => /city_disputed|line/i.test(g)),
  )
  const p1910: any = sourced.docs.find((d: any) => d.slug === '1910-restaurant-bar')
  check(
    'contested hours keep their conflicts rather than resolving them',
    (p1910?.detail?.hoursConflicts?.length ?? 0) === 2,
  )
  // The filing date is a registration event; rendering it as a founding year is
  // the specific mistake the source file warns about on every record.
  const filingLeak = sourced.docs.filter((d: any) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(d.research?.established ?? '')),
  )
  check(
    'no raw filing-style date landed in `established`',
    filingLeak.length === 0,
    filingLeak.length ? `leaked: ${filingLeak.map((d: any) => d.slug).join(', ')}` : '',
  )

  /* Everything below describes `fc-data.js` fiction — el-gallo's
   * hours, the story blocks, the event venues, the synthetic weekly slugs.
   * It runs only when the mocks were actually seeded. */
  if (SEED_MOCKS) {

    /* el-gallo detail is real */
    const gallo = await payload.find({
      collection: 'listings',
      where: { slug: { equals: 'el-gallo' } },
      limit: 1,
      depth: 0,
    })
    const g: any = gallo.docs[0]
    check('el-gallo address imported', g?.detail?.address === '1412 SW 8th St, Miami, FL 33135')
    check('el-gallo has 4 hours rows', g?.detail?.hours?.length === 4)
    check('el-gallo has 3 story paragraphs', g?.detail?.story?.length === 3)

    /* every OTHER *unsourced* listing must have no fabricated detail.
     *
     * Scoped to `unsourced` rather than "not el-gallo": the researched imports
     * legitimately carry a phone and an address, because theirs came from a
     * source rather than from the array index. The thing this assertion protects
     * against is fc-data's synthesized detail leaking in, and that is exactly the
     * set `unsourced` names. */
    const others = await payload.find({
      collection: 'listings',
      where: {
        and: [{ slug: { not_equals: 'el-gallo' } }, { publicationStatus: { equals: 'unsourced' } }],
      },
      limit: 100,
      depth: 0,
    })
    const leaked = others.docs.filter((d: any) => d?.detail?.phone || d?.detail?.address)
    check(
      'the other 13 unsourced listings carry no fabricated detail',
      leaked.length === 0,
      leaked.length ? `leaked: ${leaked.map((d: any) => d.slug).join(', ')}` : '13 clean',
    )

    /* localization actually landed, and is not just the English fallback */
    const galloEs: any = (
      await payload.find({
        collection: 'listings',
        where: { slug: { equals: 'el-gallo' } },
        limit: 1,
        locale: 'es',
        depth: 0,
      })
    ).docs[0]
    check('listing tag differs in ES', galloEs.tag !== g.tag, galloEs.tag?.slice(0, 46) + '…')
    check('business name is NOT translated', galloEs.name === g.name, galloEs.name)

    /* `hours` is NOT a localized array — only the fields inside it are — so the
     * ES write has to carry the English row ids or Payload rebuilds the array
     * instead of translating it. Same mechanism as story blocks, but a different
     * code path (the esData callback), so it needs its own assertions: a rebuilt
     * array would still have the right length in the EN checks above. */
    check('ES hours is the SAME 4 rows', galloEs.detail?.hours?.length === 4)
    check(
      'ES hours row ids preserved',
      galloEs.detail?.hours?.every((h: any, i: number) => h.id === g.detail.hours[i].id),
    )
    // The point of the whole withIds detour: text inside a non-localized array
    // actually translates.
    check(
      'hours label translated inside a non-localized array',
      galloEs.detail?.hours?.[0]?.d !== g.detail.hours[0].d,
      `${g.detail.hours[0].d} -> ${galloEs.detail?.hours?.[0]?.d}`,
    )
    // `story` IS a localized array, so each locale owns its own rows.
    check('ES story still has 3 paragraphs', galloEs.detail?.story?.length === 3)
    check(
      'ES story text translated',
      galloEs.detail?.story?.[0]?.text !== g.detail.story[0].text,
    )

    /* blocks: structure shared across locales, text translated in place */
    const stEn: any = (
      await payload.find({
        collection: 'stories',
        where: { slug: { equals: 'el-gallo' } },
        limit: 1,
        locale: 'en',
        depth: 0,
      })
    ).docs[0]
    const stEs: any = (
      await payload.find({
        collection: 'stories',
        where: { slug: { equals: 'el-gallo' } },
        limit: 1,
        locale: 'es',
        depth: 0,
      })
    ).docs[0]

    check('el-gallo story has 12 blocks (EN)', stEn.blocks.length === 12, `got ${stEn.blocks.length}`)
    check(
      'ES has the SAME 12 blocks, not 24',
      stEs.blocks.length === 12,
      `got ${stEs.blocks.length}`,
    )
    check(
      'block order and types identical across locales',
      stEn.blocks.every((b: any, i: number) => b.blockType === stEs.blocks[i].blockType),
      stEn.blocks.map((b: any) => b.blockType).join(','),
    )
    check(
      'block ids preserved across locales',
      stEn.blocks.every((b: any, i: number) => b.id === stEs.blocks[i].id),
    )
    check('first block is the drop cap', stEn.blocks[0].blockType === 'dropCap')
    check(
      'drop cap text is translated',
      stEn.blocks[0].text !== stEs.blocks[0].text,
      stEs.blocks[0].text?.slice(0, 40) + '…',
    )
    const allTypes = new Set<string>()
    for (const s of (await payload.find({ collection: 'stories', limit: 10, depth: 0 })).docs) {
      for (const b of (s as any).blocks) allTypes.add(b.blockType)
    }
    check(
      'all 7 block types present across the 3 stories',
      allTypes.size === 7,
      [...allTypes].join(', '),
    )

    /* venue branch */
    const son: any = (
      await payload.find({
        collection: 'events',
        where: { slug: { equals: 'son-thursday' } },
        limit: 1,
        depth: 1,
      })
    ).docs[0]
    check('son-thursday is a listing venue', son.venueType === 'listing' && !!son.listing)
    check('son-thursday links to El Gallo', son.listing?.slug === 'el-gallo')

    const domino: any = (
      await payload.find({
        collection: 'events',
        where: { slug: { equals: 'domino-open' } },
        limit: 1,
        depth: 1,
      })
    ).docs[0]
    check('domino-open is a place venue', domino.venueType === 'place' && !domino.listing)
    check('domino-open place is Máximo Gómez Park', domino.place === 'Máximo Gómez Park', domino.place)

    const byType = await payload.find({
      collection: 'events',
      where: { venueType: { equals: 'listing' } },
      limit: 100,
      depth: 0,
    })
    check('16 listing-venue events / 4 place', byType.totalDocs === 16, `got ${byType.totalDocs}`)

    /* HTML entities decoded */
    const hialeah: any = (
      await payload.find({
        collection: 'cities',
        where: { slug: { equals: 'hialeah' } },
        limit: 1,
        depth: 0,
      })
    ).docs[0]
    check(
      'city cast name entity-decoded',
      hialeah.cast?.[0]?.name === 'RAFA & YOLI',
      hialeah.cast?.[0]?.name,
    )
    check('city photo attached', !!hialeah.photo)
    check('city solo mascot attached', !!hialeah.solo)

    /* weekly + spotlight synthetic slugs */
    const wk = await payload.find({ collection: 'weekly-events', limit: 10, depth: 0 })
    check(
      'weekly slugs are synthetic and unique',
      new Set(wk.docs.map((d: any) => d.slug)).size === 6,
      wk.docs.map((d: any) => d.slug).join(' '),
    )
    const sp = await payload.find({ collection: 'spotlights', limit: 10, depth: 0 })
    check(
      'spotlight slugs keyed by city',
      sp.docs.every((d: any) => d.slug.startsWith('spotlight-')),
      sp.docs.map((d: any) => d.slug).join(' '),
    )
  }

  /* globals */
  const settings: any = await payload.findGlobal({ slug: 'site-settings' })
  const about: any = await payload.findGlobal({ slug: 'about-page', locale: 'es' })
  check('about page ES copy present', about.h1a === 'HECHO POR UNO', about.h1a)
  check('about page has 3 steps', about.steps?.length === 3)
  const lys: any = await payload.findGlobal({ slug: 'list-your-spot-page', locale: 'es' })
  check('6 perks with named icons', lys.perks?.length === 6 && lys.perks[0].icon === 'map-pin')
  check('perks translated', lys.perks?.[0]?.t !== 'Listed in your own city', lys.perks?.[0]?.t)

  if (SEED_MOCKS) {
    /* the known gap, asserted rather than forgotten */
    const outroEn: any = (
      await payload.find({
        collection: 'stories',
        where: { slug: { equals: 'el-gallo' } },
        limit: 1,
        locale: 'en',
        depth: 0,
      })
    ).docs[0]
    const outroEs: any = (
      await payload.find({
        collection: 'stories',
        where: { slug: { equals: 'el-gallo' } },
        limit: 1,
        locale: 'es',
        depth: 0,
      })
    ).docs[0]
    const same = outroEn.outro === outroEs.outro
    console.log(
      `${same ? '  note' : '  ok  '} story outro ES ${same ? 'still English — known dictionary gap, 3 records to write' : 'translated'}`,
    )
  }

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
