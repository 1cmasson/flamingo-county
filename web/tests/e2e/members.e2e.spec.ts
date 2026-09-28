import { test, expect, type Page } from '@playwright/test'
import {
  authUserExists,
  createMember,
  eventSlugs,
  memberLists,
  removeMember,
  setMemberLists,
} from '../helpers/member'

/**
 * Member accounts and My Week sync — see MEMBERS.md.
 *
 * Sessions are minted directly (tests/helpers/member.ts) because Google's
 * consent screen can't be driven from a test; everything after the callback is
 * the real code path.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const MY_WEEK = `${BASE}/en/my-week`

let A: string
let B: string

test.beforeAll(async () => {
  const slugs = await eventSlugs()
  if (slugs.length < 2) throw new Error('members e2e needs two seeded events — run `pnpm seed`')
  ;[A, B] = slugs
})

const listed = (page: Page, slug: string) => page.locator(`main a[href="/en/events/${slug}"]`)

const setDevice = (page: Page, saved: string[]) =>
  page.evaluate((s) => localStorage.setItem('fc.saved', JSON.stringify(s)), saved)

const deviceSaved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('fc.saved') ?? 'null') as string[] | null)

test.describe('Members', () => {
  let member: Awaited<ReturnType<typeof createMember>>

  test.beforeEach(async ({ context }, info) => {
    member = await createMember(`e2e-${info.testId}-${Date.now()}@example.com`)
    await context.addCookies(member.cookies)
  })

  test.afterEach(async () => {
    await removeMember(member.id)
  })

  test('first sign-in merges the device into the account', async ({ page }) => {
    await setMemberLists(member.id, [A])
    await page.goto(MY_WEEK)
    await setDevice(page, [B])
    await page.reload()

    await expect(listed(page, A)).toBeVisible()
    await expect(listed(page, B)).toBeVisible()
    await expect.poll(async () => (await memberLists(member.id))?.saved).toEqual([B, A])
  })

  test('after the first sync the account copy wins, so removals elsewhere stick', async ({ page }) => {
    await setMemberLists(member.id, [A, B])
    await page.goto(MY_WEEK)
    await expect(listed(page, B)).toBeVisible()

    // "Another phone" removes B.
    await setMemberLists(member.id, [A])
    await page.reload()

    await expect(listed(page, A)).toBeVisible()
    await expect(listed(page, B)).toHaveCount(0)
    expect(await deviceSaved(page)).toEqual([A])
  })

  test('a save on an event page reaches the account', async ({ page }) => {
    await page.goto(MY_WEEK)
    await expect(page.getByText(/HI,/)).toBeVisible()
    await page.goto(`${BASE}/en/events/${A}`)
    await page.getByRole('button', { name: /MY WEEK/ }).first().click()

    await expect.poll(async () => (await memberLists(member.id))?.saved).toEqual([A])
  })

  test('signing out clears this device', async ({ page }) => {
    await setMemberLists(member.id, [A])
    await page.goto(MY_WEEK)
    await expect(listed(page, A)).toBeVisible()

    await page.getByRole('button', { name: 'SIGN OUT' }).click()

    await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toBeVisible()
    await expect(listed(page, A)).toHaveCount(0)
    expect(await deviceSaved(page)).toBeNull()
  })

  test('deleting the account removes the member and the login', async ({ page }) => {
    await setMemberLists(member.id, [A])
    await page.goto(MY_WEEK)

    await page.getByRole('button', { name: 'Delete my account' }).click()
    await page.getByRole('button', { name: 'YES, DELETE' }).click()

    await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toBeVisible()
    expect(await memberLists(member.id)).toBeNull()
    expect(await authUserExists(member.id)).toBe(false)
  })

  test('a member is not an admin', async ({ page }) => {
    const res = await page.request.get(`${BASE}/api/users/me`)
    expect((await res.json()).user).toBeNull()
    const members = await page.request.get(`${BASE}/api/members`)
    expect(members.status()).toBe(403)
  })
})

test.describe('Signed out', () => {
  test('saving stays on the device and never calls the sync API', async ({ page }) => {
    const calls: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/me/')) calls.push(r.url())
    })
    await page.goto(`${BASE}/en/events/${A}`)
    await page.getByRole('button', { name: /MY WEEK/ }).first().click()
    await expect.poll(() => deviceSaved(page)).toEqual([A])

    await page.goto(MY_WEEK)
    await expect(listed(page, A)).toBeVisible()
    await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toBeVisible()
    expect(calls).toEqual([])
  })
})

test.describe('Inside Instagram', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91',
  })

  test('My Week offers "open in Safari" instead of the Google button', async ({ page }) => {
    await page.goto(MY_WEEK)
    await expect(page.getByText('OPEN THIS IN Safari TO SIGN IN.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'COPY LINK' })).toBeVisible()
    await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toHaveCount(0)
  })
})
