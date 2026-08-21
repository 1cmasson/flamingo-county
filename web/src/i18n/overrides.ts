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
  'ALL LISTINGS IN': 'TODO LO QUE HAY EN',
  'NOTHING MATCHED THAT SEARCH.': 'NO HAY NADA CON ESA BÚSQUEDA.',
  'Search this city…': 'Busca en esta ciudad…',

  // --- A city with no listings yet ---------------------------------------
  'COMING SOON': 'MUY PRONTO',
  "We're still walking these blocks. Know a spot that belongs here?":
    'Todavía estamos caminando estas cuadras. ¿Conoces un lugar que deba estar aquí?',

  // --- Events board ------------------------------------------------------
  'NOTHING ON THE BOARD YET.': 'TODAVÍA NO HAY NADA EN LA PIZARRA.',
  'THIS WEEK': 'ESTA SEMANA',
  'AROUND HERE.': 'POR AQUÍ.',
  "THE ONES WE'D CANCEL PLANS FOR": 'POR LOS QUE CANCELAMOS TODO',

  // --- Ticker ------------------------------------------------------------
  'NOW ON THE LISTING': 'AHORA EN EL DIRECTORIO',
  'LOCAL SPOTS': 'NEGOCIOS DE AQUÍ',

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
