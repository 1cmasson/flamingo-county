import { test, expect } from '@playwright/test'

/**
 * A smoke test for the real site, not the template it was generated from.
 *
 * This file shipped from `create-payload-app` asserting the title
 * `Payload Blank Template` and an `<h1>Welcome to your new project.</h1>`,
 * neither of which has existed since the port. It failed on every run, which
 * meant `pnpm test` exited non-zero permanently and a genuine regression would
 * have looked exactly like the noise everyone had learned to ignore.
 *
 * What it checks now is the chain most likely to break silently: `/` resolves a
 * language and redirects, the layout renders, and the page is actually driven
 * by the database rather than an empty shell. It deliberately does NOT assert
 * on copy — the headline is CMS content and editing it is not a regression.
 */
test.describe('Frontend', () => {
  test('the root redirects into a language and renders a real page', async ({ page }) => {
    await page.goto('http://localhost:3000')

    // The proxy's chain is ?lang= → cookie → Accept-Language → es. A fresh
    // context sends `en-US`, so this lands on /en.
    await expect(page).toHaveURL(/\/(en|es)$/)
    await expect(page).toHaveTitle(/Flamingo County/)
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('the home grid is driven by the database', async ({ page }) => {
    await page.goto('http://localhost:3000/en')

    // Count links by their shape rather than by a CSS hook: a business URL is
    // exactly /<lang>/<city>/<business>, and the two-segment city links and the
    // nav chips are not. Matching on `href*="/en/"` instead picks up the burger
    // nav, which is display:none at desktop width — the locator resolves and
    // then fails on visibility, which looks like a content bug and is not one.
    //
    // Zero of these means the layout rendered but the Payload query came back
    // empty — the exact failure a container build against an unseeded volume
    // produces, and one a status-code check calls a pass.
    const listings = await page
      .locator('a')
      .evaluateAll(
        (links) =>
          links.filter((a) => /^\/en\/[a-z-]+\/[a-z0-9-]+$/.test(a.getAttribute('href') ?? ''))
            .length,
      )
    expect(listings).toBeGreaterThan(0)
  })
})
