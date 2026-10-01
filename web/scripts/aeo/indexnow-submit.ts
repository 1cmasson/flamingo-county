/**
 * One-off bulk IndexNow submission of every URL in the live sitemap.
 *
 *   INDEXNOW_KEY=<key> pnpm aeo:indexnow            # submit https://flamingocounty.com/sitemap.xml
 *   INDEXNOW_KEY=<key> pnpm aeo:indexnow --dry      # list the URLs, send nothing
 *
 * Run once after the first deploy (the CMS hooks only cover later edits), and
 * again after any large content import. The same key must be set on Railway as
 * INDEXNOW_KEY, because the site serves /<key>.txt from it and IndexNow checks
 * that file before accepting anything.
 */
const SITE = 'https://flamingocounty.com'

async function main() {
  const key = process.env.INDEXNOW_KEY
  if (!key) throw new Error('Set INDEXNOW_KEY')
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  console.log(`${urls.length} URLs in the sitemap`)
  if (!urls.length) throw new Error('Sitemap is empty or not deployed yet')

  const keyCheck = await fetch(`${SITE}/${key}.txt`)
  if (!keyCheck.ok || (await keyCheck.text()).trim() !== key) {
    throw new Error(`${SITE}/${key}.txt does not serve the key. Set INDEXNOW_KEY on Railway and redeploy first.`)
  }
  if (process.argv.includes('--dry')) return urls.forEach((u) => console.log(u))

  const res = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${key}.txt`, urlList: urls.slice(0, 10000) }),
  })
  console.log(`IndexNow responded ${res.status} ${res.statusText}`)
  if (!res.ok && res.status !== 202) process.exit(1)
}

main().catch((e) => {
  console.error(String(e.message ?? e))
  process.exit(1)
})
