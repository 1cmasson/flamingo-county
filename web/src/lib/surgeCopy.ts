import type { Lang } from '../i18n'

/**
 * Copy for the storm-surge (evacuation zone) pages. What each zone means,
 * and what to do, is the county's own wording on its storm-surge page
 * (LINKS.knowYourZone, read 2026-10-07); every number comes from the address
 * database. Counts are addresses in the county's address list: not
 * buildings, not people.
 */

export const fmt = (n: number, lang: Lang) => new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US').format(n)
/** A share to one decimal; a share that rounds to nothing but isn't is "<0.1%", never "0%". */
export const pct = (part: number, whole: number, lang: Lang) => {
  if (!whole) return '—'
  const f = new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'percent', maximumFractionDigits: 1 })
  return part > 0 && part / whole < 0.0005 ? `<${f.format(0.001)}` : f.format(part / whole)
}

/** "A, B y C" / "A, B and C". */
export function listOf(items: string[], lang: Lang): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${lang === 'es' ? 'y' : 'and'} ${items[items.length - 1]}`
}

/**
 * The cities with a page of their own. Hialeah first: it is where the
 * question gets asked («¿Hialeah está en zona de evacuación?»). More can be
 * added by slug; every city's numbers are already in the database.
 */
export const SURGE_PAGES = ['hialeah']

/** The county's storm-surge planning zones: the hurricane category from which each is at risk. */
const CATEGORY: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 }

const ES = {
  kicker: 'HURACANES · MIAMI-DADE',
  todo: '¿QUÉ HAGO?',
  breadcrumb: 'Ruta de navegación',
  home: 'Flamingo County',
  hub: 'Zonas de evacuación',
  hubTitle: 'Zonas de evacuación por marejada en Miami-Dade',
  hubMetaTitle: 'Zonas de evacuación por huracán en Miami-Dade: A, B, C, D y E por ciudad',
  hubMetaDescription:
    'Qué significa cada zona de evacuación por marejada de Miami-Dade, de la A a la E, y cuántas direcciones de cada ciudad están en cada una. Según los registros del condado.',
  hubQuestion: '¿Cuál es mi zona de evacuación por huracán en Miami-Dade?',
  hubAnswer: (total: string, inZone: string, none: string) =>
    `Depende de tu dirección. Miami-Dade tiene cinco zonas de evacuación por marejada, de la A (la de mayor riesgo) a la E. De las ${total} direcciones del condado, ${inZone} están en alguna zona y ${none} no están en ninguna. Escribe tu dirección para ver la tuya.`,
  zoneTitle: (z: string) => `Zona ${z}`,
  zoneMeaning: (z: string) =>
    z === 'A'
      ? 'La de mayor riesgo de marejada: desde huracanes de categoría 1.'
      : z === 'E'
        ? 'En riesgo de marejada con huracanes de categoría 5.'
        : `En riesgo de marejada desde huracanes de categoría ${CATEGORY[z]}.`,
  addresses: (n: string) => `${n} direcciones`,
  inZoneCities: 'Ciudades y zonas con direcciones aquí',
  howOrdered:
    'El condado evacúa cada zona, o parte de ella, según la trayectoria del huracán y la marejada prevista, sin importar su categoría. Las zonas que deben salir se anuncian en miamidade.gov.',
  notFlood: 'Estas zonas son de marejada, no tu zona de inundación de FEMA.',
  mobile:
    'Si vives en una casa móvil o dependes de un equipo médico eléctrico, sal con cualquier orden de evacuación por huracán, sea cual sea tu zona.',
  shelters: 'El condado anuncia los refugios cuando abren.',
  countyPage: 'Zonas de marejada del condado',
  lookup: 'Busca tu zona (mapa del condado)',
  alerts: 'Alertas de Miami-Dade',
  hurricanes: 'Huracanes: guía del condado',
  findAddress: 'Busca tu zona con tu dirección',
  map: 'Ver las zonas en el mapa',
  byCity: 'POR CIUDAD',
  city: 'Ciudad',
  inAnyZone: 'En una zona (A–E)',
  share: 'Parte',
  noZone: 'Sin zona',
  zone: 'Zona',
  addressesCol: 'Direcciones',
  total: 'Total',
  unincorporated: 'Miami-Dade no incorporado',
  zip: 'Código postal',
  areaQuestion: (name: string) => `¿${name} está en zona de evacuación?`,
  areaTitle: (name: string) => `¿${name} está en zona de evacuación?`,
  areaMetaTitle: (name: string) => `¿${name} está en zona de evacuación por huracán? Zonas de marejada por código postal`,
  areaMetaDescription: (name: string, inZone: string, total: string) =>
    `${inZone} de las ${total} direcciones de ${name} están en una zona de evacuación por marejada. Cuántas en cada zona y por código postal, según los registros del condado Miami-Dade.`,
  areaAnswer: (name: string, inZone: string, total: string, parts: string, none: string, all: boolean) =>
    all
      ? `Sí: las ${total} direcciones de ${name} están en una zona de evacuación por marejada (${parts}). Escribe tu dirección para ver la tuya.`
      : `Sí, en parte: ${inZone} de las ${total} direcciones de ${name} están en una zona de evacuación por marejada (${parts}). Las otras ${none} no están en ninguna zona. Escribe tu dirección para saber si la tuya está.`,
  areaAnswerNone: (name: string, total: string) =>
    `No: ninguna de las ${total} direcciones de ${name} está en una zona de evacuación por marejada.`,
  partInZone: (n: string, z: string) => `${n} en la zona ${z}`,
  notIn: (zones: string) => `${zones}: ninguna dirección.`,
  byZone: 'POR ZONA',
  byZip: 'POR CÓDIGO POSTAL',
  byZipNote: 'Un mismo código postal puede tener calles en zona y calles sin zona; tu dirección es lo que cuenta.',
  partial: 'Una orden puede cubrir solo parte de una zona: sigue lo que anuncie el condado.',
  counted: 'Se cuentan direcciones del registro del condado, no edificios ni personas.',
  sources: 'FUENTES',
  source: (date: string) =>
    `Fuente: zonas de planificación de marejada y direcciones del condado Miami-Dade (datos abiertos) · datos del ${date}.`,
  openData: 'Datos abiertos de Miami-Dade',
  otherPages: 'Más sobre tu dirección',
  morePlace: (name: string) => `Más sobre ${name}: basura, inundación, votación`,
}

export type SurgeCopy = typeof ES

const EN: SurgeCopy = {
  kicker: 'HURRICANES · MIAMI-DADE',
  todo: 'WHAT TO DO',
  breadcrumb: 'Breadcrumb',
  home: 'Flamingo County',
  hub: 'Evacuation zones',
  hubTitle: 'Storm-surge evacuation zones in Miami-Dade',
  hubMetaTitle: 'Miami-Dade hurricane evacuation zones: A, B, C, D and E by city',
  hubMetaDescription:
    'What each of Miami-Dade’s storm-surge evacuation zones, A to E, means, and how many addresses in each city are in each one. From the county’s records.',
  hubQuestion: 'What is my hurricane evacuation zone in Miami-Dade?',
  hubAnswer: (total, inZone, none) =>
    `It depends on your address. Miami-Dade has five storm-surge evacuation zones, from A (greatest risk) to E. Of the county’s ${total} addresses, ${inZone} are in a zone and ${none} are in none. Type your address to see yours.`,
  zoneTitle: (z) => `Zone ${z}`,
  zoneMeaning: (z) =>
    z === 'A'
      ? 'Greatest risk of storm surge: from Category 1 storms and higher.'
      : z === 'E'
        ? 'At risk of storm surge from Category 5 storms.'
        : `At risk of storm surge from Category ${CATEGORY[z]} storms and higher.`,
  addresses: (n) => `${n} addresses`,
  inZoneCities: 'Cities and areas with addresses here',
  howOrdered:
    'The county evacuates each zone, or part of one, depending on the hurricane’s track and projected storm surge, regardless of its category. The areas that must leave are announced on miamidade.gov.',
  notFlood: 'These are storm-surge zones, not your FEMA flood zone.',
  mobile:
    'If you live in a mobile home or depend on electrically powered medical equipment, leave whenever any hurricane evacuation is ordered, whatever your zone.',
  shelters: 'Shelters are announced by the county when they open.',
  countyPage: 'County storm-surge zones',
  lookup: 'Find your zone (county map)',
  alerts: 'Miami-Dade Alerts',
  hurricanes: 'County hurricane guide',
  findAddress: 'Find your zone by address',
  map: 'See the zones on the map',
  byCity: 'BY CITY',
  city: 'City',
  inAnyZone: 'In a zone (A–E)',
  share: 'Share',
  noZone: 'No zone',
  zone: 'Zone',
  addressesCol: 'Addresses',
  total: 'Total',
  unincorporated: 'Unincorporated Miami-Dade',
  zip: 'ZIP code',
  areaQuestion: (name) => `Is ${name} in an evacuation zone?`,
  areaTitle: (name) => `Is ${name} in an evacuation zone?`,
  areaMetaTitle: (name) => `Is ${name} in a hurricane evacuation zone? Storm-surge zones by ZIP code`,
  areaMetaDescription: (name, inZone, total) =>
    `${inZone} of ${name}’s ${total} addresses are in a storm-surge evacuation zone. How many in each zone and by ZIP code, from Miami-Dade County’s records.`,
  areaAnswer: (name, inZone, total, parts, none, all) =>
    all
      ? `Yes: all ${total} of ${name}’s addresses are in a storm-surge evacuation zone (${parts}). Type your address to see yours.`
      : `Partly: ${inZone} of ${name}’s ${total} addresses are in a storm-surge evacuation zone (${parts}). The other ${none} are in no zone. Type your address to see whether yours is.`,
  areaAnswerNone: (name, total) =>
    `No: none of ${name}’s ${total} addresses is in a storm-surge evacuation zone.`,
  partInZone: (n, z) => `${n} in zone ${z}`,
  notIn: (zones) => `${zones}: no addresses.`,
  byZone: 'BY ZONE',
  byZip: 'BY ZIP CODE',
  byZipNote: 'One ZIP code can have streets in a zone and streets in none; your own address is what counts.',
  partial: 'An order can cover only part of a zone: follow what the county announces.',
  counted: 'Counts are addresses in the county’s address list, not buildings or people.',
  sources: 'SOURCES',
  source: (date) =>
    `Source: Miami-Dade County storm-surge planning zones and addresses (Open Data) · data of ${date}.`,
  openData: 'Miami-Dade Open Data',
  otherPages: 'More about your address',
  morePlace: (name) => `More about ${name}: trash, flooding, voting`,
}

export function surgeCopy(lang: Lang): SurgeCopy {
  return lang === 'es' ? ES : EN
}
