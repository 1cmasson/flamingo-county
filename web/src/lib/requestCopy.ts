import type { Lang } from '../i18n'
import type { RequestKind } from './requestKinds'

/** One choice card on the hub, and what its form says. */
export type KindCopy = {
  title: string
  blurb: string
  /** Who it's for, as a short line under the blurb. */
  forWho: string
  heading: string
  submit: string
  sentH: string
  sentP: string
}

export type RequestCopy = {
  step1: string
  step2: string
  pickHint: string
  another: string
  error: string
  kinds: Record<RequestKind, KindCopy>
  /** Field labels and placeholders, keyed by what the form calls them. */
  f: Record<string, string>
}

/**
 * The request hub's copy, both languages side by side so they can't drift.
 * The listing labels reuse the old form's wording ("ficha", "TELÉFONO O
 * CORREO") so a returning owner sees the same words.
 */
export function requestCopy(lang: Lang): RequestCopy {
  return lang === 'es' ? ES : EN
}

const EN: RequestCopy = {
  step1: '1 · WHAT DO YOU WANT TO DO?',
  step2: '2 · TELL US',
  pickHint: 'Pick one above. Each one takes about a minute.',
  another: 'SEND ANOTHER',
  error: 'FILL IN THE FIELDS MARKED *',
  kinds: {
    listing: {
      title: 'ADD MY BUSINESS',
      blurb: 'Get your spot on your city page, with a full story page we write for you.',
      forWho: 'Restaurants, bars, shops and services',
      heading: 'ADD YOUR BUSINESS',
      submit: 'CLAIM YOUR LISTING',
      sentH: 'GOT IT — WE’LL BE IN TOUCH.',
      sentP: 'We’ll call or write within a couple of days to set up the photos and the interview.',
    },
    event: {
      title: 'ADD AN EVENT',
      blurb: 'Put it on the events board so the neighborhood knows it’s happening.',
      forWho: 'Shows, markets, classes, openings, fundraisers',
      heading: 'ADD YOUR EVENT',
      submit: 'SEND THE EVENT',
      sentH: 'GOT IT — WE’LL TAKE A LOOK.',
      sentP: 'We check every event before it goes up. If we need a flyer or a detail, we’ll write to you.',
    },
    interview: {
      title: 'GET INTERVIEWED',
      blurb: 'Sit down with us and tell your story. We do the writing and the photos.',
      forWho: 'Owners, chefs, artists, organizers',
      heading: 'ASK FOR AN INTERVIEW',
      submit: 'ASK FOR AN INTERVIEW',
      sentH: 'GOT IT — LET’S TALK.',
      sentP: 'We’ll reach out within a few days to find a time that works for you.',
    },
    story: {
      title: 'PITCH A STORY',
      blurb: 'Know a place, a person or a bit of history we should write about? Tip us off.',
      forWho: 'Anyone with a good tip',
      heading: 'PITCH A STORY',
      submit: 'SEND THE TIP',
      sentH: 'THANKS FOR THE TIP.',
      sentP: 'We read every pitch. If we run with it, we’ll let you know first.',
    },
  },
  f: {
    businessName: 'BUSINESS NAME',
    phBusiness: 'El Gallo Cantina',
    yourName: 'YOUR NAME',
    phName: 'Your name',
    city: 'CITY',
    category: 'CATEGORY',
    contact: 'PHONE OR EMAIL',
    phContact: '(305) 000-0000',
    listingStory: 'TELL US THE STORY (WE WRITE THE PAGE FOR YOU)',
    phListingStory: 'Opened in 1994 by my abuela…',
    eventName: 'EVENT NAME',
    phEventName: 'Domino night at the park',
    when: 'WHEN',
    phWhen: 'Sat, Oct 18 · 7 PM — or “every Friday”',
    where: 'WHERE',
    phWhere: 'Place or address',
    eventLink: 'LINK TO THE FLYER, TICKETS OR INSTAGRAM',
    phLink: 'https://',
    eventDetails: 'WHAT’S HAPPENING?',
    phEventDetails: 'Free, all ages, bring a chair…',
    whatYouDo: 'YOUR BUSINESS OR WHAT YOU DO',
    phWhatYouDo: 'Bakery owner, muralist, youth coach…',
    talkAbout: 'WHAT WOULD YOU TALK ABOUT?',
    phTalkAbout: 'How we kept the shop open through…',
    profileLink: 'INSTAGRAM OR WEBSITE',
    storyLine: 'THE STORY IN ONE LINE',
    phStoryLine: 'The guarapo stand my whole block swears by',
    storyMore: 'TELL US MORE',
    phStoryMore: 'Who, where, and why it matters…',
    storyWhere: 'WHERE OR WHO',
    phStoryWhere: 'A place, a person, a corner',
    sourceLink: 'A LINK, IF YOU HAVE ONE',
  },
}

const ES: RequestCopy = {
  step1: '1 · ¿QUÉ QUIERES HACER?',
  step2: '2 · CUÉNTANOS',
  pickHint: 'Escoge una opción arriba. Cada una toma como un minuto.',
  another: 'ENVIAR OTRA',
  error: 'LLENA LOS CAMPOS MARCADOS CON *',
  kinds: {
    listing: {
      title: 'AGREGAR MI NEGOCIO',
      blurb: 'Tu ficha en la página de tu ciudad, con una página de historia que escribimos nosotros.',
      forWho: 'Restaurantes, bares, tiendas y servicios',
      heading: 'AGREGA TU NEGOCIO',
      submit: 'RECLAMA TU FICHA',
      sentH: '¡RECIBIDO! TE ESCRIBIMOS.',
      sentP: 'Te llamamos o te escribimos en un par de días para hacerte las fotos y la entrevista.',
    },
    event: {
      title: 'AGREGAR UN EVENTO',
      blurb: 'Ponlo en la cartelera para que el barrio sepa que va a pasar.',
      forWho: 'Shows, mercaditos, clases, aperturas, colectas',
      heading: 'AGREGA TU EVENTO',
      submit: 'ENVIAR EL EVENTO',
      sentH: '¡RECIBIDO! LO REVISAMOS.',
      sentP: 'Revisamos cada evento antes de publicarlo. Si nos falta el flyer o algún detalle, te escribimos.',
    },
    interview: {
      title: 'PEDIR UNA ENTREVISTA',
      blurb: 'Siéntate con nosotros y cuéntanos tu historia. Nosotros escribimos y hacemos las fotos.',
      forWho: 'Dueños, chefs, artistas, organizadores',
      heading: 'PIDE UNA ENTREVISTA',
      submit: 'PEDIR LA ENTREVISTA',
      sentH: '¡RECIBIDO! HABLEMOS.',
      sentP: 'Te contactamos en unos días para cuadrar una hora que te convenga.',
    },
    story: {
      title: 'PROPONER UNA HISTORIA',
      blurb: '¿Conoces un lugar, una persona o un pedazo de historia del que deberíamos escribir? Avísanos.',
      forWho: 'Cualquiera con un buen dato',
      heading: 'PROPÓN UNA HISTORIA',
      submit: 'ENVIAR EL DATO',
      sentH: 'GRACIAS POR EL DATO.',
      sentP: 'Leemos cada propuesta. Si la publicamos, te avisamos primero.',
    },
  },
  f: {
    businessName: 'NOMBRE DEL NEGOCIO',
    phBusiness: 'El Gallo Cantina',
    yourName: 'TU NOMBRE',
    phName: 'Tu nombre',
    city: 'CIUDAD',
    category: 'CATEGORÍA',
    contact: 'TELÉFONO O CORREO',
    phContact: '(305) 000-0000',
    listingStory: 'CUÉNTANOS LA HISTORIA (LA PÁGINA LA ESCRIBIMOS NOSOTROS)',
    phListingStory: 'Lo abrió mi abuela en 1994…',
    eventName: 'NOMBRE DEL EVENTO',
    phEventName: 'Noche de dominó en el parque',
    when: 'CUÁNDO',
    phWhen: 'Sáb 18 de oct · 7 PM — o “todos los viernes”',
    where: 'DÓNDE',
    phWhere: 'Lugar o dirección',
    eventLink: 'ENLACE AL FLYER, LAS ENTRADAS O INSTAGRAM',
    phLink: 'https://',
    eventDetails: '¿DE QUÉ SE TRATA?',
    phEventDetails: 'Gratis, para toda la familia, trae tu silla…',
    whatYouDo: 'TU NEGOCIO O A QUÉ TE DEDICAS',
    phWhatYouDo: 'Dueña de panadería, muralista, entrenador…',
    talkAbout: '¿DE QUÉ HABLARÍAS?',
    phTalkAbout: 'Cómo mantuvimos el negocio abierto cuando…',
    profileLink: 'INSTAGRAM O PÁGINA WEB',
    storyLine: 'LA HISTORIA EN UNA LÍNEA',
    phStoryLine: 'El puesto de guarapo que todo mi barrio adora',
    storyMore: 'CUÉNTANOS MÁS',
    phStoryMore: 'Quién, dónde y por qué importa…',
    storyWhere: 'DÓNDE O QUIÉN',
    phStoryWhere: 'Un lugar, una persona, una esquina',
    sourceLink: 'UN ENLACE, SI TIENES UNO',
  },
}
