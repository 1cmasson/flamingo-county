import { headers } from 'next/headers'
import { auth } from '../../../../lib/auth'
import { getLists, putLists } from '../../../../lib/members'
import { isLang } from '../../../../i18n'

/**
 * The signed-in member's My Week. GET reads it; PUT replaces both lists whole.
 *
 * Whole-list replace rather than per-slug add/remove: the client already holds
 * the full list, it is tiny, and there is then no merge protocol to get wrong.
 * The cost — two devices tapping in the same second can lose one tap — is fine
 * for a personal list.
 */
async function member() {
  // Bypasses the 5-minute session cookie cache the layout relies on. Here a
  // stale "yes" matters: an account deleted on one phone would still pass for
  // minutes on another, and its next PUT would recreate the members row with
  // the deleted person's name and email.
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  })
  return session?.user ?? null
}

const unauthorized = () => Response.json({ error: 'unauthorized' }, { status: 401 })

export async function GET() {
  const user = await member()
  if (!user) return unauthorized()
  return Response.json(await getLists(user.id), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(req: Request) {
  const user = await member()
  if (!user) return unauthorized()

  let body: { saved?: unknown; going?: unknown; lang?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 })
  }
  if (!Array.isArray(body.saved) || !Array.isArray(body.going)) {
    return Response.json({ error: 'saved and going must be arrays' }, { status: 400 })
  }

  const lang = typeof body.lang === 'string' && isLang(body.lang) ? body.lang : undefined
  const lists = await putLists(
    { authId: user.id, email: user.email, name: user.name },
    { saved: body.saved, going: body.going },
    lang,
  )
  return Response.json(lists, { headers: { 'Cache-Control': 'no-store' } })
}
