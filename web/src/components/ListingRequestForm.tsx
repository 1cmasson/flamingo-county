'use client'

import { useActionState } from 'react'
import { requestListing, type FormState } from './actions'
import type { Lang } from '../i18n'

const initial: FormState = { ok: false }

const field = {
  fontSize: 15,
  fontWeight: 600,
  padding: 12,
  border: '3px solid var(--ink)',
  background: '#fff',
  outline: 'none',
} as const

const label = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: '1.4px',
}

export type Option = { slug: string; label: string }

/**
 * The "claim your listing" form.
 *
 * The city and category selects carry **slugs** as option values with the
 * translated names as their visible text. The old form had no values at all, so
 * it submitted whatever the option displayed — meaning the same city arrived as
 * "Little Havana" or "La Pequeña Habana" depending on which version of the site
 * the owner happened to be reading. Now the language only affects what they see.
 */
export function ListingRequestForm({
  lang,
  cities,
  categories,
  t,
}: {
  lang: Lang
  cities: Option[]
  categories: Option[]
  t: {
    biz: string
    owner: string
    city: string
    category: string
    phone: string
    story: string
    phName: string
    phStory: string
    submit: string
    error: string
    sentH: string
    sentP: string
  }
}) {
  const [state, formAction, pending] = useActionState(requestListing, initial)

  if (state.ok) {
    return (
      <div
        style={{
          background: 'var(--yellow)',
          border: '4px solid var(--ink)',
          boxShadow: '6px 6px 0 var(--ink)',
          padding: 'clamp(18px,3.5vw,26px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--display)',
            fontSize: 'clamp(22px,5vw,30px)',
            lineHeight: 1.05,
          }}
        >
          {t.sentH}
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, maxWidth: '56ch' }}>
          {t.sentP}
        </p>
      </div>
    )
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="lang" value={lang} />
      <p hidden>
        <label>
          Skip this: <input name="bot-field" tabIndex={-1} autoComplete="off" />
        </label>
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))',
          gap: 14,
        }}
      >
        <label style={label}>
          {t.biz}
          <input name="business" required placeholder="El Gallo Cantina" style={field} />
        </label>
        <label style={label}>
          {t.owner}
          <input name="owner" placeholder={t.phName} style={field} />
        </label>
        <label style={label}>
          {t.city}
          <select name="city" style={field} defaultValue="">
            <option value="" />
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          {t.category}
          <select name="category" style={field} defaultValue="">
            <option value="" />
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>
          {t.phone}
          <input name="phone" required placeholder="(305) 000-0000" style={field} />
        </label>
        <label style={{ ...label, gridColumn: '1 / -1' }}>
          {t.story}
          <textarea
            name="story"
            rows={4}
            placeholder={t.phStory}
            style={{ ...field, resize: 'vertical' }}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{
          cursor: 'pointer',
          marginTop: 18,
          fontFamily: 'var(--display)',
          fontSize: 20,
          padding: '15px 22px 12px',
          border: '4px solid var(--ink)',
          background: 'var(--grad-pink)',
          color: 'var(--cream)',
          boxShadow: '5px 5px 0 var(--ink)',
          opacity: pending ? 0.7 : 1,
        }}
      >
        {t.submit}
      </button>

      {state.error ? (
        <div
          role="alert"
          style={{
            marginTop: 12,
            background: 'var(--ink)',
            color: 'var(--yellow)',
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '1.2px',
            padding: '10px 12px',
          }}
        >
          {t.error}
        </div>
      ) : null}
    </form>
  )
}
