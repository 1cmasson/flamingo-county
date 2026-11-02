import type { Lang } from '../i18n'
import type { Stage } from './rankings'

/**
 * The words on a neighbors' ranking page (lib/rankings.ts). The question,
 * title and places are the ranking's own (collections/Rankings.ts).
 */
export type RankingCopy = typeof EN

export function rankingCopy(lang: Lang): RankingCopy {
  return lang === 'es' ? ES : EN
}

/**
 * "Sun, Nov 8, 11:59 PM" / "dom 8 nov, 11:59 p. m." in Miami time. A day-only
 * field (`withTime` false) is read in UTC, like promoCopy's `dayLabel`: it is
 * stored as that day at noon or midnight UTC, and Miami time would make
 * midnight the day before.
 */
export function whenLabel(iso: string, lang: Lang, withTime = true): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
    timeZone: withTime ? 'America/New_York' : 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  })
    .format(new Date(iso))
    .replace(/\./g, '')
}

const EN = {
  kicker: (city: string) => `${city.toUpperCase()} DECIDES`,
  crumbs: 'Breadcrumb',
  home: 'Home',
  stage: { qf: 'Quarterfinals', sf: 'Semifinals', final: 'The final' } satisfies Record<Stage, string>,
  how: 'How it works',
  steps: (city: string) => [
    'You name your place right here on this page.',
    `The 8 most-named places go head to head here, round by round. You vote once per matchup per day.`,
    `${city} picks the winner. Every vote is counted and shown.`,
  ],
  nominating: 'Nominations are open',
  nominate: 'Nominate on Instagram',
  nominatingUntil: (day: string) => `Nominations are open through ${day}.`,
  preview: (live: boolean): string =>
    live
      ? 'PREVIEW of the latest saved version. Votes and nominations here are tests.'
      : 'PREVIEW: not published, only you can see this. Votes and nominations here are tests.',
  votingOpens: (day: string) => `Voting opens here ${day}.`,
  nominateTitle: 'Name your place',
  nameLabel: 'Which place?',
  namePlaceholder: 'The place’s name',
  areaLabel: 'Where? (optional)',
  areaPlaceholder: 'A street or corner',
  nominateHere: 'NOMINATE',
  nominateNote: 'Just the name of the place. The 8 most-named go to the vote.',
  nameMissing: 'Write the name of the place.',
  nameInvalid: 'Just the place’s name, please: no links or phone numbers.',
  nominateBusy: 'That’s plenty from this connection today. Come back tomorrow.',
  nominateClosed: 'Nominations have closed.',
  nominated: (name: string) => `Got it: ${name}. Thank you!`,
  nominationCount: (n: number) => (n === 1 ? '1 nomination so far.' : `${n.toLocaleString('en-US')} nominations so far.`),
  nominateAnother: 'Name another place',
  contenders: 'The contenders',
  nominations: (n: number) => (n === 1 ? '1 nomination' : `${n} nominations`),
  voteFor: (name: string) => `Vote for ${name}`,
  votes: (n: number) => (n === 1 ? '1 vote' : `${n.toLocaleString('en-US')} votes`),
  closes: (when: string) => `Voting closes ${when}.`,
  opens: (when: string) => `Next round opens ${when}.`,
  tbd: 'To be decided',
  voted: 'Your vote is in. Come back tomorrow to vote again.',
  sending: 'One moment…',
  busy: 'Too many votes from this connection today. Try tomorrow.',
  closed: 'This round has closed.',
  failed: 'That didn’t go through. Try again.',
  winner: 'Winner',
  results: 'The results',
  resultsAnswer: (title: string, city: string, winner: string, votes: number) =>
    `${winner} won the “${title}” vote, with ${votes.toLocaleString('en-US')} votes from ${city} neighbors on Flamingo County.`,
  totalVotes: (n: number) => `${n.toLocaleString('en-US')} votes in all.`,
  seePlace: 'See the place',
  source: 'Source',
  fair: 'How we keep it fair',
  fairText:
    'The order comes from votes only. Businesses can’t pay to move up, and partners get no extra votes. We don’t store who voted: no name, no IP address.',
}

const ES: RankingCopy = {
  kicker: (city: string) => `${city.toUpperCase()} DECIDE`,
  crumbs: 'Ruta de navegación',
  home: 'Inicio',
  stage: { qf: 'Cuartos de final', sf: 'Semifinales', final: 'La final' },
  how: 'Cómo funciona',
  steps: (city: string) => [
    'Tú nombras tu lugar aquí mismo, en esta página.',
    'Los 8 lugares más nombrados se enfrentan aquí, ronda por ronda. Votas una vez por pareja cada día.',
    `${city} escoge al ganador. Cada voto se cuenta y se muestra.`,
  ],
  nominating: 'Las nominaciones están abiertas',
  nominate: 'Nominar en Instagram',
  nominatingUntil: (day: string) => `Las nominaciones están abiertas hasta el ${day}.`,
  preview: (live: boolean): string =>
    live
      ? 'VISTA PREVIA de la última versión guardada. Los votos y nominaciones aquí son de prueba.'
      : 'VISTA PREVIA: no está publicada, solo tú la ves. Los votos y nominaciones aquí son de prueba.',
  votingOpens: (day: string) => `La votación abre aquí el ${day}.`,
  nominateTitle: 'Nomina tu lugar',
  nameLabel: '¿Qué lugar?',
  namePlaceholder: 'El nombre del lugar',
  areaLabel: '¿Dónde? (opcional)',
  areaPlaceholder: 'Una calle o una esquina',
  nominateHere: 'NOMINAR',
  nominateNote: 'Solo el nombre del lugar. Los 8 más nombrados pasan a la votación.',
  nameMissing: 'Escribe el nombre del lugar.',
  nameInvalid: 'Solo el nombre del lugar, por favor: sin enlaces ni teléfonos.',
  nominateBusy: 'Ya es bastante desde esta conexión hoy. Vuelve mañana.',
  nominateClosed: 'Las nominaciones ya cerraron.',
  nominated: (name: string) => `Anotado: ${name}. ¡Gracias!`,
  nominationCount: (n: number) => (n === 1 ? '1 nominación hasta ahora.' : `${n.toLocaleString('es-US')} nominaciones hasta ahora.`),
  nominateAnother: 'Nominar otro lugar',
  contenders: 'Los candidatos',
  nominations: (n: number) => (n === 1 ? '1 nominación' : `${n} nominaciones`),
  voteFor: (name: string) => `Votar por ${name}`,
  votes: (n: number) => (n === 1 ? '1 voto' : `${n.toLocaleString('es-US')} votos`),
  closes: (when: string) => `La votación cierra el ${when}.`,
  opens: (when: string) => `La próxima ronda abre el ${when}.`,
  tbd: 'Por decidir',
  voted: 'Tu voto ya cuenta. Vuelve mañana para votar otra vez.',
  sending: 'Un momento…',
  busy: 'Demasiados votos desde esta conexión hoy. Prueba mañana.',
  closed: 'Esta ronda ya cerró.',
  failed: 'No se pudo enviar. Prueba otra vez.',
  winner: 'Ganador',
  results: 'Los resultados',
  resultsAnswer: (title: string, city: string, winner: string, votes: number) =>
    `${winner} ganó la votación «${title}», con ${votes.toLocaleString('es-US')} votos de vecinos de ${city} en Flamingo County.`,
  totalVotes: (n: number) => `${n.toLocaleString('es-US')} votos en total.`,
  seePlace: 'Ver el lugar',
  source: 'Fuente',
  fair: 'Cómo lo mantenemos justo',
  fairText:
    'El orden sale solo de los votos. Ningún negocio puede pagar para subir, y los aliados no reciben votos extra. No guardamos quién votó: ni nombre, ni dirección IP.',
}
