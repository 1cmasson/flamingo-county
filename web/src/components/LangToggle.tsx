'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { otherLang, type Lang } from '../i18n'
import s from './chrome.module.css'

const YEAR = 60 * 60 * 24 * 365

/** The US and Spanish flags, drawn in CSS exactly as the source did. */
function Flag({ to, small }: { to: Lang; small?: boolean }) {
  const w = small ? 24 : 26
  const h = small ? 16 : 18
  const stripe = small ? 2.3 : 2.6

  if (to === 'en') {
    return (
      <span
        style={{
          position: 'relative',
          display: 'block',
          width: w,
          height: h,
          border: '2px solid var(--ink)',
          background: `repeating-linear-gradient(#B22234 0 ${stripe}px,#FFF6E5 ${stripe}px ${stripe * 2}px)`,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: small ? 10 : 11,
            height: small ? 8 : 9,
            background: '#2A3D8F',
          }}
        />
      </span>
    )
  }
  return (
    <span
      style={{
        position: 'relative',
        display: 'block',
        width: w,
        height: h,
        border: '2px solid var(--ink)',
        background: 'linear-gradient(#C60B1E 0 25%,#FFC400 25% 75%,#C60B1E 75%)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: small ? 6.5 : 7,
          transform: 'translate(-50%,-50%)',
          width: small ? 4.5 : 5,
          height: small ? 6 : 7,
          border: '1.5px solid #C60B1E',
          borderRadius: '1px 1px 3px 3px',
          background: '#FFC400',
        }}
      />
    </span>
  )
}

/**
 * The EN/ES switch.
 *
 * This is the ONLY thing that writes the language cookie. That rule is
 * load-bearing and carried over from the static site: the resolution chain is
 * query → stored choice → device setting → 'es', so if a *detected* language
 * were ever persisted, the stored value would win from then on and the device
 * setting would be ignored forever. The middleware therefore only reads.
 */
export function LangToggle({ lang, small }: { lang: Lang; small?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const next = otherLang(lang)

  function switchTo() {
    document.cookie = `fc.lang=${next}; path=/; max-age=${YEAR}; samesite=lax`
    // Swap the leading /[lang] segment, keeping the rest of the path and any
    // filters in the query, so the toggle stays on the same view.
    const rest = pathname.replace(/^\/(en|es)(?=\/|$)/, '')
    const q = params.toString()
    router.push(`/${next}${rest}${q ? `?${q}` : ''}`)
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      className={s.chip}
      // The label names the destination, not the current state — the button
      // text is just "EN"/"ES", which alone is ambiguous read aloud.
      aria-label={next === 'en' ? 'Read this in English' : 'Léelo en español'}
      style={{
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: small ? 7 : 8,
        fontFamily: 'var(--display)',
        fontSize: 15,
        padding: small ? '10px 11px 7px' : '8px 12px 6px',
        border: '3px solid var(--ink)',
        borderRadius: 3,
        background: 'var(--grad-cream)',
        color: 'var(--ink)',
        boxShadow: '3px 3px 0 var(--pink)',
      }}
    >
      <Flag to={next} small={small} />
      <span>{next.toUpperCase()}</span>
    </button>
  )
}
