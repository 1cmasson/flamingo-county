import React from 'react'
import s from './chrome.module.css'

/**
 * The pink speech bubble that pops under a nav item on hover. Purely
 * presentational and CSS-driven — see chrome.module.css for why this no longer
 * needs a state flag per instance.
 */
export function Tooltip({
  text,
  align = 'center',
  rotate = -1.5,
  children,
}: {
  text: string
  align?: 'center' | 'right'
  /** Each bubble in the source sits at its own angle: -1.5, -1.4, 1.4, -1.6. */
  rotate?: number
  children: React.ReactNode
}) {
  const right = align === 'right'
  return (
    <div className={s.tipWrap} style={{ ['--tip-rot' as string]: `${rotate}deg` }}>
      <div className={`${s.tip} ${right ? s.tipRight : ''}`} aria-hidden="true">
        <div
          style={{
            position: 'relative',
            background: 'var(--pink)',
            border: '3px solid var(--ink)',
            borderRadius: 4,
            boxShadow: '5px 5px 0 var(--ink)',
            padding: '9px 13px 7px',
          }}
        >
          {/* The halftone dot texture over the bubble. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(var(--cream) 1.1px, transparent 1.2px)',
              backgroundSize: '7px 7px',
              opacity: 0.35,
            }}
          />
          {/* Two stacked triangles make the outlined tail. */}
          <div
            style={{
              position: 'absolute',
              top: -12,
              ...(right ? { right: 26 } : { left: '50%', marginLeft: -9 }),
              width: 0,
              height: 0,
              borderLeft: '9px solid transparent',
              borderRight: '9px solid transparent',
              borderBottom: '12px solid var(--ink)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: -7,
              ...(right ? { right: 29 } : { left: '50%', marginLeft: -6 }),
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: '8px solid var(--pink)',
            }}
          />
          <div
            style={{
              position: 'relative',
              fontFamily: 'var(--display)',
              fontSize: 14,
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap',
              color: 'var(--cream)',
            }}
          >
            {text}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}
