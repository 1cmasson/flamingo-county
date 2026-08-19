'use server'

import { getPayload } from 'payload'
import config from '../payload.config'
import type { Lang } from '../i18n'

export type FormState = { ok: boolean; error?: string }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/**
 * Newsletter signup. Replaces `netlifySubmit('newsletter', …)`, which posted a
 * urlencoded body to `/` and relied on Netlify's deploy-time form scan.
 *
 * An address that already exists is reported as success rather than as a unique
 * constraint error — resubscribing is not a failure the visitor should see.
 */
export async function subscribe(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim()
  const lang = String(formData.get('lang') ?? 'es') as Lang

  // Honeypot — the old form carried one via netlify-honeypot="bot-field".
  if (String(formData.get('bot-field') ?? '')) return { ok: true }

  if (!EMAIL.test(email)) return { ok: false, error: 'invalid-email' }

  const payload = await getPayload({ config })
  const existing = await payload.find({
    collection: 'subscribers',
    where: { email: { equals: email } },
    limit: 1,
  })
  if (existing.docs.length) return { ok: true }

  await payload.create({ collection: 'subscribers', data: { email, lang } })
  return { ok: true }
}

/**
 * "List your spot" submission. Replaces the second Netlify form.
 *
 * The old form validated only that business and phone were non-empty; kept as
 * is, because tightening it here would silently reject people the current site
 * accepts.
 */
export async function requestListing(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get('bot-field') ?? '')) return { ok: true }

  const business = String(formData.get('business') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  if (!business || !phone) return { ok: false, error: 'missing-required' }

  const email = String(formData.get('email') ?? '').trim()
  const citySlug = String(formData.get('city') ?? '').trim()
  const categorySlug = String(formData.get('category') ?? '').trim()

  const payload = await getPayload({ config })

  // The old form submitted the <select>'s translated label, so the same choice
  // arrived as different strings depending on the visitor's language. Resolving
  // slugs to ids here makes it language-independent.
  const cityId = citySlug
    ? (await payload.find({ collection: 'cities', where: { slug: { equals: citySlug } }, limit: 1 }))
        .docs[0]?.id
    : undefined
  const categoryId = categorySlug
    ? (
        await payload.find({
          collection: 'categories',
          where: { slug: { equals: categorySlug } },
          limit: 1,
        })
      ).docs[0]?.id
    : undefined

  await payload.create({
    collection: 'listing-requests',
    data: {
      business,
      phone,
      owner: String(formData.get('owner') ?? '').trim() || undefined,
      email: email || undefined,
      story: String(formData.get('story') ?? '').trim() || undefined,
      city: cityId,
      category: categoryId,
      lang: String(formData.get('lang') ?? 'es') as Lang,
      status: 'new',
    },
  })
  return { ok: true }
}
