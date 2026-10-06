import { FOUNDER, SITE_NAME, SITE_URL } from '../../lib/site'

/**
 * "Save my contact" on the business card page: the card's own details as a
 * vCard, so the person who scanned it keeps the founder in their phone. Only
 * what is printed on the card — name, title, the hola@ address, the site.
 *
 * A file path (it ends in .vcf), so the language middleware leaves it alone.
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
      'Content-Disposition': 'attachment; filename="carlos-masson.vcf"',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
