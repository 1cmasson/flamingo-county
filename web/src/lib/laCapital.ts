import type { Lang } from '../i18n'
import { busCopy } from './busCopy'
import { serverNetwork } from './busNetwork'
import { absUrl } from './site'
import { hubDestQuery, tripBuses, tripLinkPath } from './tripLink'
import { planTrips, WALK_ONLY_MIN } from './tripPlan'
import { meters, type LatLng } from './transitMath'
import type { Button, Out } from './whatsapp'

/**
 * La Capital Medical Center's WhatsApp line, run by Flamingo County: a fixed
 * set of screens with tap buttons, no model writing to anyone.
 *
 *   menu ─ Visit ──── place → when → time of day → travel ─(bus)→ location → consent → done
 *        ├ Call me ── place → time of day → consent → done
 *        └ Get there  place → location → bus answer → after
 *
 * What it does: takes a visit or a call-back request, says how to get there
 * by bus from a shared location (lib/tripPlan.ts, the site's own planner),
 * and, once the person says yes to their name and number going to the clinic,
 * hands the lead to a person on Telegram. What it never does: ask about their
 * health, their insurance or Medicare, or promise rides or meals (those are
 * the clinic's to talk about, in private). Anything it can't place goes to a
 * person after two tries.
 *
 * `turn` is pure: the lead's state and what they sent in, the next state and
 * what to send out. The webhook (lib/whatsappInbound.ts) saves and delivers.
 */

export const FLOW = 'la-capital'
type Both = Record<Lang, string>

export const CLINIC = {
  name: 'La Capital Medical Center',
  /** The clinic's public number, from lacapitalmedicalcenter.com (read 2026-11-18). */
  phone: '(305) 901-1191',
}

/** Coordinates from the US Census geocoder, 2026-11-19. */
export const PLACES = {
  calle8: {
    title: { es: 'Calle 8 · Miami', en: 'Calle 8 · Miami' },
    name: { es: 'La Capital (Calle 8)', en: 'La Capital (Calle 8)' },
    address: '5351 SW 8th St, Miami, FL 33134',
    at: [25.763814, -80.282495] as LatLng,
  },
  hialeah: {
    title: { es: 'Hialeah', en: 'Hialeah' },
    name: { es: 'La Capital (Hialeah)', en: 'La Capital (Hialeah)' },
    address: '1550 W 84th St, Hialeah, FL 33014',
    at: [25.898494, -80.315208] as LatLng,
  },
} satisfies Record<string, { title: Both; name: Both; address: string; at: LatLng }>
export type PlaceKey = keyof typeof PLACES
const placeKeys = Object.keys(PLACES) as PlaceKey[]
const isPlace = (k: unknown): k is PlaceKey => typeof k === 'string' && k in PLACES

/* ----------------------------------------------------------------- state */

export type Step = 'menu' | 'place' | 'when' | 'tod' | 'travel' | 'pin' | 'consent' | 'after' | 'done' | 'handoff'
export type Intent = 'visit' | 'callback' | 'directions'

export type LeadState = {
  step: Step
  lang: Lang
  status: 'new' | 'asking' | 'handoff' | 'ready' | 'called' | 'visited' | 'no-show' | 'closed'
  intent: Intent | null
  place: string | null
  when: string | null
  timeOfDay: string | null
  travel: string | null
  misses: number
  whatsappName: string | null
}

export type Input = {
  /** The id of the button they tapped (ButtonPayload), if they tapped one. */
  button: string | null
  text: string
  /** A location they shared. Used for the bus answer, never stored. */
  location: LatLng | null
}

export type Turn = {
  set: Partial<LeadState> & { consentAt?: string; consentText?: string }
  outs: Out[]
  /** What to tell the owner on Telegram, if anything. */
  alert?: 'ready' | 'person' | 'message' | 'cancel'
}

/* ------------------------------------------------------------------ copy */

const t = (lang: Lang, b: Both) => b[lang]

const B = {
  visit: { es: 'Visitar la clínica', en: 'Visit the clinic' },
  call: { es: 'Que me llamen', en: 'Call me back' },
  dir: { es: 'Cómo llegar', en: 'How to get there' },
  any: { es: 'Cualquiera', en: 'Either one' },
  thisWeek: { es: 'Esta semana', en: 'This week' },
  nextWeek: { es: 'La próxima', en: 'Next week' },
  anyDay: { es: 'Cuando puedan', en: 'Whenever' },
  am: { es: 'Por la mañana', en: 'Morning' },
  pm: { es: 'Por la tarde', en: 'Afternoon' },
  anyTime: { es: 'A cualquier hora', en: 'Any time' },
  car: { es: 'En carro', en: 'By car' },
  bus: { es: 'En guagua', en: 'By bus' },
  ride: { es: 'Me llevan', en: 'Someone drives me' },
  skip: { es: 'Ahora no', en: 'Not now' },
  yes: { es: 'Sí, que me llamen', en: 'Yes, call me' },
  no: { es: 'No, gracias', en: 'No, thanks' },
  done: { es: 'Listo, gracias', en: 'All set, thanks' },
} satisfies Record<string, Both>

const LABEL: Record<string, Both> = {
  this: { es: 'esta semana', en: 'this week' },
  next: { es: 'la semana que viene', en: 'next week' },
  anyday: { es: 'cuando puedan', en: 'whenever they can' },
  am: { es: 'por la mañana', en: 'in the morning' },
  pm: { es: 'por la tarde', en: 'in the afternoon' },
  anytime: { es: 'a cualquier hora', en: 'any time' },
  car: { es: 'en carro', en: 'by car' },
  bus: { es: 'en guagua', en: 'by bus' },
  ride: { es: 'lo llevan', en: 'getting a ride' },
}
export const label = (key: string | null | undefined, lang: Lang) => (key && LABEL[key] ? LABEL[key][lang] : null)

const first = (name: string | null | undefined) => name?.trim().split(/\s+/)[0]?.slice(0, 30) || ''

const COPY = {
  hello: (lang: Lang, name: string | null, again: boolean) => {
    const n = first(name)
    return lang === 'en'
      ? [
          `${again ? 'Hi again' : 'Hi'}${n ? `, ${n}` : ''} 👋 This is Flamingo County, helping ${CLINIC.name} set up visits and calls.`,
          'Questions about your health or insurance are for the clinic’s team, in person.',
          '',
          'What can I help you with?',
        ].join('\n')
      : [
          `${again ? 'Hola de nuevo' : 'Hola'}${n ? `, ${n}` : ''} 👋 Somos Flamingo County y le ayudamos a ${CLINIC.name} con las visitas y las llamadas.`,
          'Las preguntas de salud o de seguros las contesta el equipo de la clínica, en persona.',
          '',
          '¿En qué te ayudo?',
        ].join('\n')
  },
  menuFoot: { es: 'Para hablar con una persona, escribe PERSONA. English? Reply EN', en: 'To talk to a person, type PERSON. ¿Español? Responde ES' },
  place: (lang: Lang, intent: Intent | null) =>
    [
      intent === 'callback'
        ? t(lang, { es: '¿De qué clínica quieres que te llamen?', en: 'Which clinic should call you?' })
        : t(lang, { es: '¿Cuál te queda mejor?', en: 'Which one is better for you?' }),
      '',
      ...placeKeys.map((k) => `📍 *${PLACES[k].title[lang]}*: ${PLACES[k].address}`),
    ].join('\n'),
  when: { es: '¿Cuándo te gustaría ir?', en: 'When would you like to go?' },
  tod: {
    visit: { es: '¿A qué hora del día te queda mejor?', en: 'What time of day works best?' },
    callback: { es: '¿A qué hora te llamamos?', en: 'When should they call you?' },
  },
  travel: { es: '¿Cómo piensas llegar?', en: 'How will you get there?' },
  pin: {
    es: 'Mándame tu ubicación y te digo qué guagua tomar 🚌\nToca 📎 (o +) → Ubicación → Enviar.\nSolo la usamos para buscar la ruta; no la guardamos.',
    en: 'Send me your location and I’ll tell you which bus to take 🚌\nTap 📎 (or +) → Location → Send.\nWe only use it to find the route; we don’t keep it.',
  },
  pinAgain: {
    es: 'No puedo buscar una dirección escrita. Toca 📎 (o +) → Ubicación para mandarla, o toca «Ahora no».',
    en: 'I can’t look up a typed address. Tap 📎 (or +) → Location to send it, or tap “Not now”.',
  },
  consent: (lang: Lang, s: LeadState) => {
    const where = isPlace(s.place) ? PLACES[s.place].title[lang] : t(lang, { es: 'cualquiera de las dos', en: 'either clinic' })
    const bits =
      s.intent === 'callback'
        ? [t(lang, { es: 'Llamada', en: 'Call back' }), where, label(s.timeOfDay, lang)]
        : [t(lang, { es: 'Visita', en: 'Visit' }), where, label(s.when, lang), label(s.timeOfDay, lang), label(s.travel, lang)]
    return [`📝 ${bits.filter(Boolean).join(' · ')}`, '', consentQuestion(lang)].join('\n')
  },
  ready: (lang: Lang, s: LeadState) => {
    const when = s.intent === 'callback' ? label(s.timeOfDay, lang) : null
    return lang === 'en'
      ? [
          `Done ✅ We passed it to ${CLINIC.name}. They’ll call this number${when ? ` ${when}` : ''} to set the day and time.`,
          `If you’d rather call them: ${CLINIC.phone}.`,
          'To cancel, type CANCEL.',
        ].join('\n')
      : [
          `Listo ✅ Se lo pasamos a ${CLINIC.name}. Te llaman a este número${when ? ` ${when}` : ''} para confirmar el día y la hora.`,
          `Si prefieres llamar tú: ${CLINIC.phone}.`,
          'Para cancelar, escribe CANCELAR.',
        ].join('\n')
  },
  declined: {
    es: 'Está bien, no le pasamos nada a nadie. Si cambias de idea, escribe MENÚ.',
    en: 'OK, we won’t pass anything on. If you change your mind, type MENU.',
  },
  cancelled: {
    es: 'Listo, lo cancelamos y le avisamos a la clínica. Si quieres empezar de nuevo, escribe MENÚ.',
    en: 'Done, it’s cancelled and we’ll let the clinic know. To start again, type MENU.',
  },
  after: { es: '¿Te ayudo con algo más?', en: 'Anything else?' },
  bye: { es: 'Con gusto 🙌 Si necesitas algo, escribe MENÚ.', en: 'Happy to help 🙌 If you need anything, type MENU.' },
  received: {
    es: 'Recibido 👍 Se lo pasamos al equipo. Para empezar de nuevo, escribe MENÚ.',
    en: 'Got it 👍 We’ll pass it to the team. To start again, type MENU.',
  },
  handoff: {
    es: 'Te paso con una persona del equipo; te escribe por aquí lo antes posible. Para volver a los botones, escribe MENÚ.',
    en: 'I’m passing you to a person on the team; they’ll write here as soon as they can. To go back to the buttons, type MENU.',
  },
  tapHint: { es: 'Toca uno de los botones 👇 (o responde con el número)', en: 'Tap one of the buttons 👇 (or reply with the number)' },
  tripTo: (lang: Lang, place: string) => (lang === 'en' ? `🚌 To get to ${place}:` : `🚌 Para llegar a ${place}:`),
  tripLink: { es: 'La ruta en el mapa, con las guaguas en vivo:', en: 'The route on the map, with live buses:' },
  hub: {
    es: 'Abre esto y te busca la ruta desde donde estés:',
    en: 'Open this and it finds the route from wherever you are:',
  },
}

/** The exact question the consent tap answers; saved with the lead. */
export function consentQuestion(lang: Lang): string {
  return lang === 'en'
    ? `Can we pass your name and this number to ${CLINIC.name} so they can call or text you to confirm? Only for this.`
    : `¿Le pasamos tu nombre y este número a ${CLINIC.name} para que te llamen o te escriban y confirmen? Solo para esto.`
}

/* --------------------------------------------------------------- screens */

const btn = (id: string, title: Both, lang: Lang): Button => ({ id: `lc:${id}`, title: title[lang] })

/** What a step shows, and the buttons it offers. */
export function screen(step: Step, s: LeadState): Out | null {
  const L = s.lang
  switch (step) {
    case 'menu':
      return {
        text: `${COPY.hello(L, s.whatsappName, s.status !== 'new')}\n\n${t(L, COPY.menuFoot)}`,
        buttons: [btn('visit', B.visit, L), btn('call', B.call, L), btn('dir', B.dir, L)],
      }
    case 'place':
      return {
        text: COPY.place(L, s.intent),
        buttons: [
          ...placeKeys.map((k) => btn(`p:${k}`, PLACES[k].title, L)),
          ...(s.intent === 'callback' ? [btn('p:any', B.any, L)] : []),
        ],
      }
    case 'when':
      return { text: t(L, COPY.when), buttons: [btn('w:this', B.thisWeek, L), btn('w:next', B.nextWeek, L), btn('w:anyday', B.anyDay, L)] }
    case 'tod':
      return {
        text: t(L, s.intent === 'callback' ? COPY.tod.callback : COPY.tod.visit),
        buttons: [btn('t:am', B.am, L), btn('t:pm', B.pm, L), btn('t:anytime', B.anyTime, L)],
      }
    case 'travel':
      return { text: t(L, COPY.travel), buttons: [btn('tr:car', B.car, L), btn('tr:bus', B.bus, L), btn('tr:ride', B.ride, L)] }
    case 'pin':
      return { text: t(L, COPY.pin), buttons: [btn('skip', B.skip, L)] }
    case 'consent':
      return { text: COPY.consent(L, s), buttons: [btn('yes', B.yes, L), btn('no', B.no, L)] }
    case 'after':
      return { text: t(L, COPY.after), buttons: [btn('visit', B.visit, L), btn('call', B.call, L), btn('done', B.done, L)] }
    default:
      return null
  }
}

/* -------------------------------------------------------- reading replies */

/** Lowercase, no accents, no punctuation at the ends. */
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^[\s.,!¡?¿*_~"'«»()-]+|[\s.,!¡?¿*_~"'«»()-]+$/g, '')
    .replace(/\s+/g, ' ')

/** Words that pick a button when typed instead of tapped. Whole words only. */
const WORDS: Record<string, RegExp> = {
  'lc:visit': /\b(visit\w*|ir|cita|appointment|conocer)\b/,
  'lc:call': /\b(llam\w*|call\w*|telefono|phone)\b/,
  'lc:dir': /\b(llegar|llego|direccion|address|guagua|bus|ruta|route|donde|where|get there)\b/,
  'lc:p:calle8': /\b(calle ?8|8 ?st\w*|8th|ocho|miami|pequena habana|little havana|coral way|flagler)\b/,
  'lc:p:hialeah': /\b(hialeah|84)\b/,
  'lc:p:any': /\b(cualquier\w*|either|any|igual|da igual)\b/,
  'lc:w:this': /\b(esta semana|this week|hoy|manana|today|tomorrow)\b/,
  'lc:w:next': /\b(proxima|que viene|next)\b/,
  'lc:w:anyday': /\b(cuando (sea|puedan)|whenever|any ?day|cualquier dia)\b/,
  'lc:t:am': /\b(manana|morning|am|temprano|early)\b/,
  'lc:t:pm': /\b(tarde|afternoon|pm|evening|noche)\b/,
  'lc:t:anytime': /\b(cualquier hora|any ?time|cuando sea)\b/,
  'lc:tr:car': /\b(carro|auto|car|maneja\w*|drive)\b/,
  'lc:tr:bus': /\b(guagua|bus|autobus|metro|trolley|omnibus)\b/,
  'lc:tr:ride': /\b(me llevan|me lleva|llevan|ride|uber|lyft|hij[oa]|familia|family)\b/,
  'lc:skip': /\b(ahora no|not now|no|despues|later|skip)\b/,
  'lc:yes': /^(si|sip|yes|ok|okay|dale|claro|de acuerdo|perfecto|si por favor|yes please|sure)\b/,
  'lc:no': /^(no|nope|no gracias|no thanks)\b/,
  'lc:done': /\b(listo|gracias|thanks|thank you|nada mas|that'?s all|eso es todo)\b/,
}

/**
 * The button a reply picks on the screen they're on: the tap itself, a number
 * ("2"), or words that clearly match one button and no other. null when it's
 * not clear: the caller may ask Jev (lib/jev.ts), then counts a miss.
 */
export function pick(out: Out | null, input: Input): string | null {
  const ids = out?.buttons?.map((b) => b.id) ?? []
  if (!ids.length) return null
  if (input.button && ids.includes(input.button)) return input.button
  const text = norm(input.text)
  if (!text) return null
  const n = /^(\d)$/.exec(text)
  if (n) return ids[Number(n[1]) - 1] ?? null
  const byTitle = out!.buttons!.find((b) => norm(b.title) === text)
  if (byTitle) return byTitle.id
  const hits = ids.filter((id) => WORDS[id]?.test(text))
  return hits.length === 1 ? hits[0] : null
}

/* -------------------------------------------------------------- commands */

export type Command = 'menu' | 'person' | 'cancel' | 'es' | 'en'

/** Words that work on any screen. The whole message, not a word inside one. */
export function command(text: string): Command | null {
  const s = norm(text)
  if (/^(menu|inicio|empezar|start|0|volver|back)$/.test(s)) return 'menu'
  if (/^(persona|humano|agente|alguien|representante|person|human|agent|operador\w*|hablar con (una persona|alguien))$/.test(s)) return 'person'
  if (/^(cancelar|cancel)$/.test(s)) return 'cancel'
  if (/^(en|english|ingles)$/.test(s)) return 'en'
  if (/^(es|espanol|spanish)$/.test(s)) return 'es'
  return null
}

/** Their first message often is a greeting or the link's prewritten text: start at the menu. */
const greeting = (text: string) =>
  /^(hola|hi|hello|hey|buenas|buenos dias|buenas tardes|buenas noches|good (morning|afternoon|evening))\b/.test(norm(text)) ||
  /\(?\s*ref\s*#/i.test(text)

/* ------------------------------------------------------------- bus answer */

/** The clinic closest to a point, as the crow flies. */
export const nearestPlace = (at: LatLng): PlaceKey =>
  placeKeys.reduce((a, b) => (meters(at, PLACES[b].at) < meters(at, PLACES[a].at) ? b : a))

/**
 * How to get from a shared location to the clinic by bus, in a few lines, with
 * a link to the trip on the site. The link starts at the stop they'd board at,
 * never at their location (lib/tripLink.ts).
 */
export function busAnswer(lang: Lang, from: LatLng, key: PlaceKey, now: Date): string {
  const c = busCopy(lang)
  const place = PLACES[key]
  const name = place.name[lang]
  const plan = planTrips(serverNetwork(), from, place.at, 1, now)
  const trip = plan.trips[0]
  const hub = absUrl(`/${lang}/bus?${hubDestQuery({ name, at: place.at })}`)
  if (plan.walkOnly !== null && plan.walkOnly <= WALK_ONLY_MIN)
    return `${COPY.tripTo(lang, name)}\n${c.tripJustWalk(plan.walkOnly)}\n📍 ${place.address}`
  if (!trip) return `${c.tripNoBus}\n${t(lang, COPY.hub)}\n${hub}`
  const lines = [COPY.tripTo(lang, name), `• ${c.tripWalkTo(trip.legs[0].board.walk, trip.legs[0].board.name)}`]
  trip.legs.forEach((leg, k) => {
    if (k > 0) lines.push(`• ${c.tripWalkTo(trip.legs[k - 1].alight.walk, leg.board.name)}`)
    lines.push(`• ${c.tripTake(c.tripRouteInline(leg), leg.toward)}`)
    lines.push(`• ${c.tripGetOff(leg.alight.name, leg.stops, leg.ride)}`)
  })
  const last = trip.legs[trip.legs.length - 1]
  lines.push(`• ${c.tripWalkFrom(last.alight.walk, `${name} (${place.address})`)}`)
  lines.push('', c.popularTotal(trip.total))
  const link = absUrl(
    tripLinkPath(lang, {
      from: { name: trip.legs[0].board.name, at: trip.legs[0].board.at },
      to: { name, at: place.at },
      buses: tripBuses(trip),
    }),
  )
  lines.push('', t(lang, COPY.tripLink), link)
  return lines.join('\n')
}

/* ------------------------------------------------------------------ turn */

const DAY = 86_400_000

export type TurnContext = {
  /** Over 24 hours since their last message (or their first): greet again. */
  fresh: boolean
  now: Date
  /** A button Jev read from free text, when the deterministic reading found none. */
  jevPick?: string | null
}

/** Move to a step: its screen, and a clean miss count. */
function go(s: LeadState, step: Step, set: Turn['set'] = {}, before: Out[] = []): Turn {
  const next = { ...s, ...set, step }
  const out = screen(step, next)
  return { set: { ...set, step, misses: 0 }, outs: [...before, ...(out ? [out] : [])] }
}

/** Where a visit, call or directions request goes after the place is known. */
function afterPlace(s: LeadState, set: Turn['set']): Turn {
  const intent = (set.intent ?? s.intent) as Intent
  if (intent === 'visit') return go(s, 'when', set)
  if (intent === 'callback') return go(s, 'tod', set)
  return go(s, 'pin', set)
}

/** A request is complete: ask to share their name and number (visit, callback). */
const toConsent = (s: LeadState, set: Turn['set'], before: Out[] = []) => go(s, 'consent', set, before)

function start(s: LeadState, intent: Intent): Turn {
  return go(s, 'place', { intent, status: s.status === 'new' ? 'asking' : s.status, place: null, when: null, timeOfDay: null, travel: null })
}

/** One step forward from a picked button. */
function onPick(s: LeadState, id: string, now: Date): Turn {
  const L = s.lang
  const v = id.replace(/^lc:/, '')
  switch (s.step) {
    case 'menu':
    case 'after':
      if (v === 'visit') return start(s, 'visit')
      if (v === 'call') return start(s, 'callback')
      if (v === 'dir') return start(s, 'directions')
      return { set: { step: 'done', misses: 0 }, outs: [{ text: t(L, COPY.bye) }] }
    case 'place':
      return afterPlace(s, { place: v.slice(2) })
    case 'when':
      return go(s, 'tod', { when: v.slice(2) })
    case 'tod': {
      const set = { timeOfDay: v.slice(2) }
      return s.intent === 'callback' ? toConsent(s, set) : go(s, 'travel', set)
    }
    case 'travel': {
      const set = { travel: v.slice(3) }
      return set.travel === 'bus' ? go(s, 'pin', set) : toConsent(s, set)
    }
    case 'pin': {
      // "Not now": a visit moves on; directions get the page that plans from where they are.
      if (s.intent === 'visit') return toConsent(s, {})
      const key = isPlace(s.place) ? s.place : 'calle8'
      const name = PLACES[key].name[L]
      const hub = absUrl(`/${L}/bus?${hubDestQuery({ name, at: PLACES[key].at })}`)
      return go(s, 'after', {}, [{ text: `${t(L, COPY.hub)}\n${hub}` }])
    }
    case 'consent':
      if (v === 'yes') {
        return {
          set: { step: 'done', status: 'ready', misses: 0, consentAt: now.toISOString(), consentText: consentQuestion(L) },
          outs: [{ text: COPY.ready(L, s) }],
          alert: 'ready',
        }
      }
      return { set: { step: 'done', status: s.status === 'ready' ? 'ready' : 'closed', misses: 0 }, outs: [{ text: t(L, COPY.declined) }] }
    default:
      return { set: {}, outs: [] }
  }
}

/** A shared location: the bus answer to the clinic they picked, or the nearest one. */
function onLocation(s: LeadState, at: LatLng, now: Date): Turn {
  const key = isPlace(s.place) ? s.place : nearestPlace(at)
  const answer: Out = { text: busAnswer(s.lang, at, key, now) }
  if (s.step === 'pin' && s.intent === 'visit') return toConsent(s, { place: key }, [answer])
  if (s.step === 'handoff') return { set: {}, outs: [answer] }
  return go(s, 'after', { place: key, intent: s.intent ?? 'directions' }, [answer])
}

export function turn(s: LeadState, input: Input, ctx: TurnContext): Turn {
  const L = s.lang
  const cmd = input.button ? null : command(input.text)

  if (cmd === 'es' || cmd === 'en') {
    const next = { ...s, lang: cmd }
    const step = s.step === 'done' || s.step === 'handoff' ? 'menu' : s.step
    return { set: { lang: cmd, step, misses: 0 }, outs: [screen(step, next)!] }
  }
  if (cmd === 'menu') return go(s, 'menu', { status: s.status === 'handoff' ? 'asking' : s.status })
  if (cmd === 'person') return { set: { step: 'handoff', status: s.status === 'ready' ? 'ready' : 'handoff', misses: 0 }, outs: [{ text: t(L, COPY.handoff) }], alert: 'person' }
  if (cmd === 'cancel') {
    if (s.status === 'ready') return { set: { step: 'done', status: 'closed', misses: 0 }, outs: [{ text: t(L, COPY.cancelled) }], alert: 'cancel' }
    return go(s, 'menu')
  }

  if (input.location) return onLocation(s, input.location, ctx.now)

  // With a person: the bot stays quiet and the owner sees the message (after
  // a day with no answer, the buttons come back below).
  if (s.step === 'handoff' && !ctx.fresh) return { set: {}, outs: [], alert: 'message' }

  // A new conversation, or a greeting after a finished one: the menu.
  if (ctx.fresh || (s.step === 'done' && greeting(input.text) && !input.button)) {
    const set = { status: s.status } as Turn['set']
    return go(s, 'menu', set)
  }

  const out = screen(s.step, s)
  const id = pick(out, input) ?? (ctx.jevPick && out?.buttons?.some((b) => b.id === ctx.jevPick) ? ctx.jevPick : null)
  if (id) return onPick(s, id, ctx.now)

  // A tap on a button from an earlier screen still means what it says.
  if (input.button && /^lc:(visit|call|dir)$/.test(input.button)) return onPick({ ...s, step: 'menu' }, input.button, ctx.now)

  if (s.step === 'done') return { set: {}, outs: [{ text: t(L, COPY.received) }], alert: 'message' }

  // Not understood: show the buttons again, then a person.
  if (s.misses >= 1) {
    return { set: { step: 'handoff', status: s.status === 'ready' ? 'ready' : 'handoff', misses: 0 }, outs: [{ text: t(L, COPY.handoff) }], alert: 'person' }
  }
  const hint = s.step === 'pin' ? t(L, COPY.pinAgain) : t(L, COPY.tapHint)
  return { set: { misses: s.misses + 1 }, outs: out ? [{ ...out, text: `${hint}\n\n${out.text}` }] : [{ text: hint }] }
}

/** Whether their last message was long enough ago to greet them again. */
export const isFresh = (lastInboundAt: string | null | undefined, now: Date) =>
  !lastInboundAt || now.getTime() - new Date(lastInboundAt).getTime() > DAY

/* ------------------------------------------------------------------ link */

/**
 * The wa.me link for a post, story or the listing page, with the ref the line
 * reads: «Hola, quiero información de La Capital Medical Center (ref #la-capital instagram es)».
 */
export function laCapitalLink(sender: string, source: string, lang: Lang): string {
  const hello = lang === 'en' ? `Hi, I'd like information about ${CLINIC.name}` : `Hola, quiero información de ${CLINIC.name}`
  return `https://wa.me/${sender.replace(/\D/g, '')}?text=${encodeURIComponent(`${hello} (ref #${FLOW} ${source} ${lang})`)}`
}
