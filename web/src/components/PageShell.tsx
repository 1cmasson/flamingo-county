import React from 'react'

/**
 * The wrapper every content page shares: body type and the fixed
 * halftone-dot-over-sunset backdrop that sits behind everything at z-index -1.
 * Identical markup on Home, City, Business, Events and Story in the source.
 *
 * The source's `min-height:100vh` is NOT here. In the `.dc.html` files that rule
 * sits on a div that also wraps the nav and the footer; under the App Router
 * those are siblings of this component, so keeping it here made every page
 * `nav + 100vh + footer` tall and opened a gap between the content and the
 * footer on anything shorter than the viewport. It lives on the layout wrapper
 * instead, which is the element that actually corresponds to the source's.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--body)',
        color: 'var(--ink)',
        paddingBottom: 0,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: -1,
          backgroundColor: 'var(--pink)',
          backgroundImage:
            'radial-gradient(#0C0F14 1.7px, transparent 1.8px), linear-gradient(172deg, #FF2E88 0%, #FF4A97 34%, #FF74AD 58%, #FFB35C 82%, #FFD400 100%)',
          backgroundSize: '15px 15px, 100% 100%',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  )
}
