'use client'

import { useActionState, useRef, useState } from 'react'
import { sendRequest, type FormState } from './actions'
import type { Lang } from '../i18n'
import { REQUEST_KINDS, type RequestKind } from '../lib/requestKinds'
import { requestCopy, type RequestCopy } from '../lib/requestCopy'
import s from './request.module.css'
import chrome from './chrome.module.css'

export type Option = { slug: string; label: string }

const initial: FormState = { ok: false }

const ICON: Record<RequestKind, string> = {
  listing: '/assets/icons/map-pin.svg',
  event: '/assets/icons/calendar.svg',
  interview: '/assets/icons/mic.svg',
  story: '/assets/icons/newspaper.svg',
  shoutout: '/assets/icons/cake.svg',
}

/**
 * Each kind's form, as data. `label` and `ph` are keys into the copy's `f`
 * table. Every kind asks for a name (`business`) and a way back (`phone`)
 * because every row in the inbox needs both; the rest is only what that kind
 * of request can't do without. The server action enforces the same minimum.
 */
type Field = {
  name: string
  type: 'text' | 'link' | 'textarea' | 'cities' | 'categories' | 'consent'
  label: string
  ph?: string
  required?: boolean
  full?: boolean
}

const FIELDS: Record<RequestKind, Field[]> = {
  listing: [
    { name: 'business', type: 'text', label: 'businessName', ph: 'phBusiness', required: true },
    { name: 'owner', type: 'text', label: 'yourName', ph: 'phName' },
    { name: 'city', type: 'cities', label: 'city', required: true },
    { name: 'category', type: 'categories', label: 'category', required: true },
    { name: 'phone', type: 'text', label: 'contact', ph: 'phContact', required: true, full: true },
    { name: 'story', type: 'textarea', label: 'listingStory', ph: 'phListingStory' },
  ],
  event: [
    { name: 'business', type: 'text', label: 'eventName', ph: 'phEventName', required: true, full: true },
    { name: 'eventWhen', type: 'text', label: 'when', ph: 'phWhen', required: true },
    { name: 'venue', type: 'text', label: 'where', ph: 'phWhere' },
    { name: 'city', type: 'cities', label: 'city' },
    { name: 'link', type: 'link', label: 'eventLink', ph: 'phLink', full: true },
    { name: 'story', type: 'textarea', label: 'eventDetails', ph: 'phEventDetails' },
    { name: 'owner', type: 'text', label: 'yourName', ph: 'phName' },
    { name: 'phone', type: 'text', label: 'contact', ph: 'phContact', required: true },
  ],
  interview: [
    { name: 'owner', type: 'text', label: 'yourName', ph: 'phName', required: true },
    { name: 'business', type: 'text', label: 'whatYouDo', ph: 'phWhatYouDo', required: true },
    { name: 'city', type: 'cities', label: 'city' },
    { name: 'story', type: 'textarea', label: 'talkAbout', ph: 'phTalkAbout', required: true },
    { name: 'link', type: 'link', label: 'profileLink', ph: 'phLink' },
    { name: 'phone', type: 'text', label: 'contact', ph: 'phContact', required: true },
  ],
  story: [
    { name: 'business', type: 'text', label: 'storyLine', ph: 'phStoryLine', required: true, full: true },
    { name: 'story', type: 'textarea', label: 'storyMore', ph: 'phStoryMore', required: true },
    { name: 'venue', type: 'text', label: 'storyWhere', ph: 'phStoryWhere' },
    { name: 'link', type: 'link', label: 'sourceLink', ph: 'phLink' },
    { name: 'city', type: 'cities', label: 'city' },
    { name: 'owner', type: 'text', label: 'yourName', ph: 'phName' },
    { name: 'phone', type: 'text', label: 'contact', ph: 'phContact', required: true },
  ],
  // A shoutout puts someone else's name and birthday on public socials, so the
  // person asking has to say they agreed. The owner still approves every post.
  shoutout: [
    { name: 'business', type: 'text', label: 'bdayName', ph: 'phBdayName', required: true },
    { name: 'eventWhen', type: 'text', label: 'bdayDate', ph: 'phBdayDate', required: true },
    { name: 'city', type: 'cities', label: 'city' },
    { name: 'story', type: 'textarea', label: 'bdayNote', ph: 'phBdayNote' },
    { name: 'link', type: 'link', label: 'bdayInsta', ph: 'phBdayInsta' },
    { name: 'owner', type: 'text', label: 'yourName', ph: 'phName', required: true },
    { name: 'phone', type: 'text', label: 'contact', ph: 'phContact', required: true },
    { name: 'consent', type: 'consent', label: 'bdayConsent', required: true },
  ],
}

/** An ink tab, so the label holds up on the page's dotted pink background too. */
const stepLabel = {
  display: 'inline-block',
  background: 'var(--ink)',
  color: 'var(--yellow)',
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: '2px',
  padding: '6px 10px',
  margin: '0 0 14px',
} as const

/**
 * The "list your spot" page's request hub: four choice cards — add a business,
 * add an event, get interviewed, pitch a story — and below them the short form
 * for whichever one is picked.
 *
 * The pick is mirrored into `?type=` (without a navigation) so any page can
 * link straight to one form, e.g. the events board to `?type=event`.
 */
export function RequestHub({
  lang,
  initialKind,
  cities,
  categories,
}: {
  lang: Lang
  initialKind: RequestKind | null
  cities: Option[]
  categories: Option[]
}) {
  const c = requestCopy(lang)
  const [kind, setKind] = useState<RequestKind | null>(initialKind)
  // Bumped by "send another" so the form remounts with fresh action state.
  const [round, setRound] = useState(0)
  const formRef = useRef<HTMLElement>(null)

  function pick(k: RequestKind) {
    setKind(k)
    const url = new URL(window.location.href)
    url.searchParams.set('type', k)
    window.history.replaceState(null, '', url)
    // On a phone the form is a screen below the cards; take them to it.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
    )
  }

  return (
    <>
      <section aria-labelledby="req-step1">
        <h2 id="req-step1" style={stepLabel}>
          {c.step1}
        </h2>
        <div
          style={{
            display: 'grid',
            // Five across on a wide screen (the hub's width fits them), so no
            // card is left alone on a second row.
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))',
            gap: 'clamp(12px,2vw,16px)',
          }}
        >
          {REQUEST_KINDS.map((k) => {
            const on = kind === k
            const kc = c.kinds[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => pick(k)}
                aria-pressed={on}
                className={s.choice}
                style={{
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'var(--ink)',
                  background: on ? 'var(--yellow)' : '#fff',
                  border: '4px solid var(--ink)',
                  // Ink, not pink: these sit on the page's pink background.
                  boxShadow: '6px 6px 0 var(--ink)',
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                  <span
                    style={{
                      width: 46,
                      height: 46,
                      flex: '0 0 auto',
                      background: 'var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ICON[k]} alt="" style={{ width: 24, height: 24, display: 'block' }} />
                  </span>
                  <span style={{ fontFamily: 'var(--display)', fontSize: 21, lineHeight: 1.05 }}>
                    {kc.title}
                  </span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{kc.blurb}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '1.2px',
                    textTransform: 'uppercase',
                    color: 'var(--magenta)',
                  }}
                >
                  {kc.forWho}
                </span>
                {on ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: -14,
                      right: -10,
                      width: 30,
                      height: 30,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--pink)',
                      color: 'var(--cream)',
                      border: '3px solid var(--ink)',
                      fontWeight: 800,
                      fontSize: 16,
                    }}
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </section>

      <section
        ref={formRef}
        aria-labelledby="req-step2"
        style={{
          // Clears the sticky nav and its ticker when scrolled into view.
          scrollMarginTop: 130,
          background: 'var(--grad-cream)',
          border: '4px solid var(--ink)',
          boxShadow: '8px 8px 0 var(--ink)',
          padding: 'clamp(16px,3.5vw,24px)',
        }}
      >
        <h2 id="req-step2" style={stepLabel}>
          {c.step2}
        </h2>
        {kind ? (
          <RequestForm
            key={`${kind}-${round}`}
            lang={lang}
            kind={kind}
            c={c}
            cities={cities}
            categories={categories}
            onAnother={() => setRound((r) => r + 1)}
          />
        ) : (
          <p
            style={{
              margin: 0,
              padding: '22px 16px',
              border: '3px dashed var(--ink)',
              fontWeight: 700,
              fontSize: 15,
              textAlign: 'center',
            }}
          >
            {c.pickHint}
          </p>
        )}
      </section>
    </>
  )
}

const fieldStyle = {
  fontSize: 15,
  fontWeight: 600,
  padding: 12,
  border: '3px solid var(--ink)',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
} as const

const labelStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  // A label that wraps to two lines must not push its input below its neighbour's.
  justifyContent: 'space-between',
  gap: 6,
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: '1.4px',
}

function RequestForm({
  lang,
  kind,
  c,
  cities,
  categories,
  onAnother,
}: {
  lang: Lang
  kind: RequestKind
  c: RequestCopy
  cities: Option[]
  categories: Option[]
  onAnother: () => void
}) {
  const [state, formAction, pending] = useActionState(sendRequest, initial)
  const kc = c.kinds[kind]

  if (state.ok) {
    return (
      <div
        role="status"
        style={{
          background: 'var(--yellow)',
          border: '4px solid var(--ink)',
          boxShadow: '6px 6px 0 var(--ink)',
          padding: 'clamp(18px,3.5vw,26px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <div style={{ fontFamily: 'var(--display)', fontSize: 'clamp(22px,5vw,30px)', lineHeight: 1.05 }}>
          {kc.sentH}
        </div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.5, maxWidth: '56ch' }}>
          {kc.sentP}
        </p>
        <button
          type="button"
          onClick={onAnother}
          className={chrome.chipPress}
          style={{
            cursor: 'pointer',
            marginTop: 4,
            fontFamily: 'var(--display)',
            fontSize: 15,
            padding: '9px 14px 7px',
            border: '3px solid var(--ink)',
            background: '#fff',
            color: 'var(--ink)',
            boxShadow: '3px 3px 0 var(--ink)',
          }}
        >
          {c.another}
        </button>
      </div>
    )
  }

  const star = (f: Field) =>
    f.required ? (
      <span aria-hidden="true" style={{ color: 'var(--pink)' }}>
        {' '}
        *
      </span>
    ) : null

  return (
    <form action={formAction}>
      <div
        style={{
          display: 'inline-block',
          margin: '0 0 16px',
          background: 'var(--ink)',
          color: 'var(--yellow)',
          fontFamily: 'var(--display)',
          fontSize: 22,
          padding: '7px 12px 4px',
        }}
      >
        {kc.heading}
      </div>
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="kind" value={kind} />
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
        {FIELDS[kind].map((f) => {
          const label = c.f[f.label]
          const ph = f.ph ? c.f[f.ph] : undefined

          if (f.type === 'consent') {
            return (
              <label
                key={f.name}
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontWeight: 700,
                  fontSize: 14,
                  lineHeight: 1.4,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  name={f.name}
                  value="yes"
                  required={f.required}
                  style={{ width: 22, height: 22, margin: 0, flex: '0 0 auto', accentColor: 'var(--pink)' }}
                />
                <span>
                  {label}
                  {star(f)}
                </span>
              </label>
            )
          }

          if (f.type === 'cities' || f.type === 'categories') {
            const opts = f.type === 'cities' ? cities : categories
            return (
              <fieldset
                key={f.name}
                style={{ gridColumn: '1 / -1', border: 0, margin: 0, padding: 0, minWidth: 0 }}
              >
                <legend style={{ ...labelStyle, padding: 0, marginBottom: 8 }}>
                  <span>
                    {label}
                    {star(f)}
                  </span>
                </legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {opts.map((o) => (
                    <label key={o.slug} className={s.pill}>
                      <input type="radio" name={f.name} value={o.slug} required={f.required} />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          }

          return (
            <label
              key={f.name}
              style={{ ...labelStyle, gridColumn: f.full || f.type === 'textarea' ? '1 / -1' : undefined }}
            >
              <span>
                {label}
                {star(f)}
              </span>
              {f.type === 'textarea' ? (
                <textarea
                  name={f.name}
                  rows={4}
                  required={f.required}
                  placeholder={ph}
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
              ) : (
                <input
                  name={f.name}
                  required={f.required}
                  placeholder={ph}
                  // Not type="url": people paste "instagram.com/…" without the
                  // scheme, and the browser would refuse it.
                  inputMode={f.type === 'link' ? 'url' : undefined}
                  autoComplete={f.name === 'owner' ? 'name' : undefined}
                  style={fieldStyle}
                />
              )}
            </label>
          )
        })}
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
        {kc.submit}
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
          {c.error}
        </div>
      ) : null}
    </form>
  )
}
