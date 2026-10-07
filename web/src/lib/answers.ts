import type { Lang } from '../i18n'
import type { Category, Event, Listing } from '../payload-types'
import { dateOnly, parseISO, todayISO } from './dates'
import { splitAddress } from './jsonld'

/**
 * The short direct answer each business and event page opens with.
 *
 * Answer engines quote the first plain sentences under a question, so the page
 * leads with one. The rule is the same as structured data's: say only what the
 * record holds. Two consequences shape everything here:
 *
 * - A listing's real answer is AUTHORED, in `listing.answer`, and goes live
 *   only through the owner's Publish tap. Composing it from the research fields
 *   isn't safe: cuisine and signature dishes are English-only, and founding
 *   years come with notes like "attribute to Burger Beast rather than stating
 *   flat" that no template can honour. Until one is written, the fallback says
 *   only what the name, category, city and address already say. It runs short,
 *   and short and true beats padded.
 * - An event's answer IS composed, because every part of it is structured:
 *   title, date, the display time, venue, city, status and a named organizer.
 *   The venue's own listing is NOT promoted to organizer here, even though the
 *   JSON-LD falls back to it: a visible sentence saying "organized by" a room
 *   that may only have been rented is a claim nobody made.
 */

/** Singular nouns for the categories. The labels are plural display caps ("RESTAURANTS"). */
const CATEGORY_NOUN: Record<string, Record<Lang, string>> = {
  food: { en: 'a restaurant', es: 'un restaurante' },
  night: { en: 'a bar', es: 'un bar' },
  nonprofit: { en: 'a nonprofit organization', es: 'una organización sin fines de lucro' },
  gems: { en: 'a local institution', es: 'una institución local' },
}
const BUSINESS_NOUN: Record<Lang, string> = { en: 'a local business', es: 'un negocio local' }

export function listingAnswer(
  lang: Lang,
  listing: Pick<Listing, 'name' | 'answer' | 'detail'>,
  category: Pick<Category, 'slug'> | null,
  cityName: string | undefined,
): string {
  const authored = listing.answer?.trim()
  if (authored) return authored
  const noun = (category && CATEGORY_NOUN[category.slug]?.[lang]) ?? BUSINESS_NOUN[lang]
  // Only a street that parsed out of a full address: "Hialeah, FL" alone would
  // read as a street.
  const street = splitAddress(listing.detail?.address)?.streetAddress
  const where = cityName ? (lang === 'es' ? ` en ${cityName}, Florida` : ` in ${cityName}, Florida`) : ''
  const at = street ? (lang === 'es' ? `, en ${street}` : `, at ${street}`) : ''
  return lang === 'es'
    ? `${listing.name} es ${noun}${where}${at}.`
    : `${listing.name} is ${noun}${where}${at}.`
}

/** "What is Molina's Ranch Restaurant?" The name goes in whole: it is the subject people ask about. */
export function listingQuestion(lang: Lang, name: string): string {
  return lang === 'es' ? `¿Qué es ${name}?` : `What is ${name}?`
}

/** "Tuesday, October 6, 2026" / "martes, 6 de octubre de 2026". */
export function longDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parseISO(iso))
}

/** "August 18, 2026" / "18 de agosto de 2026". */
function dayDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es' : 'en', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parseISO(iso))
}

/**
 * "Last verified August 18, 2026", or null when nobody has checked.
 *
 * Read through `dateOnly` and formatted in UTC: the field is a calendar day
 * stored at a UTC instant, and formatting it in Miami time would print the day
 * before.
 */
export function verifiedLine(lang: Lang, lastVerifiedAt: string | null | undefined): string | null {
  const iso = dateOnly(lastVerifiedAt)
  if (!iso) return null
  return lang === 'es'
    ? `Verificado por última vez el ${dayDate(iso, lang)}`
    : `Last verified ${dayDate(iso, lang)}`
}

export function eventAnswer(
  lang: Lang,
  ev: Pick<Event, 'title' | 'date' | 'endDate' | 'timeLabel' | 'eventStatus'>,
  where: { venue: string; cityName?: string; organizer?: string },
  today: string = todayISO(),
): string {
  const es = lang === 'es'
  const start = dateOnly(ev.date)
  const end = dateOnly(ev.endDate)
  const multi = Boolean(end && end > start)
  const past = (multi ? end : start) < today

  // Titles are often sentences ("We're meeting at Casa Marín"), so they are
  // quoted: the answer has to read right whatever the title says.
  const title = es ? `«${ev.title}»` : `“${ev.title}”`
  // `dates` stands alone after a colon; `when` follows a verb.
  const dates = multi
    ? es
      ? `del ${longDate(start, lang)} al ${longDate(end, lang)}`
      : `${longDate(start, lang)} to ${longDate(end, lang)}`
    : longDate(start, lang)
  const when = multi ? (es ? dates : `from ${dates}`) : `${es ? 'el' : 'on'} ${dates}`
  const planned = es ? `previsto para ${multi ? dates : `el ${dates}`}` : `planned for ${dates}`
  const time = ev.timeLabel?.trim() ? `, ${ev.timeLabel.trim()}` : ''
  const place = where.venue
    ? `, ${es ? 'en' : 'at'} ${where.venue}${where.cityName ? `, ${where.cityName}` : ''}`
    : where.cityName
      ? `, ${es ? 'en' : 'in'} ${where.cityName}`
      : ''

  let sentence: string
  switch (ev.eventStatus) {
    case 'cancelled':
      sentence = es
        ? `${title}, ${planned}${place}, está cancelado.`
        : `${title}, ${planned}${place}, is cancelled.`
      break
    case 'postponed':
      sentence = es
        ? `${title}, ${planned}${place}, está aplazado y aún no tiene nueva fecha.`
        : `${title}, ${planned}${place}, is postponed and has no new date yet.`
      break
    case 'rescheduled':
      sentence = es
        ? `${title} ${past ? 'tuvo' : 'tiene'} nueva fecha: ${dates}${time}${place}.`
        : `${title} ${past ? 'moved' : 'has moved'} to a new date: ${dates}${time}${place}.`
      break
    default:
      sentence = es
        ? `${title} ${past ? 'fue' : 'es'} ${when}${time}${place}.`
        : `${title} ${past ? 'took place' : 'takes place'} ${when}${time}${place}.`
  }
  const org = where.organizer?.trim()
  if (!org) return sentence
  return es ? `${sentence} Organiza: ${org}.` : `${sentence} Organized by ${org}.`
}
