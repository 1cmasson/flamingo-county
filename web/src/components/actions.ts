'use server'

import { getPayload } from 'payload'
import config from '../payload.config'
import type { Lang } from '../i18n'
import { isRequestKind, type RequestKind } from '../lib/requestKinds'
import { sendRequestConfirmation } from '../lib/requestEmail'
import { emailConfigured } from '../lib/resend'

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
 * A request from the "list your spot" hub: a listing, an event, an interview or
 * a story pitch (`kind`). Replaces the second Netlify form.
 *
 * Every kind needs a name and a way to reach the person. Interviews and story
 * pitches are nothing without the story, so those require it too. A listing
 * still requires only what the old form did — tightening it would silently
 * reject people the site used to accept.
 */
export async function sendRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  if (String(formData.get('bot-field') ?? '')) return { ok: true }

  const rawKind = formData.get('kind')
  const kind: RequestKind = isRequestKind(rawKind) ? rawKind : 'listing'
  const text = (name: string) => String(formData.get(name) ?? '').trim()

  const business = text('business')
  const phone = text('phone')
  const story = text('story')
  if (!business || !phone) return { ok: false, error: 'missing-required' }
  if ((kind === 'interview' || kind === 'story') && !story) return { ok: false, error: 'missing-required' }
  if (kind === 'event' && !text('eventWhen')) return { ok: false, error: 'missing-required' }

  // The form has one "phone or email" box, saved as `phone` either way (it is
  // the required column). When it is an email, it goes in `email` too, so the
  // admin can tell them apart and the visitor gets a confirmation.
  const email = text('email') || (EMAIL.test(phone) ? phone : '')
  const lang: Lang = text('lang') === 'en' ? 'en' : 'es'
  const citySlug = String(formData.get('city') ?? '').trim()
  // Only a listing has a category; ignore one smuggled in on another kind.
  const categorySlug = kind === 'listing' ? text('category') : ''

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
      kind,
      business,
      phone,
      owner: text('owner') || undefined,
      email: email || undefined,
      story: story || undefined,
      eventWhen: text('eventWhen') || undefined,
      venue: text('venue') || undefined,
      link: text('link') || undefined,
      city: cityId,
      category: categoryId,
      lang,
      status: 'new',
    },
  })

  // Best effort: the request is saved and the owner pinged already, so a mail
  // failure is logged, never shown — the visitor did nothing wrong.
  if (email && emailConfigured()) {
    try {
      await sendRequestConfirmation({
        kind,
        lang,
        to: email,
        name: text('owner') || undefined,
        title: business,
        when: text('eventWhen') || undefined,
        where: text('venue') || undefined,
        link: text('link') || undefined,
      })
    } catch (err) {
      console.error('[request] confirmation email failed', err)
    }
  }
  return { ok: true }
}
