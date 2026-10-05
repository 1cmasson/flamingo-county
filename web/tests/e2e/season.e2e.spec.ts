import { test, expect } from '@playwright/test'

/**
 * The seasonal guide answers in both languages, wins over the `[city]` route
 * beside it, and says what it is in its head. Run against any server with
 * E2E_BASE_URL (port 3000 is often another worktree's).
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

test.describe('Halloween guide', () => {
  for (const [lang, h1] of [
    ['es', /Halloween en Hialeah \d{4}/],
    ['en', /Halloween in Hialeah \d{4}/],
  ] as const) {
    test(`/${lang}/halloween renders the guide`, async ({ page, request }) => {
      const res = await request.get(`${BASE}/${lang}/halloween`)
      expect(res.status()).toBe(200)

      await page.goto(`${BASE}/${lang}/halloween`)
      await expect(page.locator('h1')).toHaveText(h1)
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/${lang}/halloween$`))
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/api\/og\/season\/halloween\?lang=/)
      await expect(page.locator(`a[href="/${lang}/events"]`).last()).toBeVisible()
      const ld = await page.locator('script[type="application/ld+json"]').allTextContents()
      expect(ld.join('\n')).toContain('"ItemList"')
      expect(ld.join('\n')).toContain('"BreadcrumbList"')
    })
  }
})
