import { FOUNDER, SITE_NAME, SITE_URL } from '../../lib/site'

/**
 * "Save contact" under the card on the business card page: the card's own
 * details as a vCard, so whoever scanned it keeps it in their phone. Only what
 * is printed on the card — name, title, the hola@ address, the site.
 *
 * A file path (it ends in .vcf), so the language middleware leaves it alone.
 * Named /contact.vcf, not after the founder: every page carries the app's route
 * list, and the owner's name should appear only on the card itself.
 */
export function GET() {
  const [first, ...rest] = FOUNDER.name.split(' ')
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${rest.join(' ')};${first};;;`,
    `FN:${FOUNDER.name}`,
    `ORG:${SITE_NAME}`,
    'TITLE:Founder',
    `EMAIL;TYPE=INTERNET,WORK:${FOUNDER.email}`,
    `URL:${SITE_URL}`,
    'END:VCARD',
    '',
  ].join('\r\n')

  return new Response(vcard, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'attachment; filename="flamingo-county.vcf"',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
