import fs from 'fs'
import path from 'path'

/**
 * The sourced business dossiers from the sibling `flamingo-city` repo.
 *
 * These are a different kind of record from everything in `fc-data.js`. The 14
 * listings there are design content whose phone, hours and story were
 * synthesized from the array index; these 11 were researched, and every field
 * that carries risk arrives with a source URL and, where sources disagreed, the
 * disagreement itself. The whole point is that a reader can audit them, so the
 * import's job is to preserve provenance, not to flatten it into strings.
 *
 * Three rules the source file states explicitly, and this importer obeys:
 *
 * 1. `corporate_record.filing_date` is a Florida registration event and is
 *    NEVER an opening date. Only `established` / `opened` reach the record.
 * 2. `hours.conflicts` is not resolved by picking one. It is carried across
 *    alongside a confidence level, and the frontend gates on that.
 * 3. `"N/A"` is a known gap, not a value. It never becomes a string.
 */

/**
 * Where the research repo sits.
 *
 * Found by walking up from the cwd looking for a sibling `flamingo-city`, not
 * by a fixed `../../..` — this repo is checked out both directly and as a git
 * worktree under `.claude/worktrees/<name>/`, and those sit at different depths.
 * `RESEARCH_JSON` overrides it outright for CI.
 */
function findResearchJson(): string {
  if (process.env.RESEARCH_JSON) return process.env.RESEARCH_JSON
  // In-repo copy FIRST. The sibling `flamingo-city` checkout is a different git
  // repo and will not exist on a deploy target, so relying on it would mean the
  // seed quietly produced 14 listings instead of 25 in production. The tracked
  // copy is what ships; the sibling is a convenience for local work.
  const candidates = [
    path.join('data-import', 'listings.json'),
    path.join('flamingo-city', 'data', 'listings.json'),
  ]
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    for (const rel of candidates) {
      const candidate = path.join(dir, rel)
      if (fs.existsSync(candidate)) return candidate
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return path.resolve(process.cwd(), '..', candidates[0])
}

export const RESEARCH_JSON = findResearchJson()

/** `"N/A"` is the file's explicit gap marker — never let it become a value. */
export function val<T>(v: T | null | undefined): T | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' || t === 'N/A' ? undefined : (t as unknown as T)
  }
  return v
}

export function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x !== 'N/A') : []
}

/** research city slug → the site's city slug. */
const CITY: Record<string, string> = { 'miami-lakes': 'lakes', hialeah: 'hialeah' }
/**
 * research category → the site's taxonomy.
 *
 * A key missing here is not an error — `seed` logs `skip <slug>: no mapping`
 * and carries on with an exit code of 0. So a new research category has to be
 * added in three places at once or it silently imports nothing: here, in
 * `CAT_KEEP`, and in `CAT_RELABEL` (both in `seed/index.ts`).
 */
const CATEGORY: Record<string, string> = {
  restaurant: 'food',
  bar: 'night',
  nonprofit: 'nonprofit',
}

/**
 * Listings written by hand in `data-import/listings.json` with no dossier
 * behind them.
 *
 * `research.sourceFile` is provenance: it names the file a record was generated
 * from. These two were not generated from anything — they were authored from
 * press and the organisations' own sites, which are in `references` — so
 * pointing the field at `research/hialeah/casa-marin.md` would invent a source
 * document. Empty is the honest value, and `_meta.local_edits` in the JSON
 * carries the same warning for whoever regenerates that file.
 */
const HAND_AUTHORED = new Set(['casa-marin', 'el-club-de-la-amistad'])

/**
 * Listings whose slug changed after they were already seeded. old → new.
 *
 * `upsert` keys on slug, so a slug edited in `listings.json` alone does not
 * rename anything — it creates a second row and orphans the first. `seed`
 * applies this map before the research loop so the rename happens in place and
 * the row keeps its id, and with it the story, hours and source rows that hang
 * off it.
 *
 * Lives here rather than in `listings.json` for the same reason `CAT_KEEP`
 * does: that file is a generated copy and a key added to it is lost on the next
 * regeneration from the sibling research repo.
 */
export const SLUG_RENAMES: Record<string, string> = {
  'el-mejor-batido-de-hialeah': 's-and-n-vegetables',
}

/**
 * new slug → the slug the upstream dossier is still filed under.
 *
 * `research.sourceFile` is provenance — it tells a reader which dossier a
 * record came from. A rename here does not rename the file in the other repo,
 * so without this the field would point at a path that has never existed.
 */
const DOSSIER_SLUG: Record<string, string> = {
  's-and-n-vegetables': 'el-mejor-batido-de-hialeah',
}

/**
 * The storefront photography, keyed by listing slug.
 *
 * Keyed on the SLUG, never on the filename — seven of these eleven source files
 * arrived named differently from the listing they belong to
 * (`trigo-cafe-tapas-wine.jpg` → `trigo-cafe`, `the-bend-lounge.jpg` →
 * `the-bend-liquor-lounge`), and `upsertMedia` warn-skips a path it cannot find
 * and returns `undefined`. A map built from basenames would therefore produce a
 * green seed with blank slots, which is why the files are renamed to their slug
 * on the way in and why `verify` asserts every entry in this map.
 *
 * All eleven researched listings have a storefront photo now.
 *
 * `alt` is required and localized on the media collection, so both languages
 * are written here. They describe the frame, not the business: the name is
 * already in the heading next to the image.
 */
export const LISTING_PHOTO: Record<
  string,
  { file: string; altEn: string; altEs: string; credit?: string }
> = {
  '1910-restaurant-bar': {
    file: 'assets/businesses/1910-restaurant-bar.jpg',
    altEn: 'A sidewalk patio at night, lit umbrellas over brick pavers and a bar visible through the arched windows behind.',
    altEs: 'Una terraza de noche, sombrillas iluminadas sobre adoquines y una barra visible tras los ventanales en arco.',
  },
  'dr-limon-ceviche-bar': {
    file: 'assets/businesses/dr-limon-ceviche-bar.jpg',
    altEn: 'A tile-roofed storefront in low evening sun, ceiling fans turning over a covered walkway.',
    altEs: 'Una fachada de tejas bajo el sol del atardecer, con ventiladores de techo sobre un pasillo cubierto.',
  },
  'cancun-grill': {
    file: 'assets/businesses/cancun-grill.jpg',
    altEn: 'A sage-green facade at sunset, the sign spelled out in neon letters with a sombrero tipped over the A.',
    altEs: 'Una fachada verde salvia al atardecer, con el letrero en letras de neón y un sombrero ladeado sobre la A.',
  },
  'trigo-cafe': {
    file: 'assets/businesses/trigo-cafe.jpg',
    altEn: 'A white brick storefront under a banner sign with a wheat-stalk mark, four folding cafe tables on the tiled sidewalk.',
    altEs: 'Una fachada de ladrillo blanco bajo un letrero de lona con una espiga de trigo y cuatro mesas plegables en la acera.',
  },
  'morro-castle': {
    file: 'assets/businesses/morro-castle.jpg',
    altEn: 'A low strip-mall storefront under a wide sky, its red and blue roadside sign standing at the edge of the parking lot.',
    altEs: 'Un local bajo en una plaza comercial bajo un cielo amplio, con su letrero rojo y azul al borde del estacionamiento.',
  },
  'polo-norte': {
    file: 'assets/businesses/polo-norte.jpg',
    altEn: 'A stone-columned storefront at golden hour, an OPEN sign in the window and diners at tables inside.',
    altEs: 'Una fachada de columnas de piedra a la hora dorada, con un letrero de OPEN en la ventana y clientes en las mesas.',
  },
  'molinas-ranch': {
    file: 'assets/businesses/molinas-ranch.jpg',
    altEn: 'A tile-roofed restaurant seen from across the street, its covered walkway behind a clipped hedge and palm trees.',
    altEs: 'Un restaurante de tejas visto desde la acera de enfrente, con su pasillo cubierto tras un seto recortado y palmeras.',
    // Burned-in "© 2026 Google" watermark. Recorded so it is obvious in the
    // admin that this is a stand-in until the storefront is actually shot.
    credit: 'Google Street View',
  },
  's-and-n-vegetables': {
    file: 'assets/businesses/s-and-n-vegetables.jpg',
    altEn: 'A blue awning over a walk-up window, lettered PAN CON TODO above a list of sandwiches, with a CASH ONLY sign on the door.',
    altEs: 'Un toldo azul sobre una ventanita, rotulado PAN CON TODO encima de una lista de bocaditos, con un cartel de CASH ONLY en la puerta.',
  },
  'the-bend-liquor-lounge': {
    file: 'assets/businesses/the-bend-liquor-lounge.jpg',
    altEn: 'A long cream storefront in late afternoon light, LOUNGE in orange block letters on the parapet and a slatted wood screen over the entry.',
    altEs: 'Una fachada larga color crema con la luz de la tarde, LOUNGE en letras naranjas sobre el pretil y una celosía de madera en la entrada.',
  },
  'the-garrison-taproom-billiards': {
    file: 'assets/businesses/the-garrison-taproom-billiards.jpg',
    altEn: 'A columned entry under a script sign reading TAPROOM & BILLIARDS, glass doors set back beneath a second-floor balcony.',
    altEs: 'Una entrada con columnas bajo un letrero en cursiva que dice TAPROOM & BILLIARDS, con puertas de cristal retranqueadas bajo un balcón.',
    // Burned-in "© 2026 Google" watermark, same as molinas-ranch. Recorded so
    // it is obvious in the admin that this is a stand-in until it is shot.
    credit: 'Google Street View',
  },
  'trattoria-pampered-chef': {
    file: 'assets/businesses/trattoria-pampered-chef.jpg',
    altEn: 'A tile-roofed storefront at blue hour, the name in lit script above a covered walkway of ceiling fans and warm-lit windows.',
    altEs: 'Una fachada de tejas a la hora azul, con el nombre en cursiva iluminada sobre un pasillo cubierto de ventiladores y ventanales cálidos.',
  },
  // Not a photograph of the building, and the credit says so. The restaurant
  // has never been shot for us: the only picture that exists is a third-party
  // Google Maps contribution with a passer-by and the Maps chrome in frame,
  // which is somebody else's copyright and unusable as it stands. So this is a
  // render built from that picture as reference — the massing, the stepped
  // parapet, the sign and the two unit numbers are the real building's, the
  // light and the empty lot are not. It replaces the logo holding card that
  // stood here, which is still on disk at `casa-marin.jpg` and unreferenced.
  //
  // The filename had to change rather than the file: `upsertMedia` keys on
  // basename and returns the existing document on a match, so overwriting
  // `casa-marin.jpg` in place would have re-seeded green and gone on serving
  // the holding card. Same trap `real-events.ts` documents.
  //
  // Swap this for a real photograph the moment anyone shoots one, and drop the
  // credit then — the slug and alt text are what the seed keys on.
  'casa-marin': {
    file: 'assets/businesses/casa-marin-storefront.jpg',
    altEn: 'A long pink stucco storefront in late afternoon sun, CASA MARIN in red script across the stepped parapet above a colonnaded walkway.',
    altEs: 'Una fachada larga de estuco rosado con el sol de la tarde, CASA MARIN en cursiva roja sobre el pretil escalonado, encima de un pasillo con columnas.',
    credit: 'Rendering from a Google Maps contributor photo — stand-in until the storefront is shot',
  },
  'el-club-de-la-amistad': {
    file: 'assets/businesses/el-club-de-la-amistad.jpg',
    altEn: 'Seven volunteers in pink club shirts standing shoulder to shoulder against a slatted wood wall, the club seal in the corner.',
    altEs: 'Siete voluntarias con camisas rosadas del club, hombro con hombro ante una pared de listones de madera, con el sello del club en la esquina.',
    credit: 'Club de la Amistad por un Hialeah Mejor',
  },
}

/**
 * A venue's own mark, background removed, for drawing over a photograph.
 *
 * Separate from `LISTING_PHOTO` because it is a different kind of image and
 * has a different job: the photo answers "what does this place look like",
 * the logo answers "whose place is this" when the photograph on screen is of
 * somebody else — an event hero, for instance, which shows the people at the
 * event and nothing that names the room they are in.
 *
 * `casa-marin-logo.png` is the same artwork as `casa-marin.jpg`, with the
 * flyer's paper colour flood-filled away from the outside only. Filling from
 * the border rather than by colour keeps the cream *inside* the roundel, which
 * is the logo's own disc — knocking that out too would drop the white "el chef
 * marin" script onto whatever photograph happens to be behind it.
 *
 * Optional, and expected to stay mostly empty: most listings will have a
 * storefront photograph and no need of this.
 */
export const LISTING_LOGO: Record<
  string,
  { file: string; altEn: string; altEs: string; credit?: string }
> = {
  'casa-marin': {
    file: 'assets/businesses/casa-marin-logo.png',
    altEn: "The Casa Marín logo: a chef's hat between a fork and a knife inside a red roundel, on a banner reading CASA MARIN.",
    altEs: 'El logotipo de Casa Marín: un gorro de chef entre un tenedor y un cuchillo dentro de un círculo rojo, sobre una cinta que dice CASA MARIN.',
    credit: 'Casa Marín',
  },
}

const DAY_SHORT: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
}

/** "13:00" → "1pm", "11:30" → "11:30am" — the display shape the detail page uses. */
function clock(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`
}

/** [Mon..Sun] → "Mon – Sun"; non-contiguous sets stay comma separated. */
function dayLabel(days: string[]): string {
  const short = days.map((d) => DAY_SHORT[d] ?? d)
  if (short.length <= 2) return short.join(' & ')
  const order = Object.values(DAY_SHORT)
  const idx = short.map((d) => order.indexOf(d)).sort((a, b) => a - b)
  const contiguous = idx.every((n, i) => i === 0 || n === idx[i - 1] + 1)
  return contiguous ? `${order[idx[0]]} – ${order[idx[idx.length - 1]]}` : short.join(', ')
}

export type ResearchListing = Record<string, any>

export function loadResearch(): ResearchListing[] {
  if (!fs.existsSync(RESEARCH_JSON)) {
    throw new Error(
      `Research file not found at ${RESEARCH_JSON}. Set RESEARCH_JSON to the path of flamingo-city/data/listings.json.`,
    )
  }
  const doc = JSON.parse(fs.readFileSync(RESEARCH_JSON, 'utf8'))
  return doc.listings ?? []
}

/**
 * One research record → the English half of a Payload listing.
 *
 * `tag` is the only localized field written here, and it is written in English
 * ONLY. The research has no Spanish, and copying English into the `es` locale
 * would make the admin look translated when it is not.
 */
export function toListing(r: ResearchListing, ids: Record<string, any>) {
  const loc = r.location ?? {}
  const con = r.contact ?? {}
  const soc = r.social ?? {}
  const hrs = r.hours ?? {}

  const addressParts = [val(loc.street), val(loc.locality), val(loc.region), val(loc.postal_code)]
  const address = addressParts.filter(Boolean).join(', ')

  // The city relationship is required, so a disputed municipality still has to
  // resolve to something. It resolves to the research's own `city` key and the
  // dispute is recorded as a blocking gap rather than silently asserted away.
  const cityKey = CITY[r.city]
  const catKey = CATEGORY[r.category]

  const blockingGaps = [...list(r.blocking_gaps)]
  if (val(loc.verification) && loc.verification !== 'confirmed') {
    blockingGaps.push(
      `Address ${loc.verification}: ${val(loc.verification_note) ?? 'see research dossier'}`,
    )
  }
  for (const key of ['phone_note', 'website_status', 'email_note'] as const) {
    const note = val(con[key])
    if (note) blockingGaps.push(`${key.replace(/_/g, ' ')}: ${note}`)
  }

  const schedule = Array.isArray(hrs.schedule) ? hrs.schedule : []
  const quote = (r.notable_quotes ?? [])[0]

  return {
    name: r.name,
    city: ids.cities[cityKey],
    category: ids.categories[catKey],
    hood: val(loc.district) ?? val(loc.cross_street),
    tag: val(r.short_description),
    member: false,
    publicationStatus: r.publication_status === 'ready' ? 'ready' : 'needs_owner_confirmation',
    detail: {
      story: val(r.long_description) ? [{ text: r.long_description }] : [],
      quote: quote ? val(quote.quote) : undefined,
      quoteBy: quote ? val(quote.attributed_to) : undefined,
      address: address || undefined,
      phone: val(con.phone_display) ?? val(con.phone),
      // The field wants a bare host — the research stores a full URL.
      site: val(con.website)?.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      email: val(con.email),
      instagram: val(soc.instagram),
      hours: schedule.map((s: any) => ({
        d: dayLabel(s.days ?? []),
        t: `${clock(s.opens)} – ${clock(s.closes)}`,
      })),
      hoursConfidence: val(hrs.confidence),
      hoursConflicts: (hrs.conflicts ?? []).map((c: any) => ({
        source: c.source,
        detail: c.detail,
      })),
    },
    research: {
      established: val(r.established) ?? val((r.opened ?? {}).label),
      establishedNote:
        val((r.opened ?? {}).note) ?? val(r.established_note) ?? undefined,
      cuisine: list(r.cuisine),
      signatureItems: list(r.signature_items),
      blockingGaps,
      sources: (r.references ?? []).map((ref: any) => ({
        url: ref.url,
        title: val(ref.title),
        publisher: val(ref.publisher),
        type: val(ref.type),
      })),
      legalEntity: val(r.legal_entity),
      sourceFile: HAND_AUTHORED.has(r.slug)
        ? undefined
        : `flamingo-city/research/${r.city}/${DOSSIER_SLUG[r.slug] ?? r.slug}.md`,
    },
  }
}

export { CITY, CATEGORY }
