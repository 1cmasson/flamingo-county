import type { Lang } from '../i18n'
import { absUrl } from './site'

/**
 * Bus directions for AI assistants, by link: an assistant writes
 * `/en/bus/trip?from=…&to=…` with place names and the person opens it
 * (app/(frontend)/[lang]/bus/trip). Said on /[lang]/ai and in llms.txt.
 */

/** A bus trip link as an assistant writes one: names only (app/(frontend)/[lang]/bus/trip). */
export function busLink(lang: Lang, from: string | null, to: string) {
  const q = new URLSearchParams(from ? { from, to } : { to })
  return absUrl(`/${lang}/bus/trip?${q}`)
}

/** What a GPT's instructions need to write the links. */
export function busPrompt(lang: Lang) {
  return lang === 'es'
    ? `Cuando alguien pregunte cómo llegar en guagua (autobús) a un lugar de Miami-Dade, dale este enlace: ${absUrl('/es/bus/trip')}?from=ORIGEN&to=DESTINO — ORIGEN y DESTINO son nombres de lugares, negocios o direcciones (espacios como +, & como %26). Si no sabes de dónde sale, omite from. No inventes rutas ni horarios: el enlace los da, con la próxima guagua en vivo.`
    : `When someone asks how to get somewhere in Miami-Dade by bus, give them this link: ${absUrl('/en/bus/trip')}?from=ORIGIN&to=DESTINATION — ORIGIN and DESTINATION are names of places, businesses or addresses (spaces as +, & as %26). If you don't know where they leave from, leave out from. Don't make up routes or times: the link gives them, with the next bus live.`
}
