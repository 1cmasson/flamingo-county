/**
 * Spanish for strings that do not exist in `../fc-data.js`.
 *
 * `dictionary.generated.ts` is rewritten from the design source by
 * `pnpm gen:dictionary`, so anything hand-added there is lost on the next run.
 * Copy that the site has since written for itself — the narrowed taxonomy, the
 * COMING SOON state, the live ticker — lives here instead, and
 * `translator()` merges this map over the generated one.
 *
 * Same contract as the generated dictionary: the key IS the English string, and
 * a miss returns the key untouched. So an English literal changed in a `.tsx`
 * without a matching entry here silently ships English to Spanish readers.
 */
export const ES_OVERRIDES: Record<string, string> = {
  // --- Partners ----------------------------------------------------------
  // Businesses on the site are partners, not paying members. The design
  // source says MEMBER/MEMBERSHIP, so the generated dictionary still carries
  // those keys; nothing renders them any more.
  PARTNERSHIP: 'ALIANZA',
  PARTNER: 'SOCIO',
  'VERIFIED PARTNER': 'SOCIO VERIFICADO',

  // --- Event status ------------------------------------------------------
  CANCELLED: 'CANCELADO',
  POSTPONED: 'APLAZADO',
  'NEW DATE': 'NUEVA FECHA',

  // --- Footer ------------------------------------------------------------
  PRIVACY: 'PRIVACIDAD',

  // --- City page ---------------------------------------------------------
  'NOTHING MATCHED THAT SEARCH.': 'NO HAY NADA CON ESA BÚSQUEDA.',
  'NOTHING HERE YET.': 'TODAVÍA NO HAY NADA AQUÍ.',
  'Search this city…': 'Busca en esta ciudad…',
  'Search a business or a dish…': 'Busca un negocio o un plato…',

  // --- Search suggestions -------------------------------------------------
  // The listbox's accessible name. Never rendered visually.
  Suggestions: 'Sugerencias',

  // --- A city with no listings yet ---------------------------------------
  'COMING SOON': 'MUY PRONTO',
  "We're still walking these blocks. Know a spot that belongs here?":
    'Todavía estamos caminando estas cuadras. ¿Conoces un lugar que deba estar aquí?',

  // --- Events board ------------------------------------------------------
  // The generated dictionary has bare 'ALL EVENTS' and the arrowed
  // '← ALL LISTINGS', but never the arrowed events variant — the key is the
  // whole English literal, arrow included, so the event page's back link was
  // shipping English to Spanish readers. Invisible until now: no event had
  // ever been seeded, so the page it sits on had nothing to render.
  '← ALL EVENTS': '← TODOS LOS EVENTOS',
  'NOTHING ON THE BOARD YET.': 'TODAVÍA NO HAY NADA EN LA PIZARRA.',
  'THIS WEEK': 'ESTA SEMANA',
  'AROUND HERE.': 'POR AQUÍ.',

  // --- Ticker ------------------------------------------------------------
  'NOW ON THE LISTING': 'AHORA EN EL DIRECTORIO',
  'LOCAL SPOTS': 'NEGOCIOS DE AQUÍ',
  'PARTNER SPOTLIGHTS EVERY FRIDAY': 'SOCIOS EN CANDELA TODOS LOS VIERNES',

  // --- Home hero and CTAs ------------------------------------------------
  'EVERY SPOT THE LOCALS VOUCH FOR.': 'CADA LUGAR QUE LA GENTE DE AQUÍ RESPALDA.',
  'EAT, DRINK & KNOW': 'COME, BEBE Y CONOCE',
  'YOUR NEIGHBORS.': 'A TU GENTE.',
  'Restaurants and bars, vouched for by the neighborhoods that eat and drink in them. Pick a city up top to meet its crew.':
    'Restaurantes y bares, respaldados por los barrios que comen y beben en ellos. Escoge una ciudad arriba y conoce a su pandilla.',
  'EVERY CITY': 'TODAS LAS CIUDADES',
  'OWN A SPOT AROUND HERE?': '¿TIENES UN NEGOCIO POR AQUÍ?',

  // --- Free rides (/free-rides) ------------------------------------------
  // "Guagua" on purpose: it is what Hialeah calls a bus. Stop names stay in
  // the county's English in both languages, since that is what the pole says.
  'FREE RIDES': 'RUTAS GRATIS',
  'HIALEAH · FREE TRANSIT': 'HIALEAH · TRANSPORTE GRATIS',
  'RIDE THE CITY': 'RECORRE LA CIUDAD',
  'FOR FREE.': 'GRATIS.',
  'Two free bus lines cross Hialeah, both directions, six days a week. No fare, no card — just get on. Here is where they go and what is a short walk from each stop.':
    'Dos rutas de guagua gratis cruzan Hialeah, de ida y vuelta, seis días a la semana. Sin pasaje, sin tarjeta: te subes y ya. Aquí ves adónde van y qué te queda a pasos de cada parada.',
  'Free buses in Hialeah: the Flamingo and Marlin lines': 'Guaguas gratis en Hialeah: las rutas Flamingo y Marlin',
  'Where Hialeah’s two free bus lines go, when they run, and the local spots a short walk from a stop. No fare, no card.':
    'Adónde van las dos rutas de guagua gratis de Hialeah, cuándo pasan y los lugares a pasos de cada parada. Sin pasaje, sin tarjeta.',
  'The lines': 'Las rutas',
  'FREE BUS LINE': 'RUTA DE GUAGUA GRATIS',
  'HIALEAH · FREE BUS LINE': 'HIALEAH · RUTA DE GUAGUA GRATIS',
  'to and from': 'ida y vuelta',
  'BETWEEN BUSES': 'ENTRE GUAGUAS',
  'END TO END': 'DE PUNTA A PUNTA',
  STOPS: 'PARADAS',
  'PASSES BY': 'PASA POR',
  'SEE EVERY STOP →': 'VER TODAS LAS PARADAS →',
  '1 spot on this line': '1 lugar en esta ruta',
  '{n} spots on this line': '{n} lugares en esta ruta',
  'SPOTS ON THE FREE LINES': 'LUGARES EN LAS RUTAS GRATIS',
  'Every place on Flamingo County that sits within a ten-minute walk of a free stop.':
    'Cada lugar de Flamingo County que queda a menos de diez minutos caminando de una parada gratis.',
  '{n} MIN WALK': '{n} MIN A PIE',
  '{n} min walk': 'a {n} min a pie',
  '{name} stop: {stop}': 'Parada de la {name}: {stop}',
  'WHEN THEY RUN': 'CUÁNDO PASAN',
  'WHEN IT RUNS': 'CUÁNDO PASA',
  'Mon–Fri': 'Lun–Vie',
  'Sat & holidays': 'Sáb y feriados',
  Sunday: 'Domingo',
  'No service': 'No hay servicio',
  'Both lines, both directions. Hours are the City of Hialeah’s.':
    'Las dos rutas, en los dos sentidos. El horario es el de la Ciudad de Hialeah.',
  'Questions:': 'Preguntas:',
  'WHERE IS MY BUS?': '¿DÓNDE VIENE MI GUAGUA?',
  'Hialeah tracks its buses live in the free ETA SPOT app. Open it, pick “Hialeah Transit System”, then your line.':
    'Hialeah sigue sus guaguas en vivo en la app gratis ETA SPOT. Ábrela, escoge “Hialeah Transit System” y después tu ruta.',
  'ETA SPOT · iPhone': 'ETA SPOT · iPhone',
  'ETA SPOT · Android': 'ETA SPOT · Android',
  'Free WiFi on board': 'WiFi gratis a bordo',
  'Bike rack on every bus': 'Portabicicletas en cada guagua',
  'Wheelchair accessible': 'Accesible en silla de ruedas',
  'No open food or drinks': 'Nada de comida ni bebida abierta',
  'Headphones for anything with sound': 'Audífonos para cualquier cosa con sonido',
  'Drivers don’t take tips': 'Los choferes no aceptan propina',
  'MORE FREE WAYS AROUND': 'MÁS FORMAS DE MOVERTE GRATIS',
  'Hialeah & Miami Lakes': 'Hialeah y Miami Lakes',
  'Free on-demand electric rides. Book one in the Freebee app — Miami Lakes runs it instead of a bus line.':
    'Viajes eléctricos gratis cuando los pidas. Resérvalo en la app de Freebee; Miami Lakes lo usa en vez de una ruta de guagua.',
  'LITTLE HAVANA TROLLEY': 'TROLLEY DE LA PEQUEÑA HABANA',
  'City of Miami': 'Ciudad de Miami',
  'Free trolley through Little Havana to Brickell, seven days a week. Mon–Sat 6:30 AM–11 PM, Sun 8 AM–8 PM.':
    'Trolley gratis por la Pequeña Habana hasta Brickell, los siete días. Lun–Sáb 6:30 a. m.–11 p. m., Dom 8 a. m.–8 p. m.',
  'Track it live': 'Síguelo en vivo',
  'Routes & maps': 'Rutas y mapas',
  'Downtown & Brickell': 'Downtown y Brickell',
  'Miami-Dade’s free elevated train loops downtown, Brickell and Omni. The Little Havana trolley meets it at Brickell.':
    'El tren elevado gratis de Miami-Dade da la vuelta por Downtown, Brickell y Omni. El trolley de la Pequeña Habana lo conecta en Brickell.',
  'Stations & hours': 'Estaciones y horario',
  'Stops and ride times from Miami-Dade Transit’s schedule data (updated {date}); hours from the City of Hialeah. Buses run late sometimes — check the live tracker before you head out.':
    'Paradas y tiempos de viaje según los datos de horarios de Miami-Dade Transit (actualizados el {date}); horario de la Ciudad de Hialeah. A veces la guagua se atrasa: mírala en vivo antes de salir.',
  'RUNNING NOW · until {time}': 'PASANDO AHORA · hasta las {time}',
  'NOT OUT YET · starts at {time}': 'TODAVÍA NO SALE · empieza a las {time}',
  'DONE FOR TODAY · back tomorrow at {time}': 'TERMINÓ POR HOY · vuelve mañana a las {time}',
  'DONE FOR THE WEEKEND · back Monday at {time}': 'TERMINÓ EL FIN DE SEMANA · vuelve el lunes a las {time}',
  'NO SERVICE ON SUNDAYS · back tomorrow at {time}': 'LOS DOMINGOS NO PASA · vuelve mañana a las {time}',
  '← ALL FREE RIDES': '← TODAS LAS RUTAS GRATIS',
  '{name} free bus: every stop, Hialeah': 'Guagua gratis {name}: todas las paradas, Hialeah',
  'Every stop on Hialeah’s free {name} line, {from} to {to}, with ride times and the spots near each stop.':
    'Todas las paradas de la ruta gratis {name} de Hialeah, de {from} a {to}, con tiempos de viaje y los lugares cerca de cada parada.',
  '{n} min end to end': '{n} min de punta a punta',
  'EVERY STOP': 'TODAS LAS PARADAS',
  'It runs both ways. Minutes are ride time from {from}. Tap “more stops” to see every corner in between.':
    'Pasa en los dos sentidos. Los minutos son el tiempo de viaje desde {from}. Toca “paradas más” para ver cada esquina en el medio.',
  'Stops on the {name} line': 'Paradas de la ruta {name}',
  '1 more stop': '1 parada más',
  '{n} more stops': '{n} paradas más',
  START: 'SALIDA',
  ', {n} minutes from the start': ', a {n} minutos de la salida',
  'TRANSFER · {line}': 'CONEXIÓN · {line}',
  'See where the bus is right now in the free ETA SPOT app: pick “Hialeah Transit System”, then your line.':
    'Mira dónde viene la guagua ahora mismo en la app gratis ETA SPOT: escoge “Hialeah Transit System” y después tu ruta.',
  'TRACK IT LIVE': 'SÍGUELA EN VIVO',
  'TRACK IT LIVE ↗': 'SÍGUELA EN VIVO ↗',
  'SPOTS ON THIS LINE': 'LUGARES EN ESTA RUTA',
  'THE OTHER FREE LINE': 'LA OTRA RUTA GRATIS',
  'GET HERE FREE': 'LLEGA GRATIS',
  '{name} BUS': 'GUAGUA {name}',
  'to the stop at': 'hasta la parada de',
  'SEE THE ROUTE →': 'VER LA RUTA →',
  'Also: the {name}, {n} min walk to {stop}': 'También: la {name}, a {n} min a pie de {stop}',
  'Always free. Walk time is approximate.': 'Siempre gratis. El tiempo caminando es aproximado.',
  'Hours and every free ride →': 'Horario y todas las rutas gratis →',
  'Free, on-demand electric rides around Miami Lakes. Book one in the Freebee app.':
    'Viajes eléctricos gratis por Miami Lakes, cuando los pidas. Resérvalo en la app de Freebee.',
  'Free, on-demand electric rides around Hialeah. Book one in the Freebee app.':
    'Viajes eléctricos gratis por Hialeah, cuando los pidas. Resérvalo en la app de Freebee.',
  'Or call': 'O llama al',
  'Every free way around →': 'Todas las formas de moverte gratis →',
  'Two free bus lines cross Hialeah. See where they stop →': 'Dos rutas de guagua gratis cruzan Hialeah. Mira dónde paran →',
  'Getting around Miami Lakes for free →': 'Cómo moverte gratis por Miami Lakes →',
  'Flamingo County spots': 'Lugares de Flamingo County',
  'from the stop at {stop}': 'desde la parada de {stop}',
  'Map of Hialeah with the Flamingo and Marlin free bus lines': 'Mapa de Hialeah con las rutas de guagua gratis Flamingo y Marlin',
  'ILLUSTRATION · NOT LIVE': 'ILUSTRACIÓN · NO EN VIVO',
  'BUSES PARKED': 'GUAGUAS GUARDADAS',
  'Buses move to show how often they come, not where they are right now. Tap a dot to open the spot.':
    'Las guaguas se mueven para mostrar cada cuánto pasan, no dónde están ahora mismo. Toca un punto para abrir el lugar.',
  'WHERE ARE YOU?': '¿DÓNDE ESTÁS?',
  'Find your nearest free stop, how to walk there, and the spots you can ride to from it.':
    'Encuentra tu parada gratis más cercana, cómo llegar caminando y los lugares a los que puedes ir desde ahí.',
  'USE MY LOCATION': 'USAR MI UBICACIÓN',
  'FINDING YOU…': 'BUSCÁNDOTE…',
  'An address or a stop, like 1201 W 44th Pl or Palm Ave': 'Una dirección o una parada, como 1201 W 44th Pl o Palm Ave',
  FIND: 'BUSCAR',
  'STOPS THAT MATCH': 'PARADAS QUE COINCIDEN',
  'Your location stays on your phone. A typed address is looked up with the US Census Bureau’s free address service.':
    'Tu ubicación se queda en tu teléfono. Una dirección escrita se busca con el servicio gratis de direcciones de la Oficina del Censo de EE. UU.',
  'Location is turned off for this site. Type an address or a stop instead.':
    'La ubicación está apagada para este sitio. Escribe una dirección o una parada.',
  'We couldn’t get your location. Try again, or type an address or a stop.':
    'No pudimos encontrar tu ubicación. Prueba otra vez, o escribe una dirección o una parada.',
  'Type a street address with its number, like 1201 W 44th Pl — or pick a stop from the list.':
    'Escribe una dirección con su número, como 1201 W 44th Pl, o escoge una parada de la lista.',
  'We couldn’t find that address in Hialeah. Try adding the ZIP code, or type a street to pick a stop.':
    'No encontramos esa dirección en Hialeah. Prueba con el código postal, o escribe una calle para escoger una parada.',
  'Showing free rides near': 'Rutas gratis cerca de',
  'your location': 'tu ubicación',
  Clear: 'Borrar',
  'WALKING DIRECTIONS ↗': 'CÓMO LLEGAR A PIE ↗',
  'SEE IT ON THE LINE': 'VERLA EN LA RUTA',
  'RIDE TO': 'DE AHÍ PUEDES IR A',
  '~{n} min ride': '~{n} min en guagua',
  'That’s a long walk. Freebee gives free rides around Hialeah.':
    'Es una caminata larga. Freebee da viajes gratis por Hialeah.',
  'No free bus stop within a half-hour walk of there.': 'No hay parada de guagua gratis a menos de media hora caminando de ahí.',
  'Freebee runs free on-demand rides around Hialeah and Miami Lakes — book one in the app.':
    'Freebee da viajes gratis cuando los pidas por Hialeah y Miami Lakes; resérvalo en la app.',
  'Walking directions to the stop ↗': 'Cómo llegar caminando a la parada ↗',

  // --- Metadata ----------------------------------------------------------
  'A directory of the restaurants and bars the locals actually vouch for.':
    'Un directorio de los restaurantes y bares que la gente de aquí de verdad respalda.',
}
