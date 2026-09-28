import { createClient } from '@libsql/client'
import { testUtils } from 'better-auth/plugins'
import { createAuth } from '../../src/lib/auth.js'

/**
 * Real Google sign-in can't run in a test, so this mints the same thing the
 * Google callback would leave behind — a Better Auth user plus a signed session
 * cookie — against the same auth.db and secret the dev server uses.
 *
 * testUtils is added only to this instance, never to the app's.
 */
const auth = createAuth([testUtils()])

/*
 * content.db is read and written with plain SQL rather than through getPayload:
 * booting Payload here runs its dev push against the same file the dev server
 * already pushed, and the two race on the schema.
 */
const content = createClient({ url: process.env.DATABASE_URL || 'file:./content.db' })

export async function eventSlugs(): Promise<string[]> {
  const { rows } = await content.execute('SELECT slug FROM events ORDER BY date')
  return rows.map((r) => String(r.slug))
}

async function helpers() {
  return (await auth.$context).test
}

export async function createMember(email: string, name = 'Test Member') {
  const t = await helpers()
  const user = await t.saveUser(t.createUser({ email, name, emailVerified: true }))
  const cookies = await t.getCookies({ userId: user.id, domain: 'localhost' })
  return { id: user.id, cookies }
}

export async function removeMember(id: string) {
  const t = await helpers()
  await t.deleteUser(id).catch(() => {})
  await content.execute({ sql: 'DELETE FROM members WHERE auth_id = ?', args: [id] })
}

export async function authUserExists(id: string): Promise<boolean> {
  const ctx = await auth.$context
  return Boolean(await ctx.internalAdapter.findUserById(id))
}

export async function memberLists(id: string): Promise<{ saved: string[]; going: string[] } | null> {
  const { rows } = await content.execute({
    sql: 'SELECT saved, going FROM members WHERE auth_id = ?',
    args: [id],
  })
  if (!rows[0]) return null
  return { saved: JSON.parse(String(rows[0].saved)), going: JSON.parse(String(rows[0].going)) }
}

export async function setMemberLists(id: string, saved: string[], going: string[] = []) {
  const args = [JSON.stringify(saved), JSON.stringify(going), id]
  const { rowsAffected } = await content.execute({
    sql: 'UPDATE members SET saved = ?, going = ? WHERE auth_id = ?',
    args,
  })
  if (!rowsAffected) {
    await content.execute({ sql: 'INSERT INTO members (saved, going, auth_id) VALUES (?, ?, ?)', args })
  }
}
