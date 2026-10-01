import { test, expect, type Page } from '@playwright/test'
import {
  ageSessions,
  authUserExists,
  authUserIdByEmail,
  createMember,
  mintSignInCode,
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

  test('an old session proves itself with an emailed code before deleting', async ({ page }) => {
    await ageSessions(member.id)
    await page.goto(MY_WEEK)

    await page.getByRole('button', { name: 'Delete my account' }).click()
    await page.getByRole('button', { name: 'YES, DELETE' }).click()
    const confirm = page.getByRole('group', { name: 'DELETE YOUR ACCOUNT?' })
    await expect(confirm.getByText(/confirm it’s you — with Google or a code/)).toBeVisible()

    // The code goes to the account's own address — there is nothing to type.
    await expect(confirm.getByLabel('YOUR EMAIL', { exact: true })).toHaveCount(0)
    await confirm.getByRole('button', { name: 'EMAIL ME A CODE' }).click()
    // Mint only once the UI's own send has landed, or that one replaces ours.
    await expect(confirm.getByLabel('CODE', { exact: true })).toBeVisible()
    await confirm.getByLabel('CODE', { exact: true }).fill(await mintSignInCode(member.email))
    await confirm.getByRole('button', { name: 'SIGN IN', exact: true }).click()

    await confirm.getByRole('button', { name: 'YES, DELETE' }).click()
    await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toBeVisible()
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
  test('My Week shows only the sign-in panel', async ({ page }) => {
    await page.goto(MY_WEEK)
    await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toBeVisible()
    await expect(page.getByText('NOTHING SAVED YET.')).toHaveCount(0)
  })

  test('saving and going each start sign-in and carry the tap through', async ({ page }) => {
    // Stop at Better Auth's sign-in call: the request body shows where Google
    // would send the visitor back, which is what carries the tap.
    const callbacks: string[] = []
    await page.route('**/api/auth/sign-in/social', async (route) => {
      callbacks.push(JSON.parse(route.request().postData() ?? '{}').callbackURL)
      await route.abort()
    })
    await page.goto(`${BASE}/en/events/${A}`)

    await page.getByRole('button', { name: '+ MY WEEK' }).first().click()
    await page.getByRole('button', { name: /GOING/ }).first().click()

    await expect.poll(() => callbacks.length).toBe(2)
    expect(callbacks).toEqual([
      `/en/events/${A}?fc_do=save&fc_e=${A}`,
      `/en/events/${A}?fc_do=going&fc_e=${A}`,
    ])
    expect(await deviceSaved(page)).toBeNull()
  })

  test('+ CALENDAR downloads the file with no sign-in', async ({ page }) => {
    let signIns = 0
    await page.route('**/api/auth/sign-in/**', async (route) => {
      signIns++
      await route.abort()
    })
    await page.goto(`${BASE}/en/events/${A}`)
    const download = page.waitForEvent('download')
    await page.getByRole('link', { name: '+ CALENDAR' }).first().click()
    expect((await download).suggestedFilename()).toBe(`${A}.ics`)
    expect(signIns).toBe(0)
  })

  test('the calendar file serves a signed-out request, so it can be shared', async ({ page }) => {
    const res = await page.request.get(`${BASE}/en/events/${A}/ics`, { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('text/calendar')
    expect(res.headers()['cache-control']).toContain('public')
    expect(await res.text()).toContain(`UID:${A}@flamingocounty.com`)
  })
})

test.describe('www', () => {
  // Sign-in refuses www's origin, so www must never reach a page at all.
  test('www is sent to the bare domain, path and query kept', async ({ page }) => {
    const res = await page.request.get(`${BASE}/en/my-week?x=1`, {
      headers: { 'x-forwarded-host': 'www.flamingocounty.com' },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(308)
    expect(res.headers().location).toBe('https://flamingocounty.com/en/my-week?x=1')
  })

  test('the bare domain is left alone', async ({ page }) => {
    const res = await page.request.get(`${BASE}/en/my-week`, {
      headers: { 'x-forwarded-host': 'flamingocounty.com' },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(200)
  })
})

test.describe('Back from sign-in', () => {
  let member: Awaited<ReturnType<typeof createMember>>

  test.beforeEach(async ({ context }, info) => {
    member = await createMember(`e2e-back-${info.testId}-${Date.now()}@example.com`)
    await context.addCookies(member.cookies)
  })

  test.afterEach(async () => {
    await removeMember(member.id)
  })

  test('a save tapped before sign-in is finished, and the URL cleaned', async ({ page }) => {
    await page.goto(`${BASE}/en/events/${A}?fc_do=save&fc_e=${A}`)
    await expect.poll(async () => (await memberLists(member.id))?.saved).toEqual([A])
    await expect(page).toHaveURL(`${BASE}/en/events/${A}`)
    await expect(page.getByRole('button', { name: 'IN MY WEEK' }).first()).toBeVisible()
  })

  test('a going tap is finished too, and never toggled off', async ({ page }) => {
    await setMemberLists(member.id, [], [A])
    await page.goto(`${BASE}/en/events/${A}?fc_do=going&fc_e=${A}`)
    await expect(page).toHaveURL(`${BASE}/en/events/${A}`)
    await expect.poll(async () => (await memberLists(member.id))?.going).toEqual([A])
  })

  test('a calendar tap downloads the file', async ({ page }) => {
    const download = page.waitForEvent('download')
    await page.goto(`${BASE}/en/events/${A}?fc_do=ics&fc_e=${A}`)
    expect((await download).suggestedFilename()).toBe(`${A}.ics`)
  })
})

test.describe('Inside Instagram', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91',
  })

  test('My Week offers an emailed code, and "open in Safari", instead of the Google button', async ({ page }) => {
    await page.goto(MY_WEEK)
    // Scoped to the page: the gate's (closed) dialog carries the same copy.
    const main = page.locator('main')
    await expect(main.getByText('SIGN IN WITH YOUR EMAIL.')).toBeVisible()
    await expect(main.getByRole('button', { name: 'EMAIL ME A CODE' })).toBeVisible()
    await expect(main.getByText('Or open this page in Safari to sign in with Google.')).toBeVisible()
    await expect(main.getByRole('button', { name: 'COPY LINK' })).toBeVisible()
    await expect(page.getByRole('button', { name: /SIGN IN WITH GOOGLE/ })).toHaveCount(0)
  })

  test('an event button opens the same prompt instead of going to Google', async ({ page }) => {
    let signInCalled = false
    await page.route('**/api/auth/sign-in/social', async (route) => {
      signInCalled = true
      await route.abort()
    })
    await page.goto(`${BASE}/en/events/${A}`)
    await page.getByRole('button', { name: '+ MY WEEK' }).first().click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('SIGN IN WITH YOUR EMAIL.')).toBeVisible()
    await dialog.getByRole('button', { name: 'CLOSE' }).click()
    await expect(dialog).toBeHidden()
    expect(signInCalled).toBe(false)
  })
})

test.describe('Signing in with an emailed code', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91',
  })

  const cleanup: string[] = []
  test.afterEach(async () => {
    for (const id of cleanup.splice(0)) await removeMember(id)
  })

  async function enterCode(page: Page, scope: ReturnType<Page['locator']>, email: string) {
    await scope.getByLabel('YOUR EMAIL', { exact: true }).fill(email)
    await scope.getByRole('button', { name: 'EMAIL ME A CODE' }).click()
    await expect(scope.getByLabel('CODE', { exact: true })).toBeVisible()
    await scope.getByLabel('CODE', { exact: true }).fill(await mintSignInCode(email))
    await scope.getByRole('button', { name: 'SIGN IN', exact: true }).click()
  }

  test('someone who joined with Google gets the same account back', async ({ page }) => {
    // Typed in capitals on purpose: Google stored it lower-case.
    const email = `e2e-code-google-${Date.now()}@example.com`
    const member = await createMember(email)
    cleanup.push(member.id)
    await setMemberLists(member.id, [A])

    await page.goto(MY_WEEK)
    await enterCode(page, page.locator('main'), email.toUpperCase())

    await expect(listed(page, A)).toBeVisible()
    expect(await authUserIdByEmail(email)).toBe(member.id)
  })

  test('a new address gets a new account', async ({ page }) => {
    const email = `e2e-code-new-${Date.now()}@example.com`
    await page.goto(MY_WEEK)
    await enterCode(page, page.locator('main'), email)

    await expect(page.getByText('NOTHING SAVED YET.')).toBeVisible()
    const id = await authUserIdByEmail(email)
    expect(id).not.toBeNull()
    cleanup.push(id!)
  })

  test('a wrong code is refused', async ({ page }) => {
    const email = `e2e-code-wrong-${Date.now()}@example.com`
    await page.goto(MY_WEEK)
    const main = page.locator('main')
    await main.getByLabel('YOUR EMAIL', { exact: true }).fill(email)
    await main.getByRole('button', { name: 'EMAIL ME A CODE' }).click()
    await expect(main.getByLabel('CODE', { exact: true })).toBeVisible()
    const real = await mintSignInCode(email)
    await main.getByLabel('CODE', { exact: true }).fill(real === '000000' ? '111111' : '000000')
    await main.getByRole('button', { name: 'SIGN IN', exact: true }).click()
    await expect(main.getByRole('alert')).toHaveText('That code isn’t right. Check it or ask for a new one.')
    expect(await authUserIdByEmail(email)).toBeNull()
  })

  test('a save tapped in the gate is finished after the code', async ({ page }) => {
    const email = `e2e-code-gate-${Date.now()}@example.com`
    await page.goto(`${BASE}/en/events/${A}`)
    await page.getByRole('button', { name: '+ MY WEEK' }).first().click()
    await enterCode(page, page.getByRole('dialog'), email)

    await expect(page).toHaveURL(`${BASE}/en/events/${A}`)
    await expect(page.getByRole('button', { name: 'IN MY WEEK' }).first()).toBeVisible()
    const id = await authUserIdByEmail(email)
    expect(id).not.toBeNull()
    cleanup.push(id!)
    await expect.poll(async () => (await memberLists(id!))?.saved).toEqual([A])
  })
})
