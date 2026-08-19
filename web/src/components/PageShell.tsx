import React from 'react'

/**
 * The wrapper every content page shares: full-height column, body type, and the
 * fixed halftone-dot-over-sunset backdrop that sits behind everything at z-index
 * -1. Identical markup on Home, City, Business, Events and Story in the source.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
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
