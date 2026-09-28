import { getPayload } from 'payload'
import config from '../payload.config'
import type { Lang } from '../i18n'
import type { Member } from '../payload-types'
import { cleanList, keepKnown, type Lists } from './savedLists'

/**
 * Server-side access to a member's saved lists. Every call here has already
 * been authorised by the caller against the Better Auth session, so these use
 * the local API with access control overridden — the `members` collection's
 * own rules are for the admin panel.
 */
async function db() {
  return getPayload({ config })
}

async function findMember(authId: string): Promise<Member | null> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'members',
    where: { authId: { equals: authId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

async function knownEventSlugs(): Promise<Set<string>> {
  const payload = await db()
  const { docs } = await payload.find({
    collection: 'events',
    limit: 0,
    pagination: false,
    depth: 0,
    select: { slug: true },
    overrideAccess: true,
  })
  return new Set(docs.map((d) => d.slug).filter((s): s is string => Boolean(s)))
}

function listsOf(member: Member | null): Lists {
  return { saved: cleanList(member?.saved), going: cleanList(member?.going) }
}

/** The member's lists. A member with no row yet has empty lists. */
export async function getLists(authId: string): Promise<Lists> {
  return listsOf(await findMember(authId))
}

/**
 * Replaces both lists, creating the row on first write. Unknown slugs are
 * dropped here, on the way in, and the cleaned lists are returned so the client
 * can adopt exactly what was stored.
 */
export async function putLists(
  who: { authId: string; email?: string | null; name?: string | null },
  input: { saved: unknown; going: unknown },
  lang?: Lang,
): Promise<Lists> {
  const known = await knownEventSlugs()
  const lists: Lists = {
    saved: keepKnown(cleanList(input.saved), known),
    going: keepKnown(cleanList(input.going), known),
  }

  const payload = await db()
  const existing = await findMember(who.authId)
  const data = {
    ...lists,
    email: who.email ?? undefined,
    name: who.name ?? undefined,
    ...(lang ? { lang } : {}),
  }
  if (existing) {
    await payload.update({
      collection: 'members',
      id: existing.id,
      data,
      overrideAccess: true,
    })
  } else {
    await payload.create({
      collection: 'members',
      data: { authId: who.authId, ...data },
      overrideAccess: true,
    })
  }
  return lists
}

/** Called from Better Auth's afterDelete hook — the account is already gone. */
export async function deleteMember(authId: string): Promise<void> {
  const payload = await db()
  await payload.delete({
    collection: 'members',
    where: { authId: { equals: authId } },
    overrideAccess: true,
  })
}
