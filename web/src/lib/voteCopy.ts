import type { Lang } from '../i18n'
import { titleCase } from './civicGeo'
import { UNINCORPORATED } from './civicSync'
import type { VoteArea } from './civic'

/**
 * Copy for the "where to vote" pages. Every number and date in it comes from
 * the records (the Supervisor of Elections' list, the county's precincts and
 * addresses); the sentences only say what those records are.
 */

/** "November 3, 2026" / "3 de noviembre de 2026". */
export function longDay(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`))
}

/** "November 3" / "3 de noviembre". */
export function dayMonth(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  )
}

/** "2026 General Election" → «Elección General 2026». Names we don't recognise stay as the list writes them. */
export function electionName(name: string | null | undefined, lang: Lang): string | null {
  if (!name) return null
  if (lang === 'en') return name
  const m = name.match(/^(\d{4}) (General|Primary) Election$/i)
  if (!m) return name
  return m[2].toLowerCase() === 'general' ? `Elección General ${m[1]}` : `Elección Primaria ${m[1]}`
}

/** The county writes "OPA-LOCKA"; the city spells itself Opa-locka. */
const CITY_NAMES: Record<string, string> = { 'OPA-LOCKA': 'Opa-locka' }

export function areaName(area: Pick<VoteArea, 'munic' | 'district'>, lang: Lang): string {
  if (area.munic === UNINCORPORATED) {
    const d = area.district
    if (lang === 'es') return d != null ? `Miami-Dade no incorporado, distrito ${d}` : 'Miami-Dade no incorporado'
    return d != null ? `Unincorporated Miami-Dade, District ${d}` : 'Unincorporated Miami-Dade'
  }
  return CITY_NAMES[area.munic] ?? titleCase(area.munic)
}

const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`

const ES = {
  kicker: 'ELECCIONES · MIAMI-DADE',
  breadcrumb: 'Ruta de navegación',
  home: 'Flamingo County',
  hub: 'Dónde votar',
  hubTitle: '¿Dónde voto?',
  hubMetaTitle: (date: string | null) =>
    date ? `¿Dónde voto en Miami-Dade? Lugares de votación del ${date}, por ciudad` : '¿Dónde voto en Miami-Dade? Lugares de votación por ciudad',
  hubMetaDescription:
    'El lugar de votación del día de las elecciones de cada precinto de Miami-Dade, por ciudad, y el condado no incorporado por distrito de la Comisión. Según la lista del Supervisor de Elecciones.',
  hubQuestion: '¿Dónde voto el día de las elecciones en Miami-Dade?',
  hubAnswer: (date: string, precincts: number, places: number) =>
    `El día de las elecciones, ${date}, cada precinto vota en su lugar asignado. Miami-Dade tiene ${n(precincts, 'precinto', 'precintos')} y ${n(places, 'lugar de votación', 'lugares de votación')}; abajo están por ciudad, y el condado no incorporado por distrito de la Comisión. La votación temprana es en otros lugares.`,
  hubAnswerLayer: (precincts: number, places: number) =>
    `Cada precinto vota en su lugar asignado. El condado tiene en sus registros ${n(precincts, 'precinto', 'precintos')} y ${n(places, 'lugar de votación', 'lugares de votación')}; abajo están por ciudad. Antes de una elección, confirma tu lugar con el Departamento de Elecciones.`,
  areaTitle: (name: string) => `Dónde votar en ${name}`,
  areaMetaTitle: (name: string, date: string | null) =>
    date ? `Dónde votar en ${name} el ${date}: lugares por precinto` : `Dónde votar en ${name}: lugares por precinto`,
  areaMetaDescription: (name: string, precincts: number, places: number) =>
    `Los ${n(precincts, 'precinto', 'precintos')} de ${name} y sus ${n(places, 'lugar', 'lugares')} de votación del día de las elecciones, según la lista del Supervisor de Elecciones de Miami-Dade.`,
  areaQuestion: (name: string) => `¿Dónde voto en ${name} el día de las elecciones?`,
  areaAnswer: (name: string, precincts: number, places: number, date: string) =>
    `${name} tiene ${n(precincts, 'precinto', 'precintos')}, que votan en ${n(places, 'lugar', 'lugares')} el día de las elecciones, ${date}. Busca tu precinto en la tabla, o escribe tu dirección para encontrarlo. La votación temprana es en otros lugares.`,
  areaAnswerLayer: (name: string, precincts: number, places: number) =>
    `${name} tiene ${n(precincts, 'precinto', 'precintos')}, que según los registros del condado votan en ${n(places, 'lugar', 'lugares')}. Antes de una elección, confirma tu lugar con el Departamento de Elecciones.`,
  over: (date: string) => `La elección del ${date} ya pasó.`,
  overSame:
    'Estos fueron los lugares de votación de ese día, según la lista del Supervisor de Elecciones. Antes de la próxima elección, confirma tu lugar con el Departamento de Elecciones.',
  overLayer:
    'Estos son los lugares que hoy tiene el condado en su capa de datos abiertos; pueden cambiar antes de la próxima elección. Confirma tu lugar con el Departamento de Elecciones.',
  electionDayOnly: 'Esto es para el día de las elecciones; la votación temprana es en otros lugares.',
  elections: 'Departamento de Elecciones de Miami-Dade',
  map: 'Ver los lugares de votación en el mapa',
  findAddress: 'Busca tu precinto con tu dirección',
  cities: 'CIUDADES',
  unincorporated: 'MIAMI-DADE NO INCORPORADO, POR DISTRITO DE LA COMISIÓN',
  unincorporatedNote:
    'Las zonas que no son parte de ninguna ciudad votan por distrito de la Comisión del condado. ¿No sabes en cuál estás? Escribe tu dirección.',
  counts: (precincts: number, places: number) => `${n(precincts, 'precinto', 'precintos')} · ${n(places, 'lugar', 'lugares')}`,
  commissioner: (d: number, name: string) => `Distrito ${d} de la Comisión: ${name}`,
  precinct: 'Precinto',
  place: 'Lugar de votación',
  alsoHere: 'También votan aquí',
  noSite: 'Sin lugar en la lista. Consulta al Departamento de Elecciones.',
  table: (name: string) => `Precintos de ${name} y su lugar de votación`,
  sources: 'FUENTES',
  sourceOfficial: (published: string, election: string | null) =>
    `Lugares de votación: según la lista del Supervisor de Elecciones de Miami-Dade del ${published}${election ? `, para la ${election}` : ''}.`,
  sourceLayer: 'Lugares de votación: capa de datos abiertos del condado Miami-Dade (PollingPlace).',
  sourcePrecincts:
    'Precintos y ciudades: los precintos del condado (datos abiertos de Miami-Dade), y la ciudad que el condado anota en cada dirección dentro de cada uno. Un precinto que cruza el límite de una ciudad aparece en las dos.',
  readOn: (date: string) => `Datos leídos el ${date}.`,
  pdf: 'Lista (PDF)',
  openData: 'Datos abiertos de Miami-Dade',
  otherAreas: 'Otras ciudades y distritos',
}

export type VoteCopy = typeof ES

const EN: VoteCopy = {
  kicker: 'ELECTIONS · MIAMI-DADE',
  breadcrumb: 'Breadcrumb',
  home: 'Flamingo County',
  hub: 'Where to vote',
  hubTitle: 'Where do I vote?',
  hubMetaTitle: (date) =>
    date ? `Where do I vote in Miami-Dade? ${date} polling places, by city` : 'Where do I vote in Miami-Dade? Polling places by city',
  hubMetaDescription:
    'The Election Day polling place for every precinct in Miami-Dade, by city, with unincorporated Miami-Dade by commission district. From the Supervisor of Elections’ list.',
  hubQuestion: 'Where do I vote on Election Day in Miami-Dade?',
  hubAnswer: (date, precincts, places) =>
    `On Election Day, ${date}, each precinct votes at its assigned polling place. Miami-Dade has ${n(precincts, 'precinct', 'precincts')} and ${n(places, 'polling place', 'polling places')}; they are listed below by city, with unincorporated Miami-Dade by commission district. Early voting uses other sites.`,
  hubAnswerLayer: (precincts, places) =>
    `Each precinct votes at its assigned polling place. The county’s records hold ${n(precincts, 'precinct', 'precincts')} and ${n(places, 'polling place', 'polling places')}, listed below by city. Before an election, confirm your site with the Elections Department.`,
  areaTitle: (name) => `Where to vote in ${name}`,
  areaMetaTitle: (name, date) => (date ? `Where to vote in ${name} on ${date}: polling places by precinct` : `Where to vote in ${name}: polling places by precinct`),
  areaMetaDescription: (name, precincts, places) =>
    `${name}’s ${n(precincts, 'precinct', 'precincts')} and their ${n(places, 'Election Day polling place', 'Election Day polling places')}, from the Miami-Dade Supervisor of Elections’ list.`,
  areaQuestion: (name) => `Where do I vote in ${name} on Election Day?`,
  areaAnswer: (name, precincts, places, date) =>
    `${name} has ${n(precincts, 'precinct', 'precincts')}, voting at ${n(places, 'polling place', 'polling places')} on Election Day, ${date}. Find your precinct in the table, or type your address to look it up. Early voting uses other sites.`,
  areaAnswerLayer: (name, precincts, places) =>
    `${name} has ${n(precincts, 'precinct', 'precincts')}, which the county’s records place at ${n(places, 'polling place', 'polling places')}. Before an election, confirm your site with the Elections Department.`,
  over: (date) => `The ${date} election is over.`,
  overSame:
    'These were that day’s polling places, from the Supervisor of Elections’ list. Before the next election, confirm your site with the Elections Department.',
  overLayer:
    'These are the sites the county’s open-data layer holds today; they may change before the next election. Confirm your site with the Elections Department.',
  electionDayOnly: 'This is for Election Day; early voting uses other sites.',
  elections: 'Miami-Dade Elections Department',
  map: 'See the polling places on the map',
  findAddress: 'Find your precinct by address',
  cities: 'CITIES',
  unincorporated: 'UNINCORPORATED MIAMI-DADE, BY COMMISSION DISTRICT',
  unincorporatedNote:
    'Areas outside every city are listed by county commission district. Not sure which one you are in? Type your address.',
  counts: (precincts, places) => `${n(precincts, 'precinct', 'precincts')} · ${n(places, 'site', 'sites')}`,
  commissioner: (d, name) => `Commission District ${d}: ${name}`,
  precinct: 'Precinct',
  place: 'Polling place',
  alsoHere: 'Also votes here',
  noSite: 'No site on the list. Ask the Elections Department.',
  table: (name) => `${name} precincts and their polling places`,
  sources: 'SOURCES',
  sourceOfficial: (published, election) =>
    `Polling places: the Miami-Dade Supervisor of Elections’ list of ${published}${election ? `, for the ${election}` : ''}.`,
  sourceLayer: 'Polling places: Miami-Dade County’s open-data layer (PollingPlace).',
  sourcePrecincts:
    'Precincts and cities: the county’s precincts (Miami-Dade Open Data), and the city the county records on each address inside them. A precinct that crosses a city line is listed in both cities.',
  readOn: (date) => `Data read ${date}.`,
  pdf: 'The list (PDF)',
  openData: 'Miami-Dade Open Data',
  otherAreas: 'Other cities and districts',
}

export function voteCopy(lang: Lang): VoteCopy {
  return lang === 'es' ? ES : EN
}
