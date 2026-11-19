import type { Lang } from '../i18n'
import type { SeasonCardTheme } from './seasons'

/**
 * Food guides: one page per guide (/es/lechon, /en/lechon), a short list of
 * places to get one dish for one occasion, written for a phone.
 *
 * Unlike a seasonal guide (lib/seasons.ts), which lists events from the CMS,
 * a food guide's places are written here: a guide is a piece of writing with
 * an order and a voice, and most of its places are not in the directory. A
 * place that IS in the directory names its listing's slug, and the page links
 * its listing (looked up per request, so an unpublished listing just isn't
 * linked).
 *
 * Adding a guide:
 *   1. add its entry to GUIDES;
 *   2. add `app/(frontend)/[lang]/<path>/page.tsx`, a copy of the lechón one
 *      with the key changed. A static folder is needed because `[city]` owns
 *      every other one-segment path.
 * The sitemap and llms.txt read GUIDES, so nothing else changes.
 *
 * Rules every guide keeps (tests/int/guides.int.spec.ts holds them):
 * - no prices anywhere (README: the site makes no price claims);
 * - a fact we could not confirm is said to be unconfirmed, never guessed:
 *   every place carries what to ask before counting on it;
 * - never Google Maps: directions are Apple Maps on an Apple device and our
 *   own trip planner everywhere else (components/DirectionsLink).
 *
 * This file is light on purpose (no Payload, no renderer), like seasons.ts.
 */

export type GuideKey = 'lechon'

type Copy = Record<Lang, string>

/** What a place is good for. A visitor narrows the list by these (`?f=`). */
export type GuideFilter = 'cooked' | 'delivery' | 'whole'
export const GUIDE_FILTERS: GuideFilter[] = ['cooked', 'delivery', 'whole']

export type GuideSpot = {
  /** The anchor on the page (#las-vinas) and the place's key in tests. */
  key: string
  name: string
  /** The directory listing's slug, when the place is one of ours. */
  listing?: string
  /** One or more street addresses, as the place's own listing gives them. */
  addresses: string[]
  /** A bonus place sits after the numbered list, unnumbered. */
  bonus?: boolean
  filters: GuideFilter[]
  /** Two short chips: what it's known for, and the catch. */
  tags: Record<Lang, [string, string]>
  /** What the place is known for, in two or three sentences. No prices, no hours we didn't confirm. */
  note: Copy
  /** What to ask when you call: the holiday facts we could not confirm. */
  ask: Copy
}

export type Guide = {
  key: GuideKey
  /** The page's path segment: /<lang>/<path>. Route slugs stay English in both languages. */
  path: string
  /** The directory city the guide is about, for the breadcrumb. */
  city: { slug: string; name: string }
  kicker: Copy
  title: Copy
  /** The <title> and og:title, with the search terms. Under 60 characters. */
  metaTitle: Copy
  /** The snippet under the title in search results. Under 155 characters. */
  description: Copy
  /** The occasion's chip: "Thanksgiving · Thursday, Nov 26". */
  when: Copy
  /** The one line under the title: what's on the page and what to do. The first screen on a phone is the title, this, the filters and the first place. */
  hook: Copy
  /** "Call first" in one line, above the list; the full box with the questions sits below it. */
  callShort: Copy
  /** The longer intro, printed below the list. */
  intro: Copy[]
  /** The question the page answers, as people search it, and its short answer. */
  question: Copy
  answer: Copy
  /** The "call first" box: why, and the questions to ask. */
  callTitle: Copy
  callWhy: Copy
  callAsk: Copy[]
  spots: GuideSpot[]
  tipsTitle: Copy
  tips: { lead: Copy; text: Copy }[]
  /**
   * The guide's share card (og:image), drawn by lib/eventCard.tsx in a season
   * palette, like a seasonal guide's: `/api/og/guide/<key>`. Short copy, since
   * it is read at link-preview size.
   */
  card: {
    theme: SeasonCardTheme
    /** The mascot in the arch, by city slug (src/assets/og/mascots). */
    mascot: string
    city: { slug: string; name: string }
    title: Copy
    chip: Copy
    /** On the ticket: the occasion's day. */
    ticket: Copy
    line: Copy
    /**
     * A scene behind the link-preview card, under src/assets/og/ (JPEG: Satori
     * reads no WebP). Generated for the site (photo style, not a real photo),
     * so it carries no credit. The text sits on a dark fade at the left, so
     * the picture keeps its subject on the right.
     */
    scene?: string
  }
  /** The day the places were last checked, YYYY-MM-DD. Printed at the foot and in the structured data. */
  checkedOn: string
  footer: Copy
}

const LECHON: Guide = {
  key: 'lechon',
  path: 'lechon',
  city: { slug: 'hialeah', name: 'Hialeah' },
  kicker: { en: 'THANKSGIVING GUIDE', es: 'GUÍA DE THANKSGIVING' },
  title: {
    en: 'Where to get lechón in Hialeah',
    es: 'Dónde comprar lechón en Hialeah',
  },
  metaTitle: {
    en: 'Lechón in Hialeah for Thanksgiving: where to order',
    es: 'Lechón en Hialeah para Thanksgiving: dónde encargarlo',
  },
  description: {
    en: 'Where to order lechón, pernil or a whole pig for the caja china in Hialeah this Thanksgiving: 8 places plus one in Doral, and what to ask when you call.',
    es: 'Dónde encargar lechón, pernil o un puerco entero para la caja china en Hialeah este Thanksgiving: 8 lugares y uno en Doral, y qué preguntar al llamar.',
  },
  when: { en: 'Thanksgiving · Thursday, Nov 26', es: 'Thanksgiving · jueves 26 de noviembre' },
  hook: {
    en: '8 spots for lechón, pernil or a whole pig, plus one in Doral. Tap one for directions.',
    es: '8 lugares para lechón, pernil o puerco entero, y uno en Doral. Toca uno y llega.',
  },
  callShort: {
    en: 'Holiday hours aren’t posted yet. Call before you go.',
    es: 'Aún no han publicado horario de fiestas. Llama antes de ir.',
  },
  intro: [
    {
      en: 'In Hialeah, Thanksgiving has a second star on the table, and it has crispy skin. Whether your familia goes full puerco asado or does turkey and pernil side by side, the move is the same: order early, pick up Wednesday if you can, and let somebody else deal with the caja china this year.',
      es: 'En Hialeah, Thanksgiving tiene una segunda estrella en la mesa, y tiene el pellejito crujiente. Ya sea que tu familia vaya con puerco asado completo o ponga pavo y pernil lado a lado, la jugada es la misma: encarga temprano, recoge el miércoles si puedes y que otro se encargue de la caja china este año.',
    },
    {
      en: 'Here are our favorite spots in Hialeah, plus one just across the line, for lechón by the pound, by the tray, or whole. ¡Buen provecho!',
      es: 'Estos son nuestros lugares favoritos en Hialeah, y uno más justo pasando la línea, para comprar lechón por libra, por bandeja o entero. ¡Buen provecho!',
    },
  ],
  question: {
    en: 'Where can I get lechón in Hialeah for Thanksgiving?',
    es: '¿Dónde comprar lechón en Hialeah para Thanksgiving?',
  },
  answer: {
    en: 'Las Viñas Barbeque, Mesa’s BBQ, Molina’s Ranch, Puerquito Asado, Puerquito Relleno, Maruchi and Sedano’s all sell roast pork in Hialeah, and Matadero Cabrera sells whole pigs for the caja china. None had posted 2026 Thanksgiving hours or preorder deadlines when we checked on November 19, so call ahead.',
    es: 'Las Viñas Barbeque, Mesa’s BBQ, Molina’s Ranch, Puerquito Asado, Puerquito Relleno, Maruchi y Sedano’s venden puerco asado en Hialeah, y Matadero Cabrera vende puercos enteros para la caja china. Ninguno había publicado su horario de Thanksgiving 2026 ni la fecha límite para encargar cuando revisamos el 19 de noviembre, así que llama antes.',
  },
  card: {
    // Hialeah pink with the orange ticket: the page hero's pink, and orange reads as roast pork and Thanksgiving.
    theme: 'pumpkin',
    mascot: 'hialeah',
    city: { slug: 'hialeah', name: 'HIALEAH' },
    title: { es: 'LECHÓN EN HIALEAH', en: 'LECHÓN IN HIALEAH' },
    chip: { es: 'GUÍA DE THANKSGIVING', en: 'THANKSGIVING GUIDE' },
    ticket: { es: 'JUE 26 NOV', en: 'THU NOV 26' },
    line: {
      es: '8 lugares para encargar, y uno en Doral · llama antes',
      en: '8 places to order from, plus one in Doral · call ahead',
    },
    // Photo-style, generated: a Hialeah backyard at dusk under string lights,
    // the lechón on banana leaves on a wooden table at the right, maduros,
    // moros and yuca beside it, palms and stucco roofs behind.
    scene: 'guides/lechon-scene.jpg',
  },
  callTitle: { en: 'Llama antes', es: 'Llama antes' },
  callWhy: {
    en: 'None of these spots had posted 2026 holiday hours or preorder deadlines when we checked on November 19. Call ahead and ask:',
    es: 'Ninguno de estos lugares había publicado su horario de fiestas 2026 ni la fecha límite para encargar cuando revisamos el 19 de noviembre. Llama antes y pregunta:',
  },
  callAsk: [
    {
      en: 'Do you take Thanksgiving preorders, and what’s the last day?',
      es: '¿Aceptan encargos para Thanksgiving y cuál es el último día?',
    },
    {
      en: 'Are you open Thursday, or is pickup Wednesday only?',
      es: '¿Abren el jueves o solo se recoge el miércoles?',
    },
    {
      en: 'How do you sell it (by the pound, the tray, half or whole) and how many does it feed?',
      es: '¿Cómo lo venden (por libra, por bandeja, medio o entero) y para cuántos alcanza?',
    },
  ],
  spots: [
    {
      key: 'las-vinas',
      name: 'Las Viñas Barbeque',
      addresses: ['3935 E 4th Ave, Hialeah, FL 33013'],
      filters: ['cooked', 'whole'],
      tags: { en: ['Whole hog, any cut', 'Sells out'], es: ['Puerco entero, el corte que quieras', 'Se acaba'] },
      note: {
        en: 'The classic. They roast the whole hog and you can ask for whatever cut you want, from pierna to the crispy barrigada, plus chicharrón chopped to order. The catch: when it’s gone, it’s gone.',
        es: 'El clásico. Asan el puerco entero y puedes pedir el corte que quieras, de la pierna a la barrigada crujiente, y chicharrón picado al momento. El detalle: cuando se acaba, se acabó.',
      },
      ask: {
        en: 'Preorders, tray sizes and Thanksgiving hours: call to confirm.',
        es: 'Encargos, tamaños de bandeja y horario de Thanksgiving: llama para confirmar.',
      },
    },
    {
      key: 'mesas-bbq',
      name: 'Mesa’s BBQ',
      addresses: ['1125 W 29th St, Hialeah, FL 33012'],
      filters: ['cooked'],
      tags: { en: ['Puerco con mojo', 'Go early'], es: ['Puerco con mojo', 'Ve temprano'] },
      note: {
        en: 'A longtime Hialeah spot for puerco asado con mojo, tamales and yuca. Regulars know to show up early because they tend to sell out by the end of the day, and that goes double on a holiday week.',
        es: 'Un clásico de Hialeah para puerco asado con mojo, tamales y yuca. Los de siempre saben que hay que llegar temprano porque suele acabarse antes de que termine el día, y en semana de fiestas, más.',
      },
      ask: {
        en: 'Preorders and Thanksgiving hours: call to confirm.',
        es: 'Encargos y horario de Thanksgiving: llama para confirmar.',
      },
    },
    {
      key: 'molinas-ranch',
      name: 'Molina’s Ranch Restaurant',
      listing: 'molinas-ranch',
      addresses: ['4090 E 8th Ave, Hialeah, FL 33013'],
      filters: ['cooked'],
      tags: { en: ['Lechón + all the sides', 'Deli counter'], es: ['Lechón con todo', 'Mostrador de deli'] },
      note: {
        en: 'Slow-roasted lechón with that citrusy mojo and real crunch on the skin, plus a deli counter and all the sides you need: moros, maduros, yuca. A solid pick if you want the whole plate handled.',
        es: 'Lechón asado despacio con mojo de cítricos y el pellejo bien crujiente, más un mostrador de deli y todos los acompañantes: moros, maduros, yuca. Buena opción si quieres el plato completo resuelto.',
      },
      ask: {
        en: 'Holiday trays and Thanksgiving hours: call to confirm.',
        es: 'Bandejas de fiestas y horario de Thanksgiving: llama para confirmar.',
      },
    },
    {
      key: 'puerquito-asado',
      name: 'Puerquito Asado',
      addresses: ['8248 W 8th Ave, Hialeah, FL 33014'],
      filters: ['cooked', 'delivery', 'whole'],
      tags: { en: ['Roast & stuffed pig', 'Delivery'], es: ['Puerco asado y relleno', 'Entrega a domicilio'] },
      note: {
        en: 'A Cuban catering kitchen built around one thing: roast pork and stuffed pig. They do takeout and delivery, which is a lifesaver when the house is full.',
        es: 'Una cocina cubana de catering que gira alrededor de una cosa: puerco asado y puerco relleno. Tienen para llevar y entrega a domicilio, una salvación cuando la casa está llena.',
      },
      ask: {
        en: 'Thanksgiving preorders, deadline and sizes: call to confirm.',
        es: 'Encargos para Thanksgiving, fecha límite y tamaños: llama para confirmar.',
      },
    },
    {
      key: 'puerquito-relleno',
      name: 'Puerquito Relleno',
      addresses: ['2750 W 68th St, Suite 133, Hialeah, FL 33016'],
      filters: ['cooked', 'delivery'],
      tags: { en: ['Stuffed pork', 'Delivery'], es: ['Puerco relleno', 'Entrega a domicilio'] },
      note: {
        en: 'Stuffed roast pork with the full Cuban spread on the side: moros, frijoles negros, yuca and plátanos. Takeout and delivery. Their regular Sunday hours are short, so don’t assume holiday hours.',
        es: 'Puerco asado relleno con todo el acompañamiento cubano: moros, frijoles negros, yuca y plátanos. Para llevar y a domicilio. Su horario de domingo ya es corto, así que no des por hecho el de fiestas.',
      },
      ask: {
        en: 'Thanksgiving preorders and hours: call to confirm.',
        es: 'Encargos y horario de Thanksgiving: llama para confirmar.',
      },
    },
    {
      key: 'maruchi',
      name: 'Maruchi Restaurant',
      addresses: ['92 E 8th St, Hialeah, FL 33010'],
      filters: ['cooked'],
      tags: { en: ['Pernil', 'Smaller tables'], es: ['Pernil', 'Mesas pequeñas'] },
      note: {
        en: 'Counter-order Cuban cooking that tastes like abuela made it, with pernil on the menu and a deli for take-home. Good for a smaller table that wants pernil plus a couple of sides.',
        es: 'Comida cubana de mostrador que sabe a la de abuela, con pernil en el menú y un deli para llevar. Buena para una mesa pequeña que quiere pernil y un par de acompañantes.',
      },
      ask: {
        en: 'Holiday trays and Thanksgiving hours: call to confirm.',
        es: 'Bandejas de fiestas y horario de Thanksgiving: llama para confirmar.',
      },
    },
    {
      key: 'sedanos',
      name: 'Sedano’s Supermarkets',
      addresses: [
        '1170 W 49th St, Hialeah, FL 33012',
        '1690 W 68th St, Hialeah, FL 33014',
        '950 E 4th Ave, Hialeah, FL 33010',
        '4040 E 4th Ave, Hialeah, FL 33013',
      ],
      filters: ['cooked'],
      tags: { en: ['One-stop run', '4 Hialeah stores'], es: ['Todo en un viaje', '4 tiendas en Hialeah'] },
      note: {
        en: 'The one-stop option. In past years Sedano’s included roast pork among its Thanksgiving meal specials at select stores, ordered in person, first come, first served.',
        es: 'La opción de un solo viaje. En años anteriores Sedano’s incluyó puerco asado entre sus especiales de Thanksgiving en algunas tiendas, encargado en persona y por orden de llegada.',
      },
      ask: {
        en: 'This year’s menu, which stores carry it, and the cutoff: call to confirm.',
        es: 'El menú de este año, qué tiendas lo tienen y hasta cuándo se encarga: llama para confirmar.',
      },
    },
    {
      key: 'matadero-cabrera',
      name: 'Matadero Cabrera',
      addresses: ['16301 NW 122nd Ave, Hialeah, FL 33018'],
      filters: ['whole'],
      tags: { en: ['Whole pig, raw', 'For the caja china'], es: ['Puerco entero, crudo', 'Para la caja china'] },
      note: {
        en: 'Roasting it yourself? This is where a lot of Hialeah families get a whole pig, sold by weight, ready for the caja china. Expect lines on holiday weeks.',
        es: '¿Lo vas a asar tú? Aquí es donde muchas familias de Hialeah compran el puerco entero, por peso, listo para la caja china. Espera colas en semana de fiestas.',
      },
      ask: {
        en: 'Whether they take reservations for Thanksgiving pickup, and their holiday hours: call to confirm.',
        es: 'Si apartan puercos para recoger en Thanksgiving y su horario de fiestas: llama para confirmar.',
      },
    },
    {
      key: 'la-esquina-del-lechon',
      name: 'La Esquina del Lechón',
      bonus: true,
      addresses: ['8601 NW 58th St, Suite 101, Doral, FL 33166'],
      filters: ['cooked', 'whole'],
      tags: { en: ['Just past the line, Doral', 'Caters'], es: ['Pasando la línea, en Doral', 'Hace catering'] },
      note: {
        en: 'Not technically Hialeah, but worth the short drive. They roast whole lechón in a caja china every Wednesday through Saturday, and they cater. Thanksgiving falls on a Thursday, so ask about holiday hours.',
        es: 'No es Hialeah, pero vale el viajecito. Asan lechón entero en caja china de miércoles a sábado, y hacen catering. Thanksgiving cae jueves, así que pregunta por el horario de fiestas.',
      },
      ask: {
        en: 'Holiday hours and catering trays: call to confirm.',
        es: 'Horario de fiestas y bandejas de catering: llama para confirmar.',
      },
    },
  ],
  tipsTitle: { en: 'Before you order', es: 'Antes de encargar' },
  tips: [
    {
      lead: { en: 'Call this weekend, not Wednesday.', es: 'Llama este fin de semana, no el miércoles.' },
      text: {
        en: 'Small lechoneras sell out on holiday weeks, and many only cook what’s been ordered.',
        es: 'Las lechoneras chiquitas se quedan sin nada en semana de fiestas, y muchas solo cocinan lo que se encargó.',
      },
    },
    {
      lead: { en: 'Know your headcount.', es: 'Sabe cuántos son.' },
      text: {
        en: 'Ask how many people a tray or a half pig feeds before you commit.',
        es: 'Pregunta para cuántas personas alcanza una bandeja o medio puerco antes de decidir.',
      },
    },
    {
      lead: { en: 'Sides count too.', es: 'Los acompañantes también cuentan.' },
      text: {
        en: 'Moros, yuca con mojo and maduros go fast. Order them with the pork.',
        es: 'Los moros, la yuca con mojo y los maduros vuelan. Encárgalos con el puerco.',
      },
    },
    {
      lead: { en: 'Plan the pickup.', es: 'Planea la recogida.' },
      text: {
        en: 'Wednesday pickup and a quick reheat in the oven keeps Thursday stress-free. Leave the skin uncovered so it stays crispy.',
        es: 'Recoger el miércoles y darle un calentón en el horno te deja el jueves tranquilo. Deja el pellejo destapado para que siga crujiente.',
      },
    },
  ],
  checkedOn: '2026-11-19',
  footer: {
    en: 'Holiday schedules change every year, so confirm with each spot before you count on it. Know a spot we missed? Tell us @flamingo.county.',
    es: 'Los horarios de fiestas cambian cada año, así que confirma con cada lugar antes de contar con él. ¿Conoces un lugar que se nos escapó? Dínoslo en @flamingo.county.',
  },
}

export const GUIDES: Record<GuideKey, Guide> = { lechon: LECHON }

export function getGuide(key: string): Guide | null {
  return Object.hasOwn(GUIDES, key) ? (GUIDES as Record<string, Guide>)[key] : null
}

export function allGuides(): Guide[] {
  return Object.values(GUIDES)
}

export function isGuideFilter(v: string | undefined | null): v is GuideFilter {
  return (GUIDE_FILTERS as string[]).includes(v ?? '')
}

/** The places a filter keeps, in the guide's order. No filter (or an unknown one) keeps them all. */
export function filterSpots(guide: Guide, filter: string | undefined | null): GuideSpot[] {
  return isGuideFilter(filter) ? guide.spots.filter((s) => s.filters.includes(filter)) : guide.spots
}

/**
 * Directions to one of a place's addresses: Apple Maps on an Apple device and
 * our trip planner (`plan`, a path without the language) everywhere else, as
 * an event's directions are (lib/eventVenue.ts). The destination is the name
 * with the address, so the map lands on the place itself.
 */
export function spotDirections(name: string, address: string): { plan: string; apple: string } {
  const destination = `${name}, ${address}`
  return {
    plan: `/bus/trip?${new URLSearchParams({ to: destination })}`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`,
  }
}

/** The words around a guide's places, the same for every guide. */
export function guideCopy(lang: Lang) {
  return lang === 'es' ? ES : EN
}

const EN = {
  home: 'Home',
  crumbs: 'Breadcrumb',
  filterLabel: 'Show',
  filters: { all: 'All spots', cooked: 'Cooked & ready', delivery: 'Delivery', whole: 'Whole pig' } satisfies Record<
    GuideFilter | 'all',
    string
  >,
  count: (n: number) => (n === 1 ? '1 spot' : `${n} spots`),
  none: 'No spot in this guide matches that. Try another filter.',
  bonus: 'Bonus',
  directions: 'GET DIRECTIONS ↗',
  listing: 'See it in the directory →',
  checked: (day: string) => `Checked ${day}.`,
  whatToAsk: 'What to ask ↓',
  more: 'Why we like it',
  about: 'About this guide',
}

const ES: typeof EN = {
  home: 'Inicio',
  crumbs: 'Ruta de navegación',
  filterLabel: 'Ver',
  filters: { all: 'Todos', cooked: 'Ya cocinado', delivery: 'A domicilio', whole: 'Puerco entero' },
  count: (n: number) => (n === 1 ? '1 lugar' : `${n} lugares`),
  none: 'Ningún lugar de esta guía coincide. Prueba otro filtro.',
  bonus: 'Extra',
  directions: 'CÓMO LLEGAR ↗',
  listing: 'Míralo en el directorio →',
  checked: (day: string) => `Revisado el ${day}.`,
  whatToAsk: 'Qué preguntar ↓',
  more: 'Por qué nos gusta',
  about: 'Sobre esta guía',
}

/** "November 19, 2026" / "19 de noviembre de 2026", read as a calendar day (no time zone shift). */
export function checkedLabel(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${iso}T12:00:00Z`))
}
