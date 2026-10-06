import type { Lang } from '../i18n'

/**
 * The business card page's copy. Everything factual on that page — what the
 * site is, the cities, the listing count — comes from the CMS or the database; this is only the page's own voice. `{n}` is a count.
 */
export type CardCopy = typeof EN

export function cardCopy(lang: Lang): CardCopy {
  return lang === 'es' ? ES : EN
}

const EN = {
  title: 'Nice to meet you',
  description:
    'You just met Flamingo County. Get interviewed, send a birthday shoutout, ride the free buses and find the spots your neighbors vouch for.',
  tagline: 'THE SPOTS YOUR NEIGHBORS VOUCH FOR',
  founder: 'FOUNDER',
  tap: 'TAP THE CARD',
  tapBack: 'TAP TO FLIP BACK',
  hello: 'NICE TO MEET YOU.',
  intro: 'You just met Flamingo County. Here’s what we can do together.',
  doH: 'WHAT CAN WE DO FOR YOU?',
  interviewH: 'GET INTERVIEWED',
  interviewP:
    'Got a story — a business, a craft, a corner of the neighborhood? Sit down with us. We write it and take the photos.',
  shoutoutH: 'BIRTHDAY SHOUTOUT',
  shoutoutP: 'Someone turning a year older? We’ll celebrate them across the city on our socials.',
  start: 'START',
  ridesH: 'RIDE FREE',
  ridesP: 'Hialeah’s free Flamingo and Marlin bus lines: the routes, the stops and when the next one comes.',
  spotsH: 'CHECK OUT THE SPOTS',
  spotsP: '{n} local spots the neighborhood vouches for.',
  whatH: 'WHAT IS FLAMINGO COUNTY?',
  citiesH: 'PICK YOUR CITY',
  citySpots: '{n} SPOTS',
  soon: 'COMING SOON',
  followH: 'FOLLOW THE FLOCK',
  followP: 'New spots, events and birthday shoutouts.',
  saveContact: 'SAVE CONTACT',
}

const ES: CardCopy = {
  title: 'Mucho gusto',
  description:
    'Acabas de conocer Flamingo County. Pide una entrevista, manda una felicitación de cumpleaños, monta las guaguas gratis y encuentra los lugares que tus vecinos respaldan.',
  tagline: 'LOS LUGARES QUE TUS VECINOS RESPALDAN',
  founder: 'FUNDADOR',
  tap: 'TOCA LA TARJETA',
  tapBack: 'TOCA PARA VOLVER',
  hello: 'MUCHO GUSTO.',
  intro: 'Acabas de conocer Flamingo County. Mira lo que podemos hacer juntos.',
  doH: '¿QUÉ HACEMOS POR TI?',
  interviewH: 'TE ENTREVISTAMOS',
  interviewP:
    '¿Tienes una historia — un negocio, un oficio, una esquina del barrio? Siéntate con nosotros. Nosotros la escribimos y hacemos las fotos.',
  shoutoutH: 'FELICITACIÓN DE CUMPLEAÑOS',
  shoutoutP: '¿Alguien cumple años? Lo celebramos por toda la ciudad en nuestras redes.',
  start: 'EMPEZAR',
  ridesH: 'MONTA GRATIS',
  ridesP: 'Las guaguas gratis de Hialeah, rutas Flamingo y Marlin: el recorrido, las paradas y cuándo viene la próxima.',
  spotsH: 'MIRA LOS LUGARES',
  spotsP: '{n} lugares de aquí que el barrio respalda.',
  whatH: '¿QUÉ ES FLAMINGO COUNTY?',
  citiesH: 'ESCOGE TU CIUDAD',
  citySpots: '{n} LUGARES',
  soon: 'MUY PRONTO',
  followH: 'SIGUE A LA BANDADA',
  followP: 'Lugares nuevos, eventos y felicitaciones de cumpleaños.',
  saveContact: 'GUARDAR CONTACTO',
}
