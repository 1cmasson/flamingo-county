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

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const payload = await getPayload({ config })

  /* counts */
  const want: Record<string, number> = {
    cities: 3,
    categories: 5,
    'event-kinds': 7,
    listings: 14,
    stories: 3,
    events: 20,
    'weekly-events': 6,
    spotlights: 3,
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

  /* el-gallo detail is real */
  const gallo = await payload.find({
    collection: 'listings',
    where: { slug: { equals: 'el-gallo' } },
    limit: 1,
    depth: 0,
  })
  const g: any = gallo.docs[0]
  check('el-gallo address imported', g?.detail?.address === '1412 SW 8th St, Miami, FL 33135')
  check('el-gallo has 6 menu items', g?.detail?.menu?.length === 6, `got ${g?.detail?.menu?.length}`)
  check('el-gallo has 4 hours rows', g?.detail?.hours?.length === 4)
  check('el-gallo has 3 story paragraphs', g?.detail?.story?.length === 3)

  /* every OTHER listing must have no fabricated detail */
  const others = await payload.find({
    collection: 'listings',
    where: { slug: { not_equals: 'el-gallo' } },
    limit: 100,
    depth: 0,
  })
  const leaked = others.docs.filter((d: any) => d?.detail?.phone || d?.detail?.address)
  check(
    'the other 13 listings carry no fabricated detail',
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

  /* `menu` and `hours` are NOT localized arrays — only the fields inside them
   * are — so the ES write has to carry the English row ids or Payload rebuilds
   * the array instead of translating it. Same mechanism as story blocks, but a
   * different code path (the esData callback), so it needs its own assertions:
   * a rebuilt array would still have the right length in the EN checks above. */
  check(
    'ES menu is the SAME 6 rows, not rebuilt',
    galloEs.detail?.menu?.length === 6,
    `got ${galloEs.detail?.menu?.length}`,
  )
  check(
    'ES menu row ids preserved',
    galloEs.detail?.menu?.every((m: any, i: number) => m.id === g.detail.menu[i].id),
  )
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
  check(
    'menu description translated',
    galloEs.detail?.menu?.[0]?.desc !== g.detail.menu[0].desc,
    galloEs.detail?.menu?.[0]?.desc,
  )
  check('non-localized price is shared', galloEs.detail?.menu?.[0]?.price === '$21')
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

  /* globals */
  const settings: any = await payload.findGlobal({ slug: 'site-settings' })
  check('site settings price = 20', settings.price === 20)
  const about: any = await payload.findGlobal({ slug: 'about-page', locale: 'es' })
  check('about page ES copy present', about.h1a === 'HECHO POR UNO', about.h1a)
  check('about page has 3 steps', about.steps?.length === 3)
  const lys: any = await payload.findGlobal({ slug: 'list-your-spot-page', locale: 'es' })
  check('6 perks with named icons', lys.perks?.length === 6 && lys.perks[0].icon === 'map-pin')
  check('perks translated', lys.perks?.[0]?.t !== 'Listed in your own city', lys.perks?.[0]?.t)

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
  const same = outroEn.outro === stEs.outro
  console.log(
    `${same ? '  note' : '  ok  '} story outro ES ${same ? 'still English — known dictionary gap, 3 records to write' : 'translated'}`,
  )

  console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
