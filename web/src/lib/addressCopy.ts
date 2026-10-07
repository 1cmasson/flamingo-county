import type { Lang } from '../i18n'
import { parseISO } from './dates'

/**
 * The address page's copy, both languages side by side so they can't drift.
 * Spanish is the first language here: written for a Hialeah reader ("guagua",
 * "basura grande"), not translated word for word.
 */
export function addressCopy(lang: Lang) {
  return lang === 'es' ? ES : EN
}

export type AddressCopy = typeof EN

const EN = {
  metaTitle: 'Your Miami-Dade address: trash days, flood zone, who represents you',
  metaDescription:
    'Type your address and see your garbage, recycling and bulk trash days, your flood and storm-surge zone, who represents you, where you vote, your schools and the nearest fire station, from the city’s and county’s own records.',
  /** Structured data: the tool's records, as a dataset. */
  datasetName: 'Miami-Dade street addresses with their public service zones',
  datasetDescription:
    'Every street address in Miami-Dade County matched to its garbage, recycling and bulk trash route, FEMA flood zone, hurricane storm-surge evacuation zone, county commission district, Florida House and Senate district, voting precinct and Election Day polling place, and public school attendance zones. Compiled by Flamingo County from the public records of Miami-Dade County, the City of Hialeah, the City of Miami and FEMA; no owner, sale or property-value data.',
  kicker: 'YOUR HOME IN MIAMI-DADE',
  title: 'Everything the city knows about your address.',
  lead: 'Trash days, flood zone, who represents you, where you vote, your schools. One search, from the city’s and county’s own records.',
  placeholder: 'Your address, e.g. 5410 W 6th Ln',
  inputLabel: 'Your street address in Miami-Dade',
  listLabel: 'Matching addresses',
  go: 'SEE MY ADDRESS',
  locate: 'USE MY LOCATION',
  locating: 'Finding you…',
  isThisIt: 'Is this your address?',
  yesThis: 'YES, THIS ONE',
  noLocation: 'Your phone didn’t share a location. Type your address instead.',
  notNear: 'We couldn’t find a Miami-Dade address where you are. Type your address instead.',
  noMatch: 'No Miami-Dade address matches yet. Start with the house number, like "5410 W 6".',
  privacy: 'Your location is used once, to find the nearest address, and isn’t kept. We don’t keep a record of the addresses you look up.',
  coverage: 'Every street address in Miami-Dade County.',
  notReady: 'We’re loading the county’s latest records. Try again in a few minutes.',
  notFound: 'We couldn’t find that address. Try searching again.',

  change: 'CHANGE ADDRESS',
  print: 'PRINT MY SHEET',
  calendar: 'ADD TRASH DAYS TO MY CALENDAR',
  calendarHint: 'Every pickup day shows up in your phone’s calendar. If it doesn’t remind you on its own, add an alert. Holidays can move a pickup.',
  units: (n: number) => (n > 1 ? `${n} units at this address` : ''),

  trash: 'TRASH',
  garbage: 'Garbage',
  recycling: 'Recycling',
  bulk: 'Bulk trash',
  next: 'Next',
  bulkShort: 'Put it out no more than 24 hours before, or the city can fine you.',
  bulkRule: (earliest: string) => `Put it out no more than 24 hours before (from ${earliest}), or the city can fine you. Keep tree cuttings in a separate pile.`,
  noPickup: 'The city’s home pickup doesn’t list this address.',
  businessNote: 'This looks like a business. Businesses hire a private hauler; the city’s home pickup days are below in case they apply.',
  buildingNote: 'Big apartment buildings often have their own dumpster service. Ask the building if these days apply to you.',
  holidays: 'Holidays can move pickups.',
  everyOther: (day: string) => `Every other ${day}`,
  findWeek: 'WHICH WEEK? COUNTY LOOKUP',
  byAppointment: 'By appointment',
  appointmentText: 'Two free pickups a year. Book first, then put it out no more than 3 days before.',
  bookBulk: 'BOOK A BULK PICKUP',
  cityRuns: (city: string) => `Trash pickup here is run by the City of ${city}. Check your city’s schedule.`,
  mobileNote: 'The city’s home pickup schedule; ask your park if it collects for you.',
  sourceBy: { hialeah: 'City of Hialeah', miami: 'City of Miami', county: 'Miami-Dade County' } as Record<string, string>,

  bus: 'FREE BUS',
  walk: (m: number) => `${m} min walk`,
  far: (km: string) => `${km} km away`,
  stop: 'stop',
  seeLine: 'SEE THE LINE',

  flood: 'FLOOD ZONE',
  floodZone: (z: string) => `FEMA zone ${z}`,
  floodText: {
    X: 'Minimal flood risk on FEMA’s map. Low isn’t zero: streets here still flood in heavy rain.',
    AE: 'High-risk flood zone. With a federally backed mortgage, flood insurance is required.',
    AH: 'High-risk flood zone (shallow ponding). With a federally backed mortgage, flood insurance is required.',
  } as Record<string, string>,

  storm: 'HURRICANES',
  surgeNone: 'Not in a storm-surge evacuation zone.',
  surgeZone: (z: string) => `Storm-surge zone ${z}`,
  surgeText: (z: string) => `If the county orders zone ${z} to evacuate, you have to leave. Zones go from A (closest to the coast, first to go) to E.`,
  mobileHome: 'In a mobile home? Leave whenever any evacuation is ordered.',
  mobileAlert: 'This is a mobile home. Leave whenever any hurricane evacuation is ordered, whatever the zone.',
  shelters: 'Shelters are announced by the county when they open.',
  knowZone: 'COUNTY EVACUATION INFO',

  reps: 'WHO REPRESENTS YOU',
  mayor: 'Mayor of Hialeah',
  council: 'Hialeah City Council',
  councilText: '7 members, all elected citywide, so every one of them represents you.',
  yourCity: 'Your city',
  unincorporated: 'Unincorporated Miami-Dade',
  unincorporatedText: 'No city government here: the county is your local government, and your county commissioner is your closest elected official.',
  commissioner: (d: number) => `Miami-Dade Commissioner · District ${d}`,
  houseLabel: 'Florida House',
  senateLabel: 'Florida Senate',
  districtN: (d: number) => `District ${d}`,
  whoIsIt: 'WHO REPRESENTS IT',
  repsAsOf: (d: string) => `From Miami-Dade County’s records, copied ${d}. The November 3 election may change these.`,

  vote: 'WHERE YOU VOTE',
  precinct: (p: number) => `Precinct ${p}`,
  voteText: 'This is your Election Day polling place. Early voting uses other sites.',
  voteFor: (election: string, published: string) => `For the ${election} election, from the Supervisor of Elections' polling place list of ${published}.`,
  elections: 'MIAMI-DADE ELECTIONS',
  allPolling: 'EVERY POLLING PLACE, BY CITY',

  schools: 'YOUR SCHOOLS',
  schoolNote: 'Assigned by address. Magnet and charter schools are separate.',

  nearby: 'CLOSEST TO YOU',
  fire: 'Fire station',
  police: 'Police',
  library: 'Library',
  park: 'Park',
  hospital: 'Hospital',
  emergency: 'Emergency? Call 911.',
  nonEmergency: 'non-emergency',

  sources: 'WHERE THIS COMES FROM',
  sourcesText: (d: string) =>
    `Public records of Miami-Dade County, the cities of Hialeah and Miami, and FEMA, copied ${d}. We keep addresses only, never who lives there.`,
  wrong: 'Something wrong? Tell us',

  webview: (app: string) => `You’re inside ${app || 'an app'}. To print or add to your calendar, open this page in your browser.`,
  openChrome: 'OPEN IN CHROME',
  copyLink: 'COPY LINK',
  copied: 'COPIED. PASTE IT IN SAFARI.',
  sheetTitle: 'MY HOME',
  sheetFooter: 'flamingocounty.com · from the county’s and cities’ public records',
}

const ES: AddressCopy = {
  metaTitle: 'Tu dirección en Miami-Dade: días de basura, zona de inundación, quién te representa',
  metaDescription:
    'Escribe tu dirección y ve tus días de basura, reciclaje y basura grande, tu zona de inundación y de evacuación, quién te representa, dónde votas, tus escuelas y la estación de bomberos más cerca, según los registros de la ciudad y el condado.',
  datasetName: 'Direcciones de Miami-Dade con sus zonas de servicios públicos',
  datasetDescription:
    'Cada dirección del condado Miami-Dade con su ruta de basura, reciclaje y basura grande, su zona de inundación de FEMA, su zona de evacuación por marejada ciclónica, su distrito de la Comisión del condado, sus distritos de la Cámara y el Senado de Florida, su precinto y lugar de votación del día de las elecciones, y sus zonas escolares. Recopilado por Flamingo County a partir de los registros públicos del condado Miami-Dade, la Ciudad de Hialeah, la Ciudad de Miami y FEMA; sin datos de dueños, ventas ni valor de la propiedad.',
  kicker: 'TU CASA EN MIAMI-DADE',
  title: 'Todo lo que la ciudad sabe de tu dirección.',
  lead: 'Días de basura, zona de inundación, quién te representa, dónde votas, tus escuelas. Una sola búsqueda, con los registros de la ciudad y el condado.',
  placeholder: 'Tu dirección, ej. 5410 W 6th Ln',
  inputLabel: 'Tu dirección en Miami-Dade',
  listLabel: 'Direcciones que coinciden',
  go: 'VER MI DIRECCIÓN',
  locate: 'USAR MI UBICACIÓN',
  locating: 'Buscándote…',
  isThisIt: '¿Es esta tu dirección?',
  yesThis: 'SÍ, ESTA',
  noLocation: 'Tu teléfono no compartió la ubicación. Escribe tu dirección.',
  notNear: 'No encontramos una dirección de Miami-Dade donde estás. Escribe tu dirección.',
  noMatch: 'Todavía no hay una dirección de Miami-Dade que coincida. Empieza por el número de la casa, como «5410 W 6».',
  privacy: 'Tu ubicación se usa una sola vez, para encontrar la dirección más cerca, y no se guarda. No llevamos registro de las direcciones que buscas.',
  coverage: 'Todas las direcciones del condado Miami-Dade.',
  notReady: 'Estamos cargando los registros más recientes del condado. Vuelve a intentarlo en unos minutos.',
  notFound: 'No encontramos esa dirección. Búscala otra vez.',

  change: 'CAMBIAR DIRECCIÓN',
  print: 'IMPRIMIR MI HOJA',
  calendar: 'PONER LA BASURA EN MI CALENDARIO',
  calendarHint: 'Cada día de recogida aparece en el calendario de tu teléfono. Si no te avisa solo, ponle un aviso. Los feriados pueden mover la recogida.',
  units: (n: number) => (n > 1 ? `${n} unidades en esta dirección` : ''),

  trash: 'BASURA',
  garbage: 'Basura',
  recycling: 'Reciclaje',
  bulk: 'Basura grande',
  next: 'Próxima',
  bulkShort: 'No la saques más de 24 horas antes o la ciudad te puede multar.',
  bulkRule: (earliest: string) => `No la saques más de 24 horas antes (desde el ${earliest}) o la ciudad te puede multar. Las ramas van en otra pila.`,
  noPickup: 'La recogida de casas de la ciudad no incluye esta dirección.',
  businessNote: 'Parece un negocio. Los negocios contratan un servicio privado; abajo están los días de la ciudad por si te aplican.',
  buildingNote: 'Los edificios grandes muchas veces tienen su propio contenedor. Pregunta en el edificio si estos días te aplican.',
  holidays: 'Los feriados pueden mover la recogida.',
  everyOther: (day: string) => `Cada dos semanas, el ${day}`,
  findWeek: '¿QUÉ SEMANA? BÚSCALA EN EL CONDADO',
  byAppointment: 'Con cita',
  appointmentText: 'Dos recogidas gratis al año. Pide la cita primero y sácala no más de 3 días antes.',
  bookBulk: 'PEDIR UNA CITA',
  cityRuns: (city: string) => `Aquí la basura la recoge la Ciudad de ${city}. Consulta el horario de tu ciudad.`,
  mobileNote: 'Es el horario de recogida de casas; pregunta en tu parque si te recogen ahí.',
  sourceBy: { hialeah: 'Ciudad de Hialeah', miami: 'Ciudad de Miami', county: 'Condado Miami-Dade' },

  bus: 'GUAGUA GRATIS',
  walk: (m: number) => `${m} min a pie`,
  far: (km: string) => `a ${km} km`,
  stop: 'parada',
  seeLine: 'VER LA RUTA',

  flood: 'ZONA DE INUNDACIÓN',
  floodZone: (z: string) => `Zona ${z} de FEMA`,
  floodText: {
    X: 'Riesgo mínimo de inundación en el mapa de FEMA. Bajo no es cero: las calles aquí se inundan con los aguaceros.',
    AE: 'Zona de alto riesgo de inundación. Con una hipoteca respaldada por el gobierno federal, el seguro de inundación es obligatorio.',
    AH: 'Zona de alto riesgo (agua estancada poco profunda). Con una hipoteca respaldada por el gobierno federal, el seguro de inundación es obligatorio.',
  },

  storm: 'HURACANES',
  surgeNone: 'No estás en zona de evacuación por marejada.',
  surgeZone: (z: string) => `Zona de marejada ${z}`,
  surgeText: (z: string) => `Si el condado ordena evacuar la zona ${z}, te toca salir. Las zonas van de la A (la más cerca de la costa, la primera en salir) a la E.`,
  mobileHome: '¿Vives en una casa móvil? Sal con cualquier orden de evacuación.',
  mobileAlert: 'Esta es una casa móvil. Sal con cualquier orden de evacuación por huracán, sea cual sea la zona.',
  shelters: 'El condado anuncia los refugios cuando abren.',
  knowZone: 'EVACUACIÓN DEL CONDADO',

  reps: 'QUIÉN TE REPRESENTA',
  mayor: 'Alcalde de Hialeah',
  council: 'Concejo de Hialeah',
  councilText: '7 miembros elegidos por toda la ciudad, así que todos te representan.',
  yourCity: 'Tu ciudad',
  unincorporated: 'Miami-Dade no incorporado',
  unincorporatedText: 'Aquí no hay gobierno de ciudad: el condado es tu gobierno local y tu comisionado del condado es tu funcionario electo más cercano.',
  commissioner: (d: number) => `Comisionado de Miami-Dade · Distrito ${d}`,
  houseLabel: 'Cámara de Florida',
  senateLabel: 'Senado de Florida',
  districtN: (d: number) => `Distrito ${d}`,
  whoIsIt: 'QUIÉN LO REPRESENTA',
  repsAsOf: (d: string) => `De los registros del condado Miami-Dade, copiados el ${d}. Las elecciones del 3 de noviembre pueden cambiarlos.`,

  vote: 'DÓNDE VOTAS',
  precinct: (p: number) => `Precinto ${p}`,
  voteText: 'Aquí votas el día de las elecciones. La votación temprana es en otros lugares.',
  voteFor: (election: string, published: string) => `Para la elección del ${election}, según la lista de lugares de votación del Supervisor de Elecciones del ${published}.`,
  elections: 'ELECCIONES DE MIAMI-DADE',
  allPolling: 'TODOS LOS LUGARES DE VOTACIÓN, POR CIUDAD',

  schools: 'TUS ESCUELAS',
  schoolNote: 'Asignadas por dirección. Las escuelas magnet y chárter son aparte.',

  nearby: 'LO MÁS CERCA',
  fire: 'Bomberos',
  police: 'Policía',
  library: 'Biblioteca',
  park: 'Parque',
  hospital: 'Hospital',
  emergency: '¿Emergencia? Llama al 911.',
  nonEmergency: 'no emergencias',

  sources: 'DE DÓNDE SALE ESTO',
  sourcesText: (d: string) =>
    `Registros públicos del condado Miami-Dade, las ciudades de Hialeah y Miami, y FEMA, copiados el ${d}. Guardamos direcciones, nunca quién vive en ellas.`,
  wrong: '¿Algo está mal? Dínoslo',

  webview: (app: string) => `Estás dentro de ${app || 'una app'}. Para imprimir o ponerlo en el calendario, abre esta página en tu navegador.`,
  openChrome: 'ABRIR EN CHROME',
  copyLink: 'COPIAR EL ENLACE',
  copied: 'COPIADO. PÉGALO EN SAFARI.',
  sheetTitle: 'MI CASA',
  sheetFooter: 'flamingocounty.com · de los registros públicos del condado y las ciudades',
}

/** The address box's words, as plain strings for the client component. Shared by the address page and home. */
export function searchCopy(lang: Lang) {
  const c = addressCopy(lang)
  return {
    placeholder: c.placeholder,
    inputLabel: c.inputLabel,
    listLabel: c.listLabel,
    go: c.go,
    locate: c.locate,
    locating: c.locating,
    isThisIt: c.isThisIt,
    yesThis: c.yesThis,
    noLocation: c.noLocation,
    notNear: c.notNear,
    noMatch: c.noMatch,
    privacy: c.privacy,
  }
}

/** The home page's invitation to the address page. */
export function homeAddressCopy(lang: Lang) {
  return lang === 'es'
    ? {
        kicker: 'TU CASA EN MIAMI-DADE',
        title: '¿Qué día recogen la basura en tu casa?',
        lead: 'Escribe tu dirección: días de basura y reciclaje, zona de inundación y de evacuación, quién te representa, dónde votas y tus escuelas. Con mapa.',
      }
    : {
        kicker: 'YOUR HOME IN MIAMI-DADE',
        title: 'What day is trash pickup at your house?',
        lead: 'Type your address: trash and recycling days, flood and evacuation zone, who represents you, where you vote and your schools. With a map.',
      }
}

/** "Thu, Oct 8" / "jue 8 oct" — a pickup day, read on Miami's calendar. */
export function pickupDay(iso: string, lang: Lang): string {
  const d = parseISO(iso)
  const f = new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  return f.format(d).replace(/\./g, '')
}

export function dayName(d: number, lang: Lang): string {
  return (lang === 'es'
    ? ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])[d]
}

/** "Monday & Thursday" / "1ST and 3RD Tuesday" / "2nd Friday", in the reader's words. */
export function ruleText(rule: { days: number[]; weeks: number[] | null }, lang: Lang): string {
  const names =
    lang === 'es'
      ? ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const and = lang === 'es' ? ' y ' : ' & '
  const days = rule.days.map((d) => names[d]).join(and)
  if (!rule.weeks) return lang === 'es' ? days[0].toUpperCase() + days.slice(1) : days
  const nth = (n: number) => (lang === 'es' ? ['', '1er', '2do', '3er', '4to', '5to'][n] : ['', '1st', '2nd', '3rd', '4th', '5th'][n])
  const weeks = rule.weeks.map(nth).join(and)
  return lang === 'es' ? `${weeks} ${days} del mes` : `${weeks} ${days} of the month`
}

/** The map's words: plain strings, since they cross into a client component. */
export type MapCopy = {
  list: string
  map: string
  explore: string
  exploreLead: string
  label: string
  layers: string
  fullScreen: string
  closeFull: string
  lens: Record<'garbage' | 'flood' | 'surge' | 'commission' | 'polling' | 'elementary' | 'places' | 'bus', string>
  you: string
  closer: string
  loading: string
  failed: string
  zoomIn: string
  zoomOut: string
  close: string
  credits: string
  twoFingers: string
  days: string[]
  and: string
  otherDays: string
  district: string
  precinct: string
  pollingPlace: string
  surgeZone: string
  surgeNote: string
  floodZone: string
  floodHigh: string
  floodCoastal: string
  schoolZone: string
  eachColor: string
  place: Record<'fire' | 'police' | 'hospital' | 'library' | 'park', string>
  free: string
  hint: Record<'garbage' | 'flood' | 'surge' | 'commission' | 'polling' | 'elementary' | 'places' | 'bus', string>
}

export function mapCopy(lang: Lang): MapCopy {
  return lang === 'es'
    ? {
        list: 'LISTA',
        map: 'MAPA',
        explore: 'EXPLORA EL MAPA DEL CONDADO',
        exploreLead: 'Escoge una capa: días de basura, inundación, marejada, comisionados, dónde votar, escuelas.',
        label: 'Mapa de Miami-Dade',
        layers: 'Capas del mapa',
        fullScreen: 'PANTALLA COMPLETA',
        closeFull: 'CERRAR',
        lens: {
          garbage: '🗑️ Basura',
          flood: '🌊 Inundación',
          surge: '🌀 Marejada',
          commission: '🏛️ Comisionados',
          polling: '🗳️ Dónde votar',
          elementary: '🏫 Escuelas',
          places: '📍 Servicios',
          bus: '🚌 Guagua gratis',
        },
        you: 'Tu casa',
        closer: 'Acércate para ver esta capa',
        loading: 'Cargando el mapa…',
        failed: 'El mapa no cargó. Todo lo que dice también está en la lista.',
        zoomIn: 'Acercar',
        zoomOut: 'Alejar',
        close: 'Cerrar',
        credits: 'Créditos del mapa',
        twoFingers: 'Usa dos dedos para mover el mapa',
        days: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
        and: ' y ',
        otherDays: 'Otros días',
        district: 'Distrito',
        precinct: 'Precinto',
        pollingPlace: 'Lugar de votación',
        surgeZone: 'Zona de marejada',
        surgeNote: 'La A sale primero, la E de última.',
        floodZone: 'Zona de FEMA',
        floodHigh: 'Alto riesgo de inundación',
        floodCoastal: 'Alto riesgo con oleaje (costa)',
        schoolZone: 'Zona de la escuela primaria',
        eachColor: 'Cada color es un distrito; toca uno para ver quién lo representa.',
        place: { fire: 'Bomberos', police: 'Policía', hospital: 'Hospital', library: 'Biblioteca', park: 'Parque' },
        free: 'Gratis, sin tarjeta',
        hint: {
          garbage: 'Cada color es un horario de recogida. Toca una zona.',
          flood: 'Solo se pintan las zonas de alto riesgo de FEMA; el resto es zona X.',
          surge: 'Si el condado ordena evacuar tu zona, te toca salir.',
          commission: 'Los 13 distritos del condado. Toca uno.',
          polling: 'Cada línea es un precinto; los puntos amarillos son donde se vota el día de las elecciones.',
          elementary: 'La zona de cada escuela primaria. Toca una.',
          places: 'Bomberos, policía, hospitales, bibliotecas y parques.',
          bus: 'Las dos rutas gratis de Hialeah: Flamingo y Marlin.',
        },
      }
    : {
        list: 'LIST',
        map: 'MAP',
        explore: 'EXPLORE THE COUNTY MAP',
        exploreLead: 'Pick a layer: trash days, flood, storm surge, commissioners, where to vote, schools.',
        label: 'Map of Miami-Dade',
        layers: 'Map layers',
        fullScreen: 'FULL SCREEN',
        closeFull: 'CLOSE',
        lens: {
          garbage: '🗑️ Trash',
          flood: '🌊 Flood',
          surge: '🌀 Storm surge',
          commission: '🏛️ Commissioners',
          polling: '🗳️ Where to vote',
          elementary: '🏫 Schools',
          places: '📍 Services',
          bus: '🚌 Free bus',
        },
        you: 'Your home',
        closer: 'Zoom in to see this layer',
        loading: 'Loading the map…',
        failed: 'The map didn’t load. Everything it shows is also in the list.',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        close: 'Close',
        credits: 'Map credits',
        twoFingers: 'Use two fingers to move the map',
        days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        and: ' & ',
        otherDays: 'Other days',
        district: 'District',
        precinct: 'Precinct',
        pollingPlace: 'Polling place',
        surgeZone: 'Storm-surge zone',
        surgeNote: 'A leaves first, E last.',
        floodZone: 'FEMA zone',
        floodHigh: 'High flood risk',
        floodCoastal: 'High risk with waves (coast)',
        schoolZone: 'Elementary school zone',
        eachColor: 'Each color is a district; tap one to see who represents it.',
        place: { fire: 'Fire station', police: 'Police', hospital: 'Hospital', library: 'Library', park: 'Park' },
        free: 'Free, no card',
        hint: {
          garbage: 'Each color is a pickup schedule. Tap a zone.',
          flood: 'Only FEMA’s high-risk zones are painted; everywhere else is zone X.',
          surge: 'If the county orders your zone to evacuate, you have to leave.',
          commission: 'The county’s 13 districts. Tap one.',
          polling: 'Each line is a precinct; yellow dots are Election Day polling places.',
          elementary: 'Each elementary school’s zone. Tap one.',
          places: 'Fire stations, police, hospitals, libraries and parks.',
          bus: 'Hialeah’s two free lines: Flamingo and Marlin.',
        },
      }
}
