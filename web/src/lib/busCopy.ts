import type { Lang } from '../i18n'

/**
 * Copy for the county bus pages (/[lang]/bus). Every time and count in it
 * comes from Miami-Dade Transit's schedule (lib/county.ts); the sentences
 * only say what that schedule is. Spanish says «guagua», as the free-rides
 * pages do: it is what Hialeah calls the bus.
 */

const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`

/** Spanish names carry their article ("la Ruta 54", "el Trolley…"): "de el" is "del". */
const del = (s: string) => s.replace(/\bde el\b/g, 'del')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const ES = {
  breadcrumb: 'Ruta de navegación',
  home: 'Flamingo County',
  hub: 'Rutas de guagua',
  kickerBus: 'METROBUS · MIAMI-DADE TRANSIT',
  kickerTrolley: 'TROLLEY GRATIS · CIUDAD DE MIAMI',
  hubTitle: 'Rutas de guagua',
  hubSub:
    'Las guaguas del condado que pasan por Hialeah, Miami Lakes, la Pequeña Habana y Miami Gardens: todas las paradas, la primera y la última guagua, y cada cuánto pasan.',
  hubMetaTitle:
    'Rutas de Metrobus en Hialeah, Miami Lakes, la Pequeña Habana y Miami Gardens: paradas y horarios',
  hubMetaDescription:
    'Las rutas de guagua de Miami-Dade que pasan por Hialeah, Miami Lakes, la Pequeña Habana y Miami Gardens: cada parada, la primera y la última guagua, y cada cuánto pasan, según el horario del condado.',
  hubQuestion: '¿Qué guaguas pasan por Hialeah, Miami Lakes, la Pequeña Habana y Miami Gardens?',
  hubAnswer: (count: number) =>
    `Aquí hay ${n(count, 'ruta', 'rutas')} del condado que cruzan esas ciudades, con todas sus paradas y su horario. En Hialeah también hay dos guaguas gratis de la ciudad, la Flamingo y la Marlin.`,
  cityHeading: (city: string) => `PASAN POR ${city.toUpperCase()}`,
  freeLines: 'Las guaguas gratis de Hialeah: Flamingo y Marlin →',
  metaTitle: (name: string, a: string, b: string) =>
    `${name} de Metrobus: paradas y horario, ${a} ⇄ ${b}`,
  metaTitleTrolley: (name: string) => `${name}: paradas y horario (gratis)`,
  metaDescription: (name: string, via: string, stops: number, every: string | null) =>
    del(
      `Todas las ${stops} paradas de ${name} por ${via}, en los dos sentidos, con la primera y la última guagua${every ? ` y cada cuánto pasa (${every} al mediodía entre semana)` : ''}. Según el horario de Miami-Dade Transit.`,
    ),
  question: (name: string) => `¿Por dónde pasa ${name} y a qué hora?`,
  answer: (
    name: string,
    via: string,
    a: string,
    b: string,
    minutes: number,
    weekday: string | null,
    sunday: string | null,
  ) =>
    `${cap(name)} va de ${a} a ${b} por ${via}, en unos ${minutes} minutos de punta a punta.` +
    (weekday ? ` Entre semana ${weekday}.` : '') +
    (sunday ? ` Los domingos ${sunday}.` : ' Los domingos no pasa.'),
  answerNoTimes: (name: string, via: string, a: string, b: string) =>
    `${cap(name)} va de ${a} a ${b} por ${via}. El condado está cambiando su horario: confirma la hora en GO Miami-Dade Transit antes de salir.`,
  dayLine: (first: string, last: string, every: string | null) =>
    every ? `pasa de ${first} a ${last}, ${every}` : `pasa de ${first} a ${last}`,
  dayLineAllNight: (every: string | null) =>
    every ? `pasa toda la noche, ${every}` : 'pasa toda la noche',
  free: 'GRATIS',
  fare: 'Pasaje del condado',
  ride: (m: number) => `${m} min de punta a punta`,
  stopsCount: (k: number) => n(k, 'parada', 'paradas'),
  schedule: 'HORARIO',
  scheduleCaption: (name: string) => del(`Horario de ${name}, por día`),
  day: 'Día',
  firstBus: 'Primera guagua',
  lastBus: 'Última guagua',
  rush: 'Mañana (6:30–9)',
  midday: 'Mediodía (10–2)',
  evening: 'Noche (7–10)',
  weekday: 'Lunes a viernes',
  saturday: 'Sábado',
  sunday: 'Domingo',
  noService: 'No pasa',
  allNight: 'Toda la noche',
  every: (m: number) => `cada ~${m} min`,
  scheduleNote: (date: string) =>
    `Según el horario de Miami-Dade Transit, vigente hasta el ${date}. Las horas son de salida del principio de la ruta; en cada parada la guagua pasa más tarde.`,
  stale:
    'El horario que teníamos del condado ya venció. Confirma las horas en GO Miami-Dade Transit.',
  toward: (place: string) => `HACIA ${place.toUpperCase()}`,
  alsoEnds: (places: string) => `Algunas guaguas terminan antes, en ${places}.`,
  stopList: (place: string) => `Paradas hacia ${place}`,
  minutes: (m: number) => `${m} min`,
  transfer: 'Cambia a',
  more: (k: number) => `+${k}`,
  allStops: (k: number) => `Ver las ${k} paradas`,
  keyStops: 'Paradas principales; las otras se ven al abrir la lista.',
  near: 'CERCA DE LA RUTA',
  nearNote: (route: string) =>
    del(`Negocios del directorio a pocos minutos caminando de una parada de ${route}.`),
  walk: (m: number, stop: string) => `${m} min caminando desde ${stop}`,
  nextTitle: 'PRÓXIMA GUAGUA',
  nextLead: 'Escoge tu parada y el sentido, o deja que te busquemos la más cercana.',
  direction: 'Sentido',
  yourStop: 'Tu parada',
  useLocation: 'Buscar la parada más cerca de mí',
  locating: 'Buscando…',
  denied: 'No pudimos ver tu ubicación. Escoge la parada en la lista.',
  walkToStop: (m: number) => `A ${m} min caminando de ti`,
  farFromYou: (m: number) => `La parada más cerca queda a ${m} min caminando`,
  inMin: (m: number) =>
    m < 1 ? 'ahora' : m < 60 ? `en ${m} min` : `en ${Math.floor(m / 60)} h ${m % 60} min`,
  tomorrow: 'mañana',
  thenAt: 'Después:',
  noMore: 'No quedan guaguas desde esta parada en las próximas 24 horas.',
  endOfLine: 'Aquí termina la ruta en este sentido: escoge el otro sentido.',
  scheduled: 'Según el horario del condado: la guagua puede pasar unos minutos antes o después.',
  liveTag: 'EN VIVO',
  scheduledTag: 'horario',
  liveSource:
    'En vivo: dónde viene cada guagua, según Miami-Dade Transit. Las horas marcadas «horario» son del horario del condado.',
  mapsStop: 'Cómo llegar a la parada ↗',
  privacy: 'Tu ubicación se queda en tu teléfono.',
  live: 'AVISOS Y HORARIO OFICIAL',
  liveNote:
    'El condado publica en su página los desvíos, los avisos y el horario en PDF de la ruta.',
  mapTitle: 'DÓNDE VIENEN LAS GUAGUAS',
  mapYou: 'Tú',
  mapOpen: 'Abrir el mapa',
  mapOpenHint: 'Toca el mapa para verlo en grande: las paradas, las guaguas y los lugares cerca.',
  mapBack: (route: string) => `← ${route}`,
  mapNoLiveTrolley:
    'El trolley no tiene datos en vivo: el mapa muestra su recorrido y sus paradas.',
  mapLegend: 'Leyenda',
  mapLegendBus: 'Guagua en vivo (la flecha dice hacia dónde va)',
  mapLegendStop: 'Parada (tócala para ver la próxima guagua)',
  mapLegendPlace: 'Lugar del directorio cerca de la ruta',
  mapPickHint: 'Toca una parada para ver cuándo pasa la próxima guagua.',
  mapPickTitle: 'Toca una parada',
  mapPickOr: 'O escógela de la lista:',
  mapPickPlaceholder: 'Escoge una parada…',
  mapCountShort: (n: number) => (n === 1 ? '1 guagua en vivo' : `${n} guaguas en vivo`),
  mapNearMe: 'Cerca de mí',
  mapPlaceWalk: (m: number, stop: string) => `A ${m} min caminando de la parada ${stop}`,
  mapPlaceOpen: 'Ver el lugar →',
  mapPlaceClose: 'Cerrar',
  mapStopLabel: 'PARADA',
  mapMetaTitle: (route: string) => del(`Mapa en vivo de ${route}: dónde vienen las guaguas`),
  mapMetaDescription: (route: string) =>
    del(
      `Las guaguas de ${route} en el mapa, en vivo, con sus paradas y la próxima guagua en cada una.`,
    ),
  mapLabel: (route: string) => `Mapa: ${route}, con sus guaguas en vivo`,
  mapZoomIn: 'Acercar',
  mapZoomOut: 'Alejar',
  mapClose: 'Cerrar',
  mapCredits: 'Créditos del mapa',
  mapTwoFingers: 'Usa dos dedos para mover el mapa',
  mapLoading: 'Cargando el mapa…',
  mapFailed: 'No se pudo cargar el mapa. Las horas de arriba siguen al día.',
  mapNoLive: 'Ahora mismo no hay datos en vivo del condado. Las horas de arriba son del horario.',
  mapNone: 'Ahora mismo no hay guaguas de esta ruta en la calle.',
  mapCount: (n: number, by: [string, number][]) =>
    `${n === 1 ? 'Hay 1 guagua' : `Hay ${n} guaguas`} en la calle ahora: ${by.map(([t, k]) => `${k} hacia ${t}`).join(', ')}.`,
  mapUpdated: (s: number) => (s < 5 ? '(Recién actualizado.)' : `(Actualizado hace ${s} s.)`),
  mapBus: (route: string, toward: string, age: number) =>
    `Guagua de la ${route} hacia ${toward}. Posición de hace ${age < 60 ? `${age} s` : `${Math.round(age / 60)} min`}.`,
  countyPage: 'La ruta en la página del condado',
  sources: 'FUENTES',
  sourceLine: (date: string) =>
    `Paradas, tiempos y horario: Miami-Dade Transit (GTFS), leído el ${date}.`,
  liveSourceLine:
    'Horas en vivo: Miami-Dade Transit, datos en tiempo real de Swiftly, Inc., tal cual y sin garantía.',
  liveTerms: 'Condiciones de uso',
  otherRoutes: 'OTRAS RUTAS',
  freeRides: 'Guaguas gratis en Hialeah',
}

type BusCopy = typeof ES

const EN: BusCopy = {
  breadcrumb: 'Breadcrumb',
  home: 'Flamingo County',
  hub: 'Bus routes',
  kickerBus: 'METROBUS · MIAMI-DADE TRANSIT',
  kickerTrolley: 'FREE TROLLEY · CITY OF MIAMI',
  hubTitle: 'Bus routes',
  hubSub:
    'The county buses through Hialeah, Miami Lakes, Little Havana and Miami Gardens: every stop, the first and last bus, and how often they come.',
  hubMetaTitle:
    'Metrobus routes in Hialeah, Miami Lakes, Little Havana and Miami Gardens: stops and schedules',
  hubMetaDescription:
    'The Miami-Dade bus routes through Hialeah, Miami Lakes, Little Havana and Miami Gardens: every stop, the first and last bus, and how often each comes, from the county’s schedule.',
  hubQuestion: 'Which buses run through Hialeah, Miami Lakes, Little Havana and Miami Gardens?',
  hubAnswer: (count: number) =>
    `Here are ${n(count, 'county route', 'county routes')} that cross those cities, with every stop and the schedule. Hialeah also runs two free buses of its own, the Flamingo and the Marlin.`,
  cityHeading: (city: string) => `THROUGH ${city.toUpperCase()}`,
  freeLines: 'Hialeah’s free buses: Flamingo and Marlin →',
  metaTitle: (name: string, a: string, b: string) =>
    `Metrobus ${name}: stops and schedule, ${a} ⇄ ${b}`,
  metaTitleTrolley: (name: string) => `${name}: stops and schedule (free)`,
  metaDescription: (name: string, via: string, stops: number, every: string | null) =>
    `All ${stops} stops on ${name} along ${via}, both directions, with the first and last bus${every ? ` and how often it comes (${every} on a weekday midday)` : ''}. From Miami-Dade Transit’s schedule.`,
  question: (name: string) => `Where does ${name} go, and when does it run?`,
  answer: (
    name: string,
    via: string,
    a: string,
    b: string,
    minutes: number,
    weekday: string | null,
    sunday: string | null,
  ) =>
    `${name} runs between ${a} and ${b} along ${via}, about ${minutes} minutes end to end.` +
    (weekday ? ` On weekdays it ${weekday}.` : '') +
    (sunday ? ` On Sundays it ${sunday}.` : ' It doesn’t run on Sundays.'),
  answerNoTimes: (name: string, via: string, a: string, b: string) =>
    `${name} runs between ${a} and ${b} along ${via}. The county is changing its schedule: check the time in GO Miami-Dade Transit before you leave.`,
  dayLine: (first: string, last: string, every: string | null) =>
    every ? `runs from ${first} to ${last}, ${every}` : `runs from ${first} to ${last}`,
  dayLineAllNight: (every: string | null) =>
    every ? `runs all night, ${every}` : 'runs all night',
  free: 'FREE',
  fare: 'County fare',
  ride: (m: number) => `${m} min end to end`,
  stopsCount: (k: number) => n(k, 'stop', 'stops'),
  schedule: 'SCHEDULE',
  scheduleCaption: (name: string) => `${name} schedule, by day`,
  day: 'Day',
  firstBus: 'First bus',
  lastBus: 'Last bus',
  rush: 'Morning (6:30–9)',
  midday: 'Midday (10–2)',
  evening: 'Evening (7–10)',
  weekday: 'Monday to Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
  noService: 'No service',
  allNight: 'All night',
  every: (m: number) => `every ~${m} min`,
  scheduleNote: (date: string) =>
    `From Miami-Dade Transit’s schedule, in force until ${date}. Times are when buses leave the start of the route; at each stop the bus comes later.`,
  stale: 'The county schedule we had has ended. Check the times in GO Miami-Dade Transit.',
  toward: (place: string) => `TOWARD ${place.toUpperCase()}`,
  alsoEnds: (places: string) => `Some buses end early, at ${places}.`,
  stopList: (place: string) => `Stops toward ${place}`,
  minutes: (m: number) => `${m} min`,
  transfer: 'Change to',
  more: (k: number) => `+${k}`,
  allStops: (k: number) => `See all ${k} stops`,
  keyStops: 'Main stops; open the list for the rest.',
  near: 'NEAR THE ROUTE',
  nearNote: (route: string) => `Places in the directory a few minutes’ walk from a ${route} stop.`,
  walk: (m: number, stop: string) => `${m} min walk from ${stop}`,
  nextTitle: 'NEXT BUS',
  nextLead: 'Pick your stop and direction, or let us find the one nearest you.',
  direction: 'Direction',
  yourStop: 'Your stop',
  useLocation: 'Find the stop nearest me',
  locating: 'Finding…',
  denied: 'We couldn’t see your location. Pick your stop from the list.',
  walkToStop: (m: number) => `${m} min walk from you`,
  farFromYou: (m: number) => `The nearest stop is a ${m} min walk`,
  inMin: (m: number) =>
    m < 1 ? 'now' : m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h ${m % 60} min`,
  tomorrow: 'tomorrow',
  thenAt: 'Then:',
  noMore: 'No more buses from this stop in the next 24 hours.',
  endOfLine: 'The route ends here this way: pick the other direction.',
  scheduled: 'From the county’s schedule: a bus can come a few minutes early or late.',
  liveTag: 'LIVE',
  scheduledTag: 'scheduled',
  liveSource:
    'Live: where each bus actually is, from Miami-Dade Transit. Times marked “scheduled” are from the county’s schedule.',
  mapsStop: 'Walk to the stop ↗',
  privacy: 'Your location stays on your phone.',
  live: 'ALERTS AND THE OFFICIAL TIMETABLE',
  liveNote: 'The county posts the route’s detours, alerts and PDF timetable on its own page.',
  mapTitle: 'WHERE THE BUSES ARE',
  mapYou: 'You',
  mapOpen: 'Open the map',
  mapOpenHint: 'Tap the map to see it big: the stops, the buses and the places nearby.',
  mapBack: (route: string) => `← ${route}`,
  mapNoLiveTrolley: 'The trolley has no live data: the map shows its route and stops.',
  mapLegend: 'Legend',
  mapLegendBus: 'Live bus (the arrow shows where it’s heading)',
  mapLegendStop: 'Stop (tap it for the next bus)',
  mapLegendPlace: 'A place from the directory near the route',
  mapPickHint: 'Tap a stop to see when the next bus comes.',
  mapPickTitle: 'Tap a stop',
  mapPickOr: 'Or pick it from the list:',
  mapPickPlaceholder: 'Pick a stop…',
  mapCountShort: (n: number) => (n === 1 ? '1 bus live' : `${n} buses live`),
  mapNearMe: 'Near me',
  mapPlaceWalk: (m: number, stop: string) => `${m} min walk from the ${stop} stop`,
  mapPlaceOpen: 'See the place →',
  mapPlaceClose: 'Close',
  mapStopLabel: 'STOP',
  mapMetaTitle: (route: string) => `${route} live map: where the buses are`,
  mapMetaDescription: (route: string) =>
    `${route}'s buses on the map, live, with every stop and the next bus at each.`,
  mapLabel: (route: string) => `Map of ${route} with its buses live`,
  mapZoomIn: 'Zoom in',
  mapZoomOut: 'Zoom out',
  mapClose: 'Close',
  mapCredits: 'Map credits',
  mapTwoFingers: 'Use two fingers to move the map',
  mapLoading: 'Loading the map…',
  mapFailed: 'The map couldn’t load. The times above are still current.',
  mapNoLive:
    'There’s no live data from the county right now. The times above are from the schedule.',
  mapNone: 'No buses on this route are on the road right now.',
  mapCount: (n: number, by: [string, number][]) =>
    `${n === 1 ? '1 bus is' : `${n} buses are`} on the road now: ${by.map(([t, k]) => `${k} toward ${t}`).join(', ')}.`,
  mapUpdated: (s: number) => (s < 5 ? '(Just updated.)' : `(Updated ${s} s ago.)`),
  mapBus: (route: string, toward: string, age: number) =>
    `${route} bus toward ${toward}. Position from ${age < 60 ? `${age} s` : `${Math.round(age / 60)} min`} ago.`,
  countyPage: 'The route on the county’s site',
  sources: 'SOURCES',
  sourceLine: (date: string) =>
    `Stops, ride times and schedule: Miami-Dade Transit (GTFS), read ${date}.`,
  liveSourceLine:
    'Live times: Miami-Dade Transit, real-time data from Swiftly, Inc., as is and with no warranty.',
  liveTerms: 'Terms of use',
  otherRoutes: 'OTHER ROUTES',
  freeRides: 'Free buses in Hialeah',
}

export function busCopy(lang: Lang): BusCopy {
  return lang === 'es' ? ES : EN
}
