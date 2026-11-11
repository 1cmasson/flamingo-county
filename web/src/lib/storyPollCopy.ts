import type { Lang } from '../i18n'
import { WHATSAPP_NUMBER } from './site'

/**
 * The words on the weekly story vote (lib/storyPolls.ts). The title,
 * question, intro and the stories themselves are the poll's own
 * (collections/StoryPolls.ts). Spanish quotes are « ».
 */
export type StoryPollCopy = typeof EN

export function storyPollCopy(lang: Lang): StoryPollCopy {
  return lang === 'es' ? ES : EN
}

/**
 * The opt-in's secondary link: WhatsApp opens on a chat with our number and
 * the message already written, and the visitor sends it themselves.
 */
export function pollOptinWhatsApp(lang: Lang): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(storyPollCopy(lang).optinMessage)}`
}

const EN = {
  kicker: 'YOU PICK THE STORY',
  crumbs: 'Breadcrumb',
  home: 'Home',
  stories: 'Stories',
  preview: (live: boolean): string =>
    live
      ? 'PREVIEW of the latest saved version. Votes and suggestions here are tests.'
      : 'PREVIEW: not published, only you can see this. Votes and suggestions here are tests.',
  closes: (when: string) => `Voting closes ${when}.`,
  opens: (when: string) => `Voting opens ${when}.`,
  closed: (when: string) => `Voting closed ${when}.`,
  postsOn: (day: string) => `The winning story is posted ${day}.`,
  tapOne: 'Tap the story you want to hear. One vote per person.',
  voteFor: (n: number, title: string) => `Vote for ${n}: ${title}`,
  sending: 'One moment…',
  voted: 'Your vote is in. Thank you!',
  alreadyVoted: 'You already voted in this one. Here’s how it’s going.',
  yourPick: 'Your pick',
  winner: 'Winner',
  noVotes: 'No votes were cast.',
  total: (n: number) => (n === 1 ? '1 vote so far' : `${n.toLocaleString('en-US')} votes so far`),
  finalTotal: (n: number) => (n === 1 ? '1 vote in all' : `${n.toLocaleString('en-US')} votes in all`),
  busy: 'Too many votes from this connection today. Try again tomorrow.',
  closedNow: 'Voting has closed.',
  failed: 'That didn’t go through. Try again.',
  optinTitle: 'Want to vote every week?',
  optinText: 'Leave your WhatsApp and we’ll let you know when the new vote opens and who won.',
  optinPhone: 'Your WhatsApp number',
  optinConsent: 'I agree to get one message a week from Flamingo County on WhatsApp. Reply STOP to opt out.',
  optinButton: 'Notify me',
  optinDone: 'Done! We’ll message you on WhatsApp 🦩',
  optinBadPhone: 'Check the number. If it’s not a US number, start with + and the country code.',
  optinNeedConsent: 'Tick the box so we can message you.',
  optinLink: 'or message us on WhatsApp',
  optinMessage: 'I want to vote every week 🦩',
  readStory: 'Read the story',
  igVote: 'You can also vote in the Instagram comments',
  igSee: 'See the reel on Instagram',
  suggestTitle: 'What story should we tell next?',
  suggestLabel: 'Tell us a Miami story you want to hear',
  suggestPlaceholder: 'e.g. how the Orange Bowl began',
  suggestSend: 'SEND',
  suggestNote: 'Just the story, in a few words. We read every one.',
  suggestMissing: 'Write the story you want to hear.',
  suggestInvalid: 'Just a few words about the story, please: no links, phone numbers or prices.',
  suggestBusy: 'That’s plenty from this connection today. Come back tomorrow.',
  suggested: 'Got it. Thank you!',
  suggestAnother: 'Suggest another',
  fair: 'How we count',
  fairText:
    'One vote per person. We add the votes on this page to the ones in our Instagram comments, and the most votes wins; a tie goes to the story listed first. We don’t store who voted: no name, no IP address.',
}

const ES: StoryPollCopy = {
  kicker: 'TÚ ESCOGES LA HISTORIA',
  crumbs: 'Ruta de navegación',
  home: 'Inicio',
  stories: 'Historias',
  preview: (live: boolean): string =>
    live
      ? 'VISTA PREVIA de la última versión guardada. Los votos y sugerencias aquí son de prueba.'
      : 'VISTA PREVIA: no está publicada, solo tú la ves. Los votos y sugerencias aquí son de prueba.',
  closes: (when: string) => `La votación cierra el ${when}.`,
  opens: (when: string) => `La votación abre el ${when}.`,
  closed: (when: string) => `La votación cerró el ${when}.`,
  postsOn: (day: string) => `La historia ganadora sale el ${day}.`,
  tapOne: 'Toca la historia que quieres oír. Un voto por persona.',
  voteFor: (n: number, title: string) => `Votar por la ${n}: ${title}`,
  sending: 'Un momento…',
  voted: '¡Tu voto ya cuenta! Gracias.',
  alreadyVoted: 'Ya votaste en esta. Así va la cosa.',
  yourPick: 'Tu voto',
  winner: 'Ganadora',
  noVotes: 'No hubo votos.',
  total: (n: number) => (n === 1 ? '1 voto hasta ahora' : `${n.toLocaleString('es-US')} votos hasta ahora`),
  finalTotal: (n: number) => (n === 1 ? '1 voto en total' : `${n.toLocaleString('es-US')} votos en total`),
  busy: 'Demasiados votos desde esta conexión hoy. Prueba mañana.',
  closedNow: 'La votación ya cerró.',
  failed: 'No se pudo enviar. Prueba otra vez.',
  optinTitle: '¿Quieres votar cada semana?',
  optinText: 'Déjanos tu WhatsApp y te avisamos cuando salga la nueva votación y quién ganó.',
  optinPhone: 'Tu número de WhatsApp',
  optinConsent: 'Acepto recibir un mensaje a la semana de Flamingo County por WhatsApp. Escribe BAJA para salirme.',
  optinButton: 'Avísame',
  optinDone: '¡Listo! Te avisamos por WhatsApp 🦩',
  optinBadPhone: 'Revisa el número. Si no es de EE. UU., empieza con + y el código del país.',
  optinNeedConsent: 'Marca la casilla para que podamos escribirte.',
  optinLink: 'o escríbenos por WhatsApp',
  optinMessage: 'Quiero votar cada semana 🦩',
  readStory: 'Lee la historia',
  igVote: 'También puedes votar en los comentarios de Instagram',
  igSee: 'Mira el reel en Instagram',
  suggestTitle: '¿Qué historia contamos después?',
  suggestLabel: 'Dinos una historia de Miami que quieres oír',
  suggestPlaceholder: 'Ej.: cómo empezó el Orange Bowl',
  suggestSend: 'ENVIAR',
  suggestNote: 'Solo la historia, en pocas palabras. Las leemos todas.',
  suggestMissing: 'Escribe la historia que quieres oír.',
  suggestInvalid: 'Solo unas palabras sobre la historia, por favor: sin enlaces, teléfonos ni precios.',
  suggestBusy: 'Ya es bastante desde esta conexión hoy. Vuelve mañana.',
  suggested: 'Anotado. ¡Gracias!',
  suggestAnother: 'Sugerir otra',
  fair: 'Cómo contamos',
  fairText:
    'Un voto por persona. Sumamos los votos de esta página a los de los comentarios en Instagram, y gana la que más tenga; si hay empate, gana la que aparece primero. No guardamos quién votó: ni nombre, ni dirección IP.',
}
