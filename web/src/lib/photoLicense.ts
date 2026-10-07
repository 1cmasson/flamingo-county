import type { Media } from '../payload-types'

/**
 * The licences a photo on the public site may carry, and how it is credited.
 *
 * The owner's rule: public domain, or Creative Commons that allows commercial
 * reuse, always with attribution. So this list has no NC (non-commercial) and
 * no ND (no derivatives) licence: the cards crop a photo and set type on it,
 * which is a derivative. A licence that is not on this list cannot be stored,
 * and the MCP tool's schema is built from it.
 *
 * Never Google Maps or Street View, Yelp, news sites or organizer flyers: none
 * of those carries a licence that is on this list.
 */
export const PHOTO_LICENSES = [
  'public-domain',
  'cc0',
  'cc-by-2.0',
  'cc-by-3.0',
  'cc-by-4.0',
  'cc-by-sa-2.0',
  'cc-by-sa-3.0',
  'cc-by-sa-4.0',
] as const

export type PhotoLicense = (typeof PHOTO_LICENSES)[number]

export function isPhotoLicense(v: unknown): v is PhotoLicense {
  return typeof v === 'string' && (PHOTO_LICENSES as readonly string[]).includes(v)
}

/** "CC BY-SA 4.0", or "Dominio público" / "Public domain". */
export function licenseLabel(license: PhotoLicense, lang: 'es' | 'en'): string {
  if (license === 'public-domain') return lang === 'es' ? 'Dominio público' : 'Public domain'
  if (license === 'cc0') return 'CC0'
  const [, ...rest] = license.split('-')
  const version = rest.pop()
  return `CC ${rest.join('-').toUpperCase()} ${version}`
}

/**
 * The licence's own deed, or null for plain public domain (there is no one
 * page for it; the description page says why the work is free).
 */
export function canonicalLicenseUrl(license: PhotoLicense): string | null {
  if (license === 'public-domain') return null
  if (license === 'cc0') return 'https://creativecommons.org/publicdomain/zero/1.0/'
  const [, ...rest] = license.split('-')
  const version = rest.pop()
  return `https://creativecommons.org/licenses/${rest.join('-')}/${version}/`
}

/** Share-alike: whatever is made from the photo is under the same licence. */
export function isShareAlike(license: PhotoLicense | null | undefined): boolean {
  return !!license && license.startsWith('cc-by-sa-')
}

/** Only http(s) links are drawn: a stored `javascript:` URL never becomes an href. */
function safeHref(v: string | null | undefined): string | null {
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

export type PhotoCredit = {
  /** "Foto" / "Photo", or "Ilustración" / "Illustration" for our own drawn artwork. */
  lead: string
  credit: string
  /** What our own artwork was drawn from, e.g. "basada en fotos del HABS (dominio público)". */
  basedOn: string | null
  /** The description page, when there is one. */
  sourceUrl: string | null
  /** "CC BY 2.0", or null for a photo with no licence on file (the owner's or a partner's own). */
  license: string | null
  licenseUrl: string | null
  /** "recortada" / "cropped", when the picture shown is not the whole photo. */
  cropped: string | null
  /** For a card made from a BY-SA photo: "tarjeta CC BY-SA 4.0". */
  derivative: string | null
}

/**
 * How a photo is credited where it appears: the page hero, the board, the
 * cards and the social caption all read this, so they say the same thing.
 *
 * `cropped` is for a surface that shows less than the whole photo: every one
 * the site has (the hero strip and the board's 4:3 slot are `object-fit:
 * cover`, the cards crop to their own box). `modified` on the media says the
 * stored file itself was edited, which is credited the same way.
 *
 * `card` is for the generated cards, which set type on the photo: under a
 * BY-SA licence that composite is a derivative and is shared under the same
 * licence, and the card says so.
 *
 * Null when the media has no credit: nothing to say, and nothing is made up.
 */
export function photoCredit(
  media: Media | number | string | null | undefined,
  lang: 'es' | 'en',
  opts: { cropped?: boolean; card?: boolean } = {},
): PhotoCredit | null {
  const m = media && typeof media === 'object' ? (media as Media) : null
  const credit = m?.credit?.trim()
  if (!m || !credit) return null
  const license = isPhotoLicense(m.license) ? m.license : null
  const label = license ? licenseLabel(license, lang) : null
  const cropped = opts.cropped || m.modified
  const drawn = m.origin === 'own-illustration'
  return {
    lead: drawn ? (lang === 'es' ? 'Ilustración' : 'Illustration') : lang === 'es' ? 'Foto' : 'Photo',
    credit,
    basedOn: m.basedOn?.trim() || null,
    sourceUrl: safeHref(m.sourceUrl),
    license: label,
    licenseUrl: license ? (safeHref(m.licenseUrl) ?? canonicalLicenseUrl(license)) : null,
    cropped: cropped ? (lang === 'es' ? 'recortada' : 'cropped') : null,
    derivative: opts.card && license && isShareAlike(license) ? `${lang === 'es' ? 'tarjeta' : 'card'} ${label}` : null,
  }
}

/**
 * The credit as one line of plain text: "Foto: Phillip Pessar · CC BY 2.0 · recortada",
 * or "Ilustración: Flamingo County · basada en fotos del HABS (dominio público)".
 */
export function photoCreditText(c: PhotoCredit, sep = ' · '): string {
  return [`${c.lead}: ${c.credit}`, c.basedOn, c.license, c.cropped, c.derivative].filter(Boolean).join(sep)
}
