'use client'

import { useActionState } from 'react'
import { subscribe, type FormState } from './actions'
import type { Lang } from '../i18n'

const initial: FormState = { ok: false }

/**
 * The newsletter island. Everything around it in the footer is server-rendered;
 * this is the only part that needs state.
 *
 * The static site swapped the whole block for a thank-you on submit, so that
 * behaviour is preserved rather than showing an inline confirmation beside a
 * still-filled input.
 */
export function NewsletterForm({
  lang,
  t,
}: {
  lang: Lang
  t: { ph: string; btn: string; fine: string; thanks: string }
}) {
  const [state, formAction, pending] = useActionState(subscribe, initial)

  if (state.ok) {
    return (
      <div
        style={{
          background: 'var(--yellow)',
          border: '4px solid var(--cream)',
          boxShadow: '5px 5px 0 var(--cyan)',
          padding: 14,
          fontFamily: 'var(--display)',
          fontSize: 'clamp(17px,4.2vw,21px)',
          lineHeight: 1.12,
          color: 'var(--ink)',
        }}
      >
        {t.thanks}
      </div>
    )
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <input type="hidden" name="lang" value={lang} />
      <p hidden>
        <label>
          Skip this: <input name="bot-field" tabIndex={-1} autoComplete="off" />
        </label>
      </p>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
        <input
          name="email"
          type="email"
          required
          placeholder={t.ph}
          aria-label={t.ph}
          aria-invalid={state.error === 'invalid-email' || undefined}
          style={{
            flex: '0 1 auto',
            width: '50%',
            minWidth: 0,
            fontSize: 15,
            fontWeight: 600,
            padding: '12px 13px',
            border: '4px solid var(--cream)',
            background: 'var(--grad-cream)',
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{
            cursor: 'pointer',
            fontFamily: 'var(--display)',
            fontSize: 16,
            padding: '12px 17px 9px',
            border: '4px solid var(--cream)',
            background: 'var(--pink)',
            color: 'var(--cream)',
            boxShadow: '4px 4px 0 var(--cyan)',
            opacity: pending ? 0.7 : 1,
          }}
        >
          {t.btn}
        </button>
      </div>
      <div
        style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1.4px', color: 'var(--cyan)' }}
      >
        {t.fine}
      </div>
    </form>
  )
}
