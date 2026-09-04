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
  'MEMBER SPOTLIGHTS EVERY FRIDAY': 'SOCIOS EN CANDELA TODOS LOS VIERNES',

  // --- Home hero and CTAs ------------------------------------------------
  'EVERY SPOT THE LOCALS VOUCH FOR.': 'CADA LUGAR QUE LA GENTE DE AQUÍ RESPALDA.',
  'EAT, DRINK & KNOW': 'COME, BEBE Y CONOCE',
  'YOUR NEIGHBORS.': 'A TU GENTE.',
  'Restaurants and bars, vouched for by the neighborhoods that eat and drink in them. Pick a city up top to meet its crew.':
    'Restaurantes y bares, respaldados por los barrios que comen y beben en ellos. Escoge una ciudad arriba y conoce a su pandilla.',
  'EVERY CITY': 'TODAS LAS CIUDADES',
  'OWN A SPOT AROUND HERE?': '¿TIENES UN NEGOCIO POR AQUÍ?',

  // --- Metadata ----------------------------------------------------------
  'A directory of the restaurants and bars the locals actually vouch for.':
    'Un directorio de los restaurantes y bares que la gente de aquí de verdad respalda.',
}
