import type { Lang } from '../i18n'

/**
 * Copy for the city and commission-district pages. Every number comes from
 * the address database; the sentences only say what those records are. Where
 * the records hold no schedule (a city that runs its own trash pickup), the
 * page says who does it and stops.
 */

const ES = {
  kicker: 'MIAMI-DADE · TU CIUDAD',
  breadcrumb: 'Ruta de navegación',
  home: 'Flamingo County',
  hub: 'Ciudades y distritos',
  hubTitle: 'Las ciudades y los distritos de Miami-Dade',
  hubMetaTitle: 'Ciudades y distritos de la Comisión de Miami-Dade: basura, inundación, evacuación y votación',
  hubMetaDescription:
    'Cada ciudad de Miami-Dade y el condado no incorporado: quién recoge la basura, cuántas direcciones están en zonas de inundación y de evacuación, dónde se vota y los 13 distritos de la Comisión. Según los registros del condado.',
  hubQuestion: '¿Cuántas ciudades y distritos de la Comisión tiene Miami-Dade?',
  hubAnswer: (cities: number, districts: number, total: string, uninc: string) =>
    `Según los registros del condado, Miami-Dade tiene ${cities} ciudades, más el condado no incorporado (${uninc} de sus ${total} direcciones), y ${districts} distritos de la Comisión del condado. Abajo está cada uno, con sus datos.`,
  cities: 'CIUDADES',
  districts: 'DISTRITOS DE LA COMISIÓN',
  unincorporated: 'Miami-Dade no incorporado',
  addresses: (n: string) => `${n} direcciones`,
  district: (n: number) => `Distrito ${n}`,
  districtTitle: (n: number) => `Distrito ${n} de la Comisión de Miami-Dade`,
  // City page
  cityTitle: (name: string) => `${name}: basura, inundación, evacuación y votación`,
  cityMetaTitle: (name: string) => `${name}: quién recoge la basura, zonas de inundación y evacuación, dónde votar`,
  cityMetaDescription: (name: string) =>
    `Quién recoge la basura en ${name}, cuántas direcciones están en zona de inundación de alto riesgo y de evacuación por marejada, sus lugares de votación y sus estaciones de bomberos y policía. Según los registros del condado Miami-Dade.`,
  cityQuestion: (name: string) => `¿Quién recoge la basura en ${name}?`,
  trash: 'BASURA',
  trashOwn: (name: string, city: string) => `La basura de ${name} la recoge la ciudad de ${city}, por zonas.`,
  trashCounty: (name: string, onRoute: string, total: string) =>
    `En ${name}, ${onRoute} de las ${total} direcciones están en rutas de recogida del condado Miami-Dade.`,
  trashCity: (name: string) => `${name} no está en las rutas de basura del condado: la recogida la maneja la ciudad de ${name}, directamente o con una empresa contratada. Consulta el horario con la ciudad.`,
  trashUncovered: (n: string) => `${n} direcciones no están en ninguna ruta del condado.`,
  unincorporatedTrash: (onRoute: string, total: string) =>
    `En el condado no incorporado, ${onRoute} de las ${total} direcciones están en rutas de recogida del condado Miami-Dade.`,
  garbage: 'Basura',
  recycling: 'Reciclaje',
  bulk: 'Basura grande',
  zoneCol: 'Zona o ruta',
  daysCol: 'Días',
  addressesCol: 'Direcciones',
  zoneLabel: (by: string, zone: string) => (by === 'hialeah' ? `Zona ${zone}` : by === 'miami' ? `Ruta ${zone}` : 'Condado'),
  trashNote: 'Los días festivos pueden mover la recogida. Escribe tu dirección para ver tu zona y tus próximas fechas.',
  // Flood
  flood: 'INUNDACIÓN (FEMA)',
  floodAnswer: (name: string, high: string, total: string, share: string) =>
    `${high} de las ${total} direcciones de ${name} (${share}) están en zonas de alto riesgo de inundación de FEMA (zonas A y V).`,
  floodZone: 'Zona de FEMA',
  floodHigh: 'alto riesgo',
  floodNone: 'Sin zona en el mapa',
  // Surge
  surge: 'EVACUACIÓN POR MAREJADA',
  surgeAnswer: (name: string, inZone: string, total: string, share: string) =>
    `${inZone} de las ${total} direcciones de ${name} (${share}) están en una zona de evacuación por marejada.`,
  surgeNone: (name: string) => `Ninguna dirección de ${name} está en una zona de evacuación por marejada.`,
  surgeMore: 'Qué significa cada zona',
  // Vote
  vote: 'DÓNDE VOTAR',
  voteAnswer: (name: string, precincts: number, places: number) =>
    `${name} tiene ${precincts} ${precincts === 1 ? 'precinto' : 'precintos'}, que votan en ${places} ${places === 1 ? 'lugar' : 'lugares'} el día de las elecciones.`,
  voteMore: 'Los lugares de votación, precinto por precinto',
  // Stations
  stations: 'BOMBEROS Y POLICÍA',
  stationsAnswer: (name: string, fire: number, police: number) =>
    `Dentro de los límites de ${name} hay ${fire} ${fire === 1 ? 'estación de bomberos' : 'estaciones de bomberos'} y ${police} ${police === 1 ? 'estación de policía' : 'estaciones de policía'} en los registros del condado.`,
  stationsNone: (name: string) =>
    `Los registros del condado no ubican ninguna estación de bomberos ni de policía dentro de los límites de ${name}. Escribe tu dirección para ver la más cercana.`,
  fire: 'Bomberos',
  police: 'Policía',
  nearest: 'La más cercana a tu dirección',
  emergency: 'En una emergencia, llama al 911.',
  // Commission
  commission: 'COMISIÓN DEL CONDADO',
  commissionIn: (name: string) => `${name} está en estos distritos de la Comisión de Miami-Dade:`,
  // District page
  districtMetaTitle: (n: number, who: string) => `Distrito ${n} de la Comisión de Miami-Dade: ${who}, ciudades y áreas`,
  districtMetaDescription: (n: number, who: string) =>
    `Quién representa al distrito ${n} en la Comisión de Miami-Dade (${who}), qué ciudades y qué áreas no incorporadas abarca y cuántas direcciones tiene. Según los registros del condado.`,
  districtQuestion: (n: number) => `¿Quién representa al distrito ${n} en la Comisión de Miami-Dade?`,
  districtAnswer: (n: number, who: string, total: string, places: string) =>
    `Al distrito ${n} de la Comisión de Miami-Dade lo representa ${who}, según los registros del condado. El distrito tiene ${total} direcciones, en ${places}.`,
  inDistrict: 'CIUDADES Y ÁREAS DEL DISTRITO',
  areaCol: 'Ciudad o área',
  unincorporatedZips: 'MIAMI-DADE NO INCORPORADO, POR CÓDIGO POSTAL',
  unincorporatedZipsNote: 'Los registros del condado no nombran las áreas no incorporadas; aquí van por código postal.',
  zip: 'Código postal',
  findAddress: 'Busca tu dirección',
  mapCommission: 'Ver los distritos en el mapa',
  mapPlace: 'Ver tu ciudad en el mapa',
  vote2: 'Dónde votar en este distrito',
  // Sources
  sources: 'FUENTES',
  source: (date: string) =>
    `Fuente: registros del condado Miami-Dade (datos abiertos: direcciones, límites de las ciudades, distritos de la Comisión, zonas de inundación de FEMA, zonas de marejada, estaciones), y rutas de basura de las ciudades de Hialeah y Miami · datos del ${date}.`,
  sourceVote: (date: string) => `Lugares de votación: lista del Supervisor de Elecciones del ${date}.`,
  counted: 'Se cuentan direcciones del registro del condado, no edificios ni personas.',
  openData: 'Datos abiertos de Miami-Dade',
  fema: 'Mapa de FEMA',
  wasteCounty: 'Basura del condado',
  wasteHialeah: 'Basura de Hialeah',
  wasteMiami: 'Basura de Miami',
}

export type PlacesCopy = typeof ES

const EN: PlacesCopy = {
  kicker: 'MIAMI-DADE · YOUR CITY',
  breadcrumb: 'Breadcrumb',
  home: 'Flamingo County',
  hub: 'Cities and districts',
  hubTitle: 'Miami-Dade’s cities and districts',
  hubMetaTitle: 'Miami-Dade cities and commission districts: trash, flooding, evacuation and voting',
  hubMetaDescription:
    'Every Miami-Dade city and the unincorporated county: who picks up the trash, how many addresses are in flood and evacuation zones, where to vote, and the 13 commission districts. From the county’s records.',
  hubQuestion: 'How many cities and commission districts does Miami-Dade have?',
  hubAnswer: (cities, districts, total, uninc) =>
    `By the county’s records, Miami-Dade has ${cities} cities plus the unincorporated county (${uninc} of its ${total} addresses), and ${districts} county commission districts. Each is below, with its numbers.`,
  cities: 'CITIES',
  districts: 'COMMISSION DISTRICTS',
  unincorporated: 'Unincorporated Miami-Dade',
  addresses: (n) => `${n} addresses`,
  district: (n) => `District ${n}`,
  districtTitle: (n) => `Miami-Dade Commission District ${n}`,
  cityTitle: (name) => `${name}: trash, flooding, evacuation and voting`,
  cityMetaTitle: (name) => `${name}: who picks up the trash, flood and evacuation zones, where to vote`,
  cityMetaDescription: (name) =>
    `Who picks up the trash in ${name}, how many addresses are in high-risk flood zones and storm-surge evacuation zones, its polling places and its fire and police stations. From Miami-Dade County’s records.`,
  cityQuestion: (name) => `Who picks up the trash in ${name}?`,
  trash: 'TRASH',
  trashOwn: (name, city) => `Trash in ${name} is picked up by the City of ${city}, by zone.`,
  trashCounty: (name, onRoute, total) => `In ${name}, ${onRoute} of ${total} addresses are on Miami-Dade County collection routes.`,
  trashCity: (name) => `${name} isn't on the county's trash routes: the City of ${name} handles pickup, itself or through a contracted hauler. Check the schedule with the city.`,
  trashUncovered: (n) => `${n} addresses are on no county route.`,
  unincorporatedTrash: (onRoute, total) =>
    `In the unincorporated county, ${onRoute} of ${total} addresses are on Miami-Dade County collection routes.`,
  garbage: 'Garbage',
  recycling: 'Recycling',
  bulk: 'Bulk trash',
  zoneCol: 'Zone or route',
  daysCol: 'Days',
  addressesCol: 'Addresses',
  zoneLabel: (by, zone) => (by === 'hialeah' ? `Zone ${zone}` : by === 'miami' ? `Route ${zone}` : 'County'),
  trashNote: 'Holidays can move pickup. Type your address to see your zone and your next dates.',
  flood: 'FLOODING (FEMA)',
  floodAnswer: (name, high, total, share) =>
    `${high} of ${name}’s ${total} addresses (${share}) are in FEMA high-risk flood zones (A and V zones).`,
  floodZone: 'FEMA zone',
  floodHigh: 'high risk',
  floodNone: 'No zone on the map',
  surge: 'STORM-SURGE EVACUATION',
  surgeAnswer: (name, inZone, total, share) => `${inZone} of ${name}’s ${total} addresses (${share}) are in a storm-surge evacuation zone.`,
  surgeNone: (name) => `None of ${name}’s addresses is in a storm-surge evacuation zone.`,
  surgeMore: 'What each zone means',
  vote: 'WHERE TO VOTE',
  voteAnswer: (name, precincts, places) =>
    `${name} has ${precincts} ${precincts === 1 ? 'precinct' : 'precincts'}, voting at ${places} ${places === 1 ? 'polling place' : 'polling places'} on Election Day.`,
  voteMore: 'Polling places, precinct by precinct',
  stations: 'FIRE AND POLICE',
  stationsAnswer: (name, fire, police) =>
    `Inside ${name}’s limits the county’s records place ${fire} ${fire === 1 ? 'fire station' : 'fire stations'} and ${police} ${police === 1 ? 'police station' : 'police stations'}.`,
  stationsNone: (name) =>
    `The county’s records place no fire or police station inside ${name}’s limits. Type your address to see the nearest.`,
  fire: 'Fire',
  police: 'Police',
  nearest: 'The nearest to your address',
  emergency: 'In an emergency, call 911.',
  commission: 'COUNTY COMMISSION',
  commissionIn: (name) => `${name} is in these Miami-Dade commission districts:`,
  districtMetaTitle: (n, who) => `Miami-Dade Commission District ${n}: ${who}, cities and areas`,
  districtMetaDescription: (n, who) =>
    `Who the Miami-Dade District ${n} commissioner is (${who}), which cities and unincorporated areas the district covers, and how many addresses it has. From the county’s records.`,
  districtQuestion: (n) => `Who is the Miami-Dade District ${n} commissioner?`,
  districtAnswer: (n, who, total, places) =>
    `${who} is the commissioner for Miami-Dade Commission District ${n}, by the county’s records. The district has ${total} addresses, in ${places}.`,
  inDistrict: 'CITIES AND AREAS IN THE DISTRICT',
  areaCol: 'City or area',
  unincorporatedZips: 'UNINCORPORATED MIAMI-DADE, BY ZIP CODE',
  unincorporatedZipsNote: 'The county’s records don’t name unincorporated areas; they are listed here by ZIP code.',
  zip: 'ZIP code',
  findAddress: 'Find your address',
  mapCommission: 'See the districts on the map',
  mapPlace: 'See your city on the map',
  vote2: 'Where to vote in this district',
  sources: 'SOURCES',
  source: (date) =>
    `Source: Miami-Dade County records (Open Data: addresses, city limits, commission districts, FEMA flood zones, storm-surge zones, stations), and the Cities of Hialeah and Miami trash routes · data of ${date}.`,
  sourceVote: (date) => `Polling places: the Supervisor of Elections’ list of ${date}.`,
  counted: 'Counts are addresses in the county’s address list, not buildings or people.',
  openData: 'Miami-Dade Open Data',
  fema: 'FEMA flood map',
  wasteCounty: 'County trash',
  wasteHialeah: 'Hialeah trash',
  wasteMiami: 'Miami trash',
}

export function placesCopy(lang: Lang): PlacesCopy {
  return lang === 'es' ? ES : EN
}
