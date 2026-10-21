import type { Lang } from '../i18n'
import { parseISO } from './dates'

/**
 * The words on the coupon pages (lib/promos.ts): the promotion, a visitor's
 * coupon with the staff's redeem form, and a partner's dashboard. The offer
 * itself is the promotion's own (collections/Promotions.ts).
 */
export type PromoCopy = typeof EN

export function promoCopy(lang: Lang): PromoCopy {
  return lang === 'es' ? ES : EN
}

/** "Oct 31" / "31 oct". */
export function dayLabel(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
    .format(parseISO(iso))
    .replace('.', '')
}

const EN = {
  kicker: 'FLAMINGO COUNTY COUPON',
  at: (name: string) => `at ${name}`,
  through: (day: string) => `Good through ${day}`,
  from: (day: string) => `Starts ${day}`,
  free: 'Free, and no sign-up.',
  get: 'Get my coupon',
  getting: 'One moment…',
  haveOne: 'You already have a coupon for this.',
  open: 'Open my coupon',
  steps: (name: string) => [`Tap the button to get your own coupon.`, `Show it at ${name}.`, `Staff mark it used on your phone. Done.`],
  stepsTitle: 'How it works',
  upcoming: (day: string) => `This coupon opens on ${day}. Come back then.`,
  ended: 'This promotion has ended.',
  full: 'All the coupons for this promotion are taken.',
  soon: 'Coupons for this promotion open soon.',
  busy: 'Too many tries. Wait a minute and try again.',
  failed: 'That didn’t work. Try again.',
  seeBusiness: (name: string) => `See ${name} on Flamingo County`,
  // The coupon
  yours: 'Your coupon',
  show: (name: string) => `Show this screen to the staff at ${name}.`,
  saveWa: 'Save it to WhatsApp',
  saveWaNote: 'Sends this coupon’s link to Flamingo County on WhatsApp, so it stays in your chats.',
  webviewNote: 'Inside Instagram and Facebook this page is easy to lose. Save it to WhatsApp first.',
  waText: (name: string, code: string, url: string) => `My Flamingo County coupon for ${name}: ${code}\n${url}`,
  used: 'USED',
  usedAt: (when: string) => `Used ${when}`,
  expired: 'This coupon has expired.',
  staff: 'Staff: mark as used',
  pinLabel: 'Business PIN',
  confirm: 'Mark as used',
  cancel: 'Cancel',
  wrongPin: (n: number) => `Wrong PIN. ${n} ${n === 1 ? 'try' : 'tries'} left.`,
  locked: 'Locked after too many wrong PINs. Ask Flamingo County to unlock it.',
  notReady: 'This business can’t mark coupons yet. Ask Flamingo County.',
  done: 'Done! Coupon used',
  // The partner dashboard
  dashTitle: 'Coupons',
  dashPrivate: 'This page is private: anyone with this link can see it. Keep it to yourselves.',
  taken: 'Taken',
  usedCount: 'Used',
  today: 'Used today',
  week: 'Used this week',
  promotions: 'Your promotions',
  none: 'No promotions yet.',
  state: {
    active: 'Running',
    upcoming: 'Not started',
    ended: 'Ended',
    full: 'All taken',
  } as Record<'active' | 'upcoming' | 'ended' | 'full', string>,
  sources: 'Where they came from',
  recent: 'Last used',
  noneUsed: 'No coupons used yet.',
  howTitle: 'How staff mark a coupon',
  how: [
    'The customer shows their coupon on their phone.',
    'Tap “Staff: mark as used” (in Spanish: «Personal: marcar como usado»).',
    'Type your 4-digit PIN. The coupon turns green and can’t be used again.',
  ],
  pinHelp: 'Forgot the PIN, or think someone else knows it? Write to us on WhatsApp and we’ll change it.',
  source: (s: string) => SOURCE_EN[s] ?? s,
}

const SOURCE_EN: Record<string, string> = {
  direct: 'Direct or a shared link',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  google: 'Google',
  bio: 'Our link in bio',
  site: 'Their page on Flamingo County',
  qr: 'QR code',
  card: 'Our business card',
  flyer: 'Flyer',
}

const ES: PromoCopy = {
  kicker: 'CUPÓN FLAMINGO COUNTY',
  at: (name) => `en ${name}`,
  through: (day) => `Válido hasta el ${day}`,
  from: (day) => `Empieza el ${day}`,
  free: 'Gratis y sin registrarte.',
  get: 'Quiero mi cupón',
  getting: 'Un momento…',
  haveOne: 'Ya tienes un cupón para esto.',
  open: 'Abrir mi cupón',
  steps: (name) => ['Toca el botón y te damos tu propio cupón.', `Enséñalo en ${name}.`, 'El personal lo marca como usado en tu teléfono. Listo.'],
  stepsTitle: 'Cómo funciona',
  upcoming: (day) => `Este cupón abre el ${day}. Vuelve ese día.`,
  ended: 'Esta promoción ya terminó.',
  full: 'Ya se acabaron los cupones de esta promoción.',
  soon: 'Los cupones de esta promoción abren pronto.',
  busy: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
  failed: 'No funcionó. Vuelve a intentarlo.',
  seeBusiness: (name) => `Ver ${name} en Flamingo County`,
  yours: 'Tu cupón',
  show: (name) => `Enséñale esta pantalla al personal de ${name}.`,
  saveWa: 'Guárdalo en WhatsApp',
  saveWaNote: 'Manda el enlace de este cupón a Flamingo County por WhatsApp, y así se queda en tus chats.',
  webviewNote: 'Dentro de Instagram y Facebook esta página se pierde fácil. Guárdala primero en WhatsApp.',
  waText: (name, code, url) => `Mi cupón de Flamingo County para ${name}: ${code}\n${url}`,
  used: 'USADO',
  usedAt: (when) => `Usado el ${when}`,
  expired: 'Este cupón ya venció.',
  staff: 'Personal: marcar como usado',
  pinLabel: 'PIN del negocio',
  confirm: 'Marcar como usado',
  cancel: 'Cancelar',
  wrongPin: (n) => `PIN incorrecto. ${n === 1 ? 'Queda 1 intento' : `Quedan ${n} intentos`}.`,
  locked: 'Bloqueado por demasiados PIN incorrectos. Pídele a Flamingo County que lo desbloquee.',
  notReady: 'Este negocio todavía no puede marcar cupones. Pregúntale a Flamingo County.',
  done: '¡Listo! Cupón usado',
  dashTitle: 'Cupones',
  dashPrivate: 'Esta página es privada: cualquiera con este enlace la puede ver. No la compartas.',
  taken: 'Tomados',
  usedCount: 'Usados',
  today: 'Usados hoy',
  week: 'Usados esta semana',
  promotions: 'Sus promociones',
  none: 'Todavía no hay promociones.',
  state: {
    active: 'Activa',
    upcoming: 'Sin empezar',
    ended: 'Terminada',
    full: 'Agotada',
  },
  sources: 'De dónde vinieron',
  recent: 'Últimos usados',
  noneUsed: 'Todavía no se ha usado ningún cupón.',
  howTitle: 'Cómo marca el personal un cupón',
  how: [
    'El cliente enseña su cupón en su teléfono.',
    'Toquen «Personal: marcar como usado».',
    'Escriban su PIN de 4 dígitos. El cupón se pone verde y ya no se puede volver a usar.',
  ],
  pinHelp: '¿Se les olvidó el PIN, o creen que alguien más lo sabe? Escríbannos por WhatsApp y lo cambiamos.',
  source: (s) => SOURCE_ES[s] ?? s,
}

const SOURCE_ES: Record<string, string> = {
  direct: 'Directo o un enlace compartido',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  google: 'Google',
  bio: 'Nuestro enlace en la bio',
  site: 'Su página en Flamingo County',
  qr: 'Código QR',
  card: 'Nuestra tarjeta',
  flyer: 'Volante',
}
