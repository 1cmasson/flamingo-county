import type { Lang } from '../i18n'
import {
  addressReport,
  CITY_GOVERNMENT,
  electionState,
  LINKS,
  normalizeAddress,
  placesData,
  prettyAddress,
  suggest,
  surgeData,
  voteData,
  type AddressReport,
  type Pickup,
  type PollingSource,
} from './civic'
import { municSlug, UNINCORPORATED } from './civicSync'
import { ruleText, dayName } from './addressCopy'
import { areaRows, sitesOf } from './vote'
import { areaName, electionName } from './voteCopy'
import { placesCopy } from './placesCopy'
import { fmt, SURGE_PAGES } from './surgeCopy'
import { titleCase } from './civicGeo'
import { trashMode, trashProviders } from './places'
import { routes } from './routes'
import { absUrl } from './site'
import { todayISO } from './dates'
import { ballotNote, cityMayor, COUNTY_MAYOR, selectionText, type Mayor } from './mayors'

/**
 * The public civic tools for AI agents: one implementation behind the MCP
 * server (/mcp) and the JSON API (/api/civic/v1/…).
 *
 * The rule is the address page's: an answer holds only what /address already
 * shows a person, with its sources and the day the records were read.
 *
 * - **Nothing about the asker.** These functions never log, store or echo
 *   anything beyond the answer; the routes keep no request log of their own.
 * - **No coordinates.** Nothing takes a location in, and nothing gives one
 *   out: an assistant can't use this to locate a person.
 * - **No state legislators' names.** The county's House and Senate layers
 *   date from 2022; districts only, with the Legislature's lookup.
 * - **No invented schedules.** Where the records hold no trash routes, the
 *   answer says who handles pickup and stops.
 */

export const TOOL_NAMES = ['find_address', 'address_report', 'polling_places', 'evacuation_zone_summary', 'trash_schedule', 'local_officials'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

export type Source = { agency: string; url: string }
export type ToolOk<T> = {
  ok: true
  tool: ToolName
  lang: Lang
  /** A short answer in `lang`, quotable as is. */
  text: string
  data: T
  sources: Source[]
  /** The day the records were read from the agencies. */
  fetchedAt: string
  /** The page a person can open for the same answer. */
  page?: string
}
export type ToolError = {
  ok: false
  tool: ToolName
  lang: Lang
  error: 'not_ready' | 'not_found' | 'ambiguous' | 'bad_request'
  text: string
  candidates?: { slug: string; label: string; zip: string; city: string }[]
}
export type ToolResult<T = unknown> = ToolOk<T> | ToolError

const SRC = {
  openData: { agency: 'Miami-Dade County · Open Data', url: LINKS.openData },
  countyWaste: { agency: 'Miami-Dade County · Solid Waste', url: LINKS.countySolidWaste },
  hialeahWaste: { agency: 'City of Hialeah · Solid Waste', url: LINKS.hialeahSolidWaste },
  miamiWaste: { agency: 'City of Miami · Solid Waste', url: LINKS.miamiSolidWaste },
  fema: { agency: 'FEMA · Flood Map Service Center', url: LINKS.femaFlood },
  surge: { agency: 'Miami-Dade County · Storm surge planning zones', url: LINKS.knowYourZone },
  elections: { agency: 'Miami-Dade County · Elections Department', url: LINKS.elections },
} satisfies Record<string, Source>

const pollingSourceRef = (p: PollingSource | null): Source[] =>
  p ? [{ agency: p.by + (p.published ? ` · polling place list of ${p.published}` : ''), url: p.url }] : []

export const toLang = (v: unknown): Lang => (v === 'en' ? 'en' : 'es')

const notReady = (tool: ToolName, lang: Lang): ToolError => ({
  ok: false,
  tool,
  lang,
  error: 'not_ready',
  text:
    lang === 'es'
      ? 'Estamos actualizando los datos del condado. Vuelve a intentarlo en unos minutos.'
      : 'The county data is being updated. Try again in a few minutes.',
})

const notFound = (tool: ToolName, lang: Lang, what: string): ToolError => ({
  ok: false,
  tool,
  lang,
  error: 'not_found',
  text: lang === 'es' ? `No encontramos «${what}» en los registros de Miami-Dade.` : `No match for "${what}" in Miami-Dade's records.`,
})

const badRequest = (tool: ToolName, lang: Lang, text: { es: string; en: string }): ToolError => ({
  ok: false,
  tool,
  lang,
  error: 'bad_request',
  text: text[lang],
})

/** "Hialeah", "hialeah", "Opa-locka", "Unincorporated Miami-Dade" → the slug the pages use. */
export function citySlug(input: string): string {
  const t = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim()
  if (/^(UNINCORPORATED|NO INCORPORADO|MIAMI-DADE NO INCORPORADO)/.test(t) || t === 'UNINCORPORATED MIAMI-DADE') return 'unincorporated'
  return municSlug(t.replace(/^(CITY OF|CIUDAD DE)\s+/, ''))
}

/* ----------------------------------------------------------- find_address */

export async function findAddress(query: string, lang: Lang): Promise<ToolResult<{ results: { slug: string; label: string; zip: string; city: string; page: string }[] }>> {
  const tool = 'find_address'
  const q = String(query ?? '').slice(0, 140)
  if (normalizeAddress(q).text.length < 2) return badRequest(tool, lang, { es: 'Escribe al menos parte de una dirección.', en: 'Type at least part of an address.' })
  const fetchedAt = (await placesData())?.fetchedAt
  if (!fetchedAt) return notReady(tool, lang)
  const results = (await suggest(q, 8)).map((r) => ({ ...r, page: absUrl(`${routes.address(lang)}?a=${r.slug}`) }))
  return {
    ok: true,
    tool,
    lang,
    text: results.length
      ? lang === 'es'
        ? `${results.length} ${results.length === 1 ? 'dirección coincide' : 'direcciones coinciden'}. Usa el «slug» con address_report.`
        : `${results.length} matching ${results.length === 1 ? 'address' : 'addresses'}. Pass a slug to address_report.`
      : lang === 'es'
        ? 'Ninguna dirección de Miami-Dade coincide.'
        : 'No Miami-Dade address matches.',
    data: { results },
    sources: [SRC.openData],
    fetchedAt,
  }
}

/* ---------------------------------------------------------------- mayors */

/** A mayor as an agent gets it: the public fields, how they're chosen, and any ballot note. */
function mayorOut(m: Mayor & { munic?: string }, lang: Lang, today: string = todayISO()) {
  return {
    name: m.name,
    title: m.title,
    selection: m.selection,
    selectionText: selectionText(m.selection, lang),
    source: m.sourceUrl,
    checked: m.checked,
    ballotNote: m.munic ? ballotNote({ ...m, munic: m.munic }, lang, today) : null,
  }
}

/* --------------------------------------------------------- address_report */

function pickup(p: Pickup | null, lang: Lang) {
  if (!p) return null
  return {
    by: p.by,
    zone: p.zone || null,
    days: p.appointment
      ? lang === 'es'
        ? 'Con cita'
        : 'By appointment'
      : p.rule?.biweekly
        ? lang === 'es'
          ? `Cada dos semanas, el ${p.rule.days.map((d) => dayName(d, lang)).join(' / ')}`
          : `Every other ${p.rule.days.map((d) => dayName(d, lang)).join(' / ')}`
        : p.rule
          ? ruleText(p.rule, lang)
          : null,
    /** The next dates on Miami's calendar; empty where the provider publishes no anchor (county recycling) or none applies. */
    nextDates: p.next,
    byAppointment: !!p.appointment,
    lookup: p.appointment ? LINKS.countyBulky : p.rule?.biweekly ? LINKS.countyRecycling : null,
  }
}

export async function addressReportTool(
  input: { slug?: string; address?: string },
  lang: Lang,
  today: string = todayISO(),
): Promise<ToolResult> {
  const tool = 'address_report'
  const places = await placesData()
  if (!places) return notReady(tool, lang)
  let slug = String(input.slug ?? '').trim().toLowerCase()
  if (!slug) {
    const q = String(input.address ?? '').slice(0, 140)
    if (normalizeAddress(q).text.length < 2)
      return badRequest(tool, lang, { es: 'Pasa una dirección («address») o un «slug» de find_address.', en: 'Pass an address or a slug from find_address.' })
    const hits = await suggest(q, 5)
    const wanted = normalizeAddress(q)
    const exact = hits.filter((h) => normalizeAddress(h.label).text === wanted.text && (!wanted.zip || h.zip === wanted.zip))
    const pick = exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null
    if (!pick) {
      if (!hits.length) return notFound(tool, lang, q)
      return {
        ok: false,
        tool,
        lang,
        error: 'ambiguous',
        text: lang === 'es' ? 'Varias direcciones coinciden: escoge una y pasa su «slug».' : 'Several addresses match: pick one and pass its slug.',
        candidates: hits,
      }
    }
    slug = pick.slug
  }
  const r = await addressReport(slug, today)
  if (!r) return notFound(tool, lang, slug)
  const data = reportData(r, lang, today)
  const t = (es: string, en: string) => (lang === 'es' ? es : en)
  const g = data.trash.garbage
  const lines = [
    `${data.address}, ${data.city}, FL ${r.zip}.`,
    g?.days ? t(`Basura: ${g.days}${g.nextDates[0] ? ` (próxima: ${g.nextDates[0]})` : ''}.`, `Garbage: ${g.days}${g.nextDates[0] ? ` (next: ${g.nextDates[0]})` : ''}.`) : null,
    data.trash.cityHandles ? t(`La recogida de basura la maneja la ciudad de ${data.municipality}.`, `Trash pickup is handled by the City of ${data.municipality}.`) : null,
    data.floodZone ? t(`Zona de inundación de FEMA: ${data.floodZone}.`, `FEMA flood zone: ${data.floodZone}.`) : null,
    data.surgeZone ? t(`Zona de evacuación por marejada: ${data.surgeZone}.`, `Storm-surge zone: ${data.surgeZone}.`) : t('No está en zona de evacuación por marejada.', 'Not in a storm-surge zone.'),
    data.commissioner ? t(`Comisión del condado: distrito ${data.commissioner.district}, ${data.commissioner.name}.`, `County commission: District ${data.commissioner.district}, ${data.commissioner.name}.`) : null,
    data.electionDay.place && data.electionDay.current
      ? t(
          `Día de las elecciones (${data.electionDay.election}): precinto ${data.electionDay.precinct}, ${data.electionDay.place.name}, ${data.electionDay.place.address}. La votación temprana es en otros lugares.`,
          `Election Day (${data.electionDay.election}): precinct ${data.electionDay.precinct}, ${data.electionDay.place.name}, ${data.electionDay.place.address}. Early voting uses other sites.`,
        )
      : null,
  ].filter(Boolean)
  return {
    ok: true,
    tool,
    lang,
    text: lines.join(' '),
    data,
    sources: [
      SRC.openData,
      g?.by === 'hialeah' ? SRC.hialeahWaste : g?.by === 'miami' ? SRC.miamiWaste : SRC.countyWaste,
      SRC.fema,
      SRC.surge,
      ...pollingSourceRef(r.pollingSource),
      SRC.elections,
    ],
    fetchedAt: r.fetchedAt,
    page: data.page,
  }
}

/** The report as an agent gets it: what the page shows, without coordinates or legislators' names. */
export function reportData(r: AddressReport, lang: Lang, today: string = todayISO()) {
  const state = electionState(r.pollingSource, null, today)
  const g = r.trash.garbage
  const isHialeah = r.munic === 'HIALEAH'
  const near = (p: AddressReport['nearby']['fire']) => (p ? { name: p.name, address: p.address, phone: p.phone || null, walkMinutes: p.walk, meters: Math.round(p.meters) } : null)
  return {
    slug: r.slug,
    address: prettyAddress(r.label),
    zip: r.zip,
    city: titleCase(r.city),
    municipality: areaName({ munic: r.munic, district: null }, lang),
    trash: {
      garbage: pickup(g, lang),
      recycling: pickup(r.trash.recycling, lang),
      bulk: pickup(r.trash.bulk, lang),
      /** True where no route covers the address and the city handles pickup (itself or through a hauler): no schedule is given. */
      cityHandles: !g && !r.trash.recycling && !r.trash.bulk && r.munic !== UNINCORPORATED,
      timeZone: 'America/New_York',
    },
    floodZone: r.flood,
    surgeZone: r.surge,
    commissioner: r.commission,
    /** District numbers only: the county's layers of state legislators date from 2022, so look the person up at the source. */
    stateHouseDistrict: r.house?.district ?? null,
    stateSenateDistrict: r.senate?.district ?? null,
    stateLookups: { house: LINKS.findHouse, senate: LINKS.findSenate },
    /** The county mayor governs every address; a city mayor only inside a city (src/data/civic/mayors.json, with source and date). */
    mayor: { county: mayorOut(COUNTY_MAYOR, lang), city: cityMayor(r.munic) ? mayorOut(cityMayor(r.munic)!, lang, today) : null },
    cityCouncil: isHialeah ? { url: CITY_GOVERNMENT.councilUrl, checked: CITY_GOVERNMENT.checked } : null,
    electionDay: {
      precinct: r.precinct,
      place: r.polling ? { name: r.polling.name, address: r.polling.address } : null,
      election: r.pollingSource?.election ?? null,
      /** False once the list's election date has passed: the site is then not presented as current. */
      current: state.upcoming,
      earlyVoting: lang === 'es' ? 'La votación temprana es en otros lugares.' : 'Early voting uses other sites.',
      pollingSource: r.pollingSource,
    },
    schools: [r.schools.elementary, r.schools.middle, r.schools.high]
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ name: s.name, grades: s.grades, address: s.address, phone: s.phone || null })),
    nearby: { fire: near(r.nearby.fire), police: near(r.nearby.police), hospital: near(r.nearby.hospital), library: near(r.nearby.library), park: near(r.nearby.park) },
    freeBus: r.bus.map((b) => ({ line: b.route.name, stop: b.stopName, walkMinutes: b.walk, page: absUrl(routes.freeRoute(lang, b.route.slug)) })),
    page: absUrl(`${routes.address(lang)}?a=${r.slug}`),
  }
}

/* --------------------------------------------------------- polling_places */

export async function pollingPlaces(input: { city?: string; precinct?: number | string }, lang: Lang, today: string = todayISO()): Promise<ToolResult> {
  const tool = 'polling_places'
  const data = await voteData()
  if (!data) return notReady(tool, lang)
  const state = electionState(data.pollingSource, data.lastElection, today)
  const sites = sitesOf(data)
  const t = (es: string, en: string) => (lang === 'es' ? es : en)
  const election = {
    date: state.election ?? state.over ?? data.pollingSource?.election ?? null,
    name: electionName(data.pollingSource?.electionName, lang),
    current: state.upcoming,
    over: state.over,
  }
  const status = state.upcoming
    ? t(
        `Para el día de las elecciones, ${election.date}. La votación temprana es en otros lugares.`,
        `For Election Day, ${election.date}. Early voting uses other sites.`,
      )
    : state.over
      ? t(
          `La elección del ${state.over} ya pasó; confirma tu lugar con el Departamento de Elecciones antes de la próxima.`,
          `The ${state.over} election is over; confirm your site with the Elections Department before the next one.`,
        )
      : t('Confirma tu lugar con el Departamento de Elecciones antes de votar.', 'Confirm your site with the Elections Department before voting.')
  const sources = [...pollingSourceRef(data.pollingSource), SRC.openData, SRC.elections]

  if (input.precinct != null && String(input.precinct).trim() !== '') {
    const n = Number(String(input.precinct).replace(/\.\d+$/, ''))
    const p = data.precincts.get(n)
    if (!Number.isInteger(n) || !p) return notFound(tool, lang, String(input.precinct))
    const areas = data.areas.filter((a) => a.precincts.includes(n))
    const row = areaRows({ slug: '', munic: '', district: null, precincts: [n] }, data, sites)[0]
    return {
      ok: true,
      tool,
      lang,
      text: p.polling
        ? `${t('Precinto', 'Precinct')} ${n}: ${p.polling.name}, ${p.polling.address}. ${status}`
        : `${t('Precinto', 'Precinct')} ${n}: ${t('sin lugar en la lista.', 'no site on the list.')} ${status}`,
      data: {
        election,
        precinct: n,
        place: p.polling ? { name: p.polling.name, address: p.polling.address } : null,
        alsoVotesHere: row?.alsoHere ?? [],
        pages: areas.map((a) => absUrl(routes.voteArea(lang, a.slug))),
      },
      sources,
      fetchedAt: data.fetchedAt,
      page: areas[0] ? absUrl(routes.voteArea(lang, areas[0].slug)) : absUrl(routes.vote(lang)),
    }
  }

  const raw = String(input.city ?? '').trim()
  if (!raw) return badRequest(tool, lang, { es: 'Pasa una ciudad («city») o un precinto («precinct»).', en: 'Pass a city or a precinct.' })
  const slug = citySlug(raw)
  const areas = data.areas.filter((a) => a.slug === slug || a.slug === raw.toLowerCase() || (slug === 'unincorporated' && a.munic === UNINCORPORATED))
  if (!areas.length) return notFound(tool, lang, raw)
  const out = areas.map((a) => {
    const rows = areaRows(a, data, sites)
    return {
      area: a.slug,
      name: areaName(a, lang),
      district: a.district,
      page: absUrl(routes.voteArea(lang, a.slug)),
      precincts: rows.map((r) => ({
        precinct: r.precinct,
        place: r.polling ? { name: r.polling.name, address: r.polling.address } : null,
        alsoVotesHere: r.alsoHere,
      })),
    }
  })
  const precincts = out.reduce((s, a) => s + a.precincts.length, 0)
  const places = new Set(out.flatMap((a) => a.precincts.map((p) => (p.place ? `${p.place.name}|${p.place.address}`.toUpperCase() : null)).filter(Boolean))).size
  const name = out.length === 1 ? out[0].name : areaName({ munic: areas[0].munic, district: null }, lang)
  return {
    ok: true,
    tool,
    lang,
    text: `${t(
      `${name} tiene ${precincts} ${precincts === 1 ? 'precinto, que vota' : 'precintos, que votan'} en ${places} ${places === 1 ? 'lugar' : 'lugares'}.`,
      `${name} has ${precincts} ${precincts === 1 ? 'precinct' : 'precincts'}, voting at ${places} ${places === 1 ? 'polling place' : 'polling places'}.`,
    )} ${status}`,
    data: { election, areas: out },
    sources,
    fetchedAt: data.fetchedAt,
    page: out[0].page,
  }
}

/* ------------------------------------------------ evacuation_zone_summary */

const ZONE_CATEGORY: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 }

export async function evacuationSummary(input: { city?: string }, lang: Lang): Promise<ToolResult> {
  const tool = 'evacuation_zone_summary'
  const data = await surgeData()
  if (!data) return notReady(tool, lang)
  const t = (es: string, en: string) => (lang === 'es' ? es : en)
  const zones = data.zones.map((z) => ({
    zone: z,
    /** The county's own definition: the hurricane category from which the zone is at risk of storm surge. */
    atRiskFromCategory: ZONE_CATEGORY[z] ?? null,
    addresses: data.county.byZone[z] ?? 0,
  }))
  const guidance = t(
    'El condado evacúa cada zona, o parte de ella, según la trayectoria del huracán y la marejada prevista, sin importar su categoría. Si vives en una casa móvil o dependes de un equipo médico eléctrico, sal con cualquier orden de evacuación. El condado anuncia los refugios cuando abren.',
    'The county evacuates each zone, or part of one, depending on the hurricane’s track and projected storm surge, regardless of its category. Mobile-home residents and anyone on electrically powered medical equipment leave with any evacuation order. Shelters are announced by the county when they open.',
  )
  const sources = [SRC.surge, SRC.openData]
  const raw = String(input.city ?? '').trim()
  if (!raw) {
    const inZone = data.county.total - data.county.none
    return {
      ok: true,
      tool,
      lang,
      text: `${t(`De las ${fmt(data.county.total, lang)} direcciones de Miami-Dade, ${fmt(inZone, lang)} están en una zona de evacuación por marejada (A–E) y ${fmt(data.county.none, lang)} no.`, `Of Miami-Dade's ${fmt(data.county.total, lang)} addresses, ${fmt(inZone, lang)} are in a storm-surge evacuation zone (A–E) and ${fmt(data.county.none, lang)} are not.`)} ${guidance}`,
      data: {
        county: { addresses: data.county.total, inNoZone: data.county.none, zones },
        cities: data.areas.map((a) => ({
          city: a.slug,
          name: areaName({ munic: a.munic, district: null }, lang),
          addresses: a.addresses.total,
          inNoZone: a.addresses.none,
          byZone: a.addresses.byZone,
        })),
        guidance,
      },
      sources,
      fetchedAt: data.fetchedAt,
      page: absUrl(routes.evacuation(lang)),
    }
  }
  const slug = citySlug(raw)
  const a = data.areas.find((x) => x.slug === slug)
  if (!a) return notFound(tool, lang, raw)
  const name = areaName({ munic: a.munic, district: null }, lang)
  const inZone = a.addresses.total - a.addresses.none
  const parts = data.zones.filter((z) => a.addresses.byZone[z]).map((z) => `${z}: ${fmt(a.addresses.byZone[z], lang)}`)
  return {
    ok: true,
    tool,
    lang,
    text: `${
      inZone
        ? t(`${fmt(inZone, lang)} de las ${fmt(a.addresses.total, lang)} direcciones de ${name} están en una zona de evacuación por marejada (${parts.join(', ')}).`, `${fmt(inZone, lang)} of ${name}'s ${fmt(a.addresses.total, lang)} addresses are in a storm-surge evacuation zone (${parts.join(', ')}).`)
        : t(`Ninguna de las ${fmt(a.addresses.total, lang)} direcciones de ${name} está en una zona de evacuación por marejada.`, `None of ${name}'s ${fmt(a.addresses.total, lang)} addresses is in a storm-surge evacuation zone.`)
    } ${guidance}`,
    data: {
      city: a.slug,
      name,
      addresses: a.addresses.total,
      inNoZone: a.addresses.none,
      byZone: a.addresses.byZone,
      zips: a.zips.map((z) => ({ zip: z.zip, addresses: z.total, inNoZone: z.none, byZone: z.byZone })),
      zones,
      guidance,
    },
    sources,
    fetchedAt: data.fetchedAt,
    page: absUrl(SURGE_PAGES.includes(a.slug) ? routes.evacuationArea(lang, a.slug) : routes.place(lang, a.slug)),
  }
}

/* --------------------------------------------------------- trash_schedule */

export async function trashSchedule(input: { city?: string }, lang: Lang): Promise<ToolResult> {
  const tool = 'trash_schedule'
  const data = await placesData()
  if (!data) return notReady(tool, lang)
  const raw = String(input.city ?? '').trim()
  if (!raw) return badRequest(tool, lang, { es: 'Pasa una ciudad («city»).', en: 'Pass a city.' })
  const city = data.cities.find((c) => c.slug === citySlug(raw))
  if (!city) return notFound(tool, lang, raw)
  const c = placesCopy(lang)
  const name = areaName({ munic: city.munic, district: null }, lang)
  const mode = trashMode(city, data)
  const providers = trashProviders(city, data)
  const rows = (list: typeof city.garbage, table: typeof data.zones.garbage) =>
    list.flatMap((r) => {
      const p = table[r.i]
      if (!p) return []
      const days = pickup({ ...p, next: [] }, lang)?.days ?? null
      return [{ by: p.by, zone: p.zone || null, days, addresses: r.n }]
    })
  const page = absUrl(routes.place(lang, city.slug))
  if (mode.kind === 'city') {
    return {
      ok: true,
      tool,
      lang,
      text: c.trashCity(name),
      data: { city: city.slug, name, handledBy: 'city', addresses: city.total, schedule: null },
      sources: [SRC.openData, SRC.countyWaste],
      fetchedAt: data.fetchedAt,
      page,
    }
  }
  const onCounty = providers.county ?? 0
  const text =
    mode.kind === 'own'
      ? c.trashOwn(name, mode.by === 'hialeah' ? 'Hialeah' : 'Miami')
      : city.munic === UNINCORPORATED
        ? c.unincorporatedTrash(fmt(onCounty, lang), fmt(city.total, lang))
        : c.trashCounty(name, fmt(onCounty, lang), fmt(city.total, lang))
  return {
    ok: true,
    tool,
    lang,
    text: `${text} ${lang === 'es' ? 'Escribe la dirección con address_report para ver su zona y sus próximas fechas.' : 'Use address_report for an address’s own zone and next dates.'}`,
    data: {
      city: city.slug,
      name,
      handledBy: mode.kind === 'own' ? mode.by : 'county',
      addresses: city.total,
      addressesOnNoRoute: city.total - Object.values(providers).reduce((s, x) => s + x, 0),
      schedule: {
        garbage: rows(city.garbage, data.zones.garbage),
        recycling: rows(city.recycling, data.zones.recycling),
        bulk: rows(city.bulk, data.zones.bulk),
      },
    },
    sources: [SRC.openData, mode.kind === 'own' ? (mode.by === 'hialeah' ? SRC.hialeahWaste : SRC.miamiWaste) : SRC.countyWaste],
    fetchedAt: data.fetchedAt,
    page,
  }
}

/* -------------------------------------------------------- local_officials */

/**
 * Who governs a city: the county mayor (every address), the city's mayor
 * (none in the unincorporated county), and the county commissioners whose
 * districts hold its addresses. Each mayor with its source and checked date.
 */
export async function localOfficials(input: { city?: string }, lang: Lang, today: string = todayISO()): Promise<ToolResult> {
  const tool = 'local_officials'
  const data = await placesData()
  if (!data) return notReady(tool, lang)
  const raw = String(input.city ?? '').trim()
  if (!raw) return badRequest(tool, lang, { es: 'Pasa una ciudad («city»).', en: 'Pass a city.' })
  const city = data.cities.find((c) => c.slug === citySlug(raw))
  if (!city) return notFound(tool, lang, raw)
  const name = areaName({ munic: city.munic, district: null }, lang)
  const county = mayorOut(COUNTY_MAYOR, lang, today)
  const m = cityMayor(city.munic)
  const mayor = m ? mayorOut(m, lang, today) : null
  const commissioners = city.districts.map((d) => ({
    district: d.district,
    name: data.districts.find((x) => x.district === d.district)?.name ?? null,
    addresses: d.n,
    page: absUrl(routes.district(lang, d.district)),
  }))
  const t = (es: string, en: string) => (lang === 'es' ? es : en)
  const text = mayor
    ? t(
        `${mayor.name} ocupa la alcaldía de ${name} (${mayor.selectionText.toLowerCase()}; ${new URL(mayor.source).hostname}, consultado el ${mayor.checked}). Para todo el condado, la alcaldía es de ${county.name}.${mayor.ballotNote ? ` ${mayor.ballotNote}` : ''}`,
        `${mayor.name} is the mayor of ${name} (${mayor.selectionText.toLowerCase()}; ${new URL(mayor.source).hostname}, checked ${mayor.checked}). For the whole county, the mayor is ${county.name}.${mayor.ballotNote ? ` ${mayor.ballotNote}` : ''}`,
      )
    : t(
        `El condado no incorporado no tiene alcaldía de ciudad: lo gobiernan el condado, con ${county.name} en la alcaldía, y la Comisión del condado (${commissioners.map((c) => `distrito ${c.district}: ${c.name}`).join('; ')}).`,
        `Unincorporated Miami-Dade has no city mayor: it is governed by the county, with Mayor ${county.name}, and the county commission (${commissioners.map((c) => `District ${c.district}: ${c.name}`).join('; ')}).`,
      )
  return {
    ok: true,
    tool,
    lang,
    text,
    data: { city: city.slug, name, countyMayor: county, cityMayor: mayor, commissioners },
    sources: [
      { agency: 'Miami-Dade County · Mayor', url: COUNTY_MAYOR.sourceUrl },
      ...(m ? [{ agency: `${name} · official site`, url: m.sourceUrl }] : []),
      SRC.openData,
    ],
    fetchedAt: data.fetchedAt,
    page: absUrl(routes.place(lang, city.slug)),
  }
}
