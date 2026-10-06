'use client'

import type * as React from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { CityMapModel } from '../lib/citymap'
import type { LiveSnapshot } from '../lib/live'
import { busSentence, useAgo, usePoll, type BusWordsCopy } from './LiveTransit'
import cm from './citymap.module.css'

/**
 * Hialeah with its two free lines, animated: the city settles in, the lines
 * draw themselves out from their first stop, the spots pop on, and then the
 * buses run.
 *
 * The buses are an illustration of the timetable, not live positions — the
 * caption says so. Their count on each line is the real one (round trip ÷
 * minutes between buses), so a glance shows how often a bus comes, which is
 * the thing the page is trying to say. When the city's hours say the buses
 * aren't out, they sit parked at the end of the line instead.
 *
 * Motion runs only while the map is on screen: an IntersectionObserver starts
 * the draw-in when it first appears and pauses the SMIL clock whenever it
 * leaves. Reduced motion gets the finished map with no buses moving.
 */
export function CityMap({
  model,
  running,
  copy,
  busWords,
}: {
  model: CityMapModel
  running: boolean
  busWords: BusWordsCopy
  copy: {
    title: string
    status: string
    note: string
    spots: string
    rail: string
    liveStatus: string
    liveNote: string
    late: string
    onTime: string
    tapBus: string
    close: string
  }
}) {
  const id = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [play, setPlay] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.pauseAnimations()
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setPlay(true)
          svg.unpauseAnimations()
        } else svg.pauseAnimations()
      },
      { threshold: 0.25 },
    )
    io.observe(svg)
    return () => io.disconnect()
  }, [])

  // Live positions once the map has been seen; the illustration until (and
  // unless) the feed answers with buses on the road.
  const { data: liveData } = usePoll<LiveSnapshot>(play ? '/api/transit/live' : null, 15_000)
  const ago = useAgo(liveData?.updatedAt ?? null)
  const live = liveData?.ok && liveData.vehicles.length ? liveData.vehicles : null
  const pickedBus = live?.find((b) => b.id === picked) ?? null
  const project = (lat: number, lng: number): [number, number] => {
    const p = model.proj
    return [p.pad + (lng * p.k - p.minX) * p.scale, p.pad + (-lat - p.minY) * p.scale]
  }
  const fillIn = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''))

  const { w, h } = model

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className={cm.frame}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${w} ${h}`}
          // A group, not an image: the buses and spots inside are controls.
          role="group"
          aria-labelledby={`${id}-t`}
          data-play={play ? '' : undefined}
          className={cm.map}
        >
          <title id={`${id}-t`}>{copy.title}</title>
          <defs>
            <clipPath id={`${id}-clip`}>
              <rect width={w} height={h} />
            </clipPath>
            {model.lines.map((l) => (
              <path key={l.slug} id={`${id}-${l.slug}`} d={l.d} />
            ))}
          </defs>

          <g clipPath={`url(#${id}-clip)`}>
            {/* --- the ground --- */}
            <rect width={w} height={h} fill="#eadbbd" />
            <g className={cm.ground}>
              {model.places.map((p) => (
                <path
                  key={p.name}
                  d={p.d}
                  fill={p.home ? '#fffaf0' : '#f5e9d0'}
                  stroke="var(--ink)"
                  strokeWidth={p.home ? 3 : 1.5}
                  strokeDasharray={p.home ? undefined : '5 4'}
                  strokeOpacity={p.home ? 1 : 0.45}
                  strokeLinejoin="round"
                  fillRule="evenodd"
                />
              ))}
              {model.roads
                .filter((r) => r.kind === 'secondary')
                .map((r, i) => (
                  <path key={`s${i}`} d={r.d} fill="none" stroke="var(--ink)" strokeOpacity={0.16} strokeWidth={1.6} strokeLinecap="round" />
                ))}
              {model.roads
                .filter((r) => r.kind === 'primary')
                .map((r, i) => (
                  <path key={`p${i}`} d={r.d} fill="none" stroke="var(--ink)" strokeOpacity={0.3} strokeWidth={3.2} strokeLinecap="round" />
                ))}
              {model.places
                .filter((p) => p.label)
                .map((p) =>
                  p.home ? (
                    <text key={p.name} x={p.label![0]} y={p.label![1]} textAnchor="middle" className={cm.home}>
                      {p.name.toUpperCase()}
                    </text>
                  ) : (
                    <text key={p.name} x={p.label![0]} y={p.label![1]} textAnchor="middle" className={cm.town}>
                      {p.name.toUpperCase()}
                    </text>
                  ),
                )}
              {/* Metrorail: an ink track with a cream dash, the railway look. */}
              <path d={model.rail} fill="none" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
              <path d={model.rail} fill="none" stroke="var(--cream)" strokeWidth={1.8} strokeDasharray="5 5" />
            </g>

            {/* --- the lines, drawn out from the first stop --- */}
            {model.lines.map((l, i) => (
              <g key={l.slug} style={{ '--delay': `${i * 280}ms` } as React.CSSProperties}>
                <path d={l.d} pathLength={1} className={cm.draw} fill="none" stroke="var(--ink)" strokeWidth={11} strokeLinejoin="round" strokeLinecap="round" />
                <path d={l.d} pathLength={1} className={cm.draw} fill="none" stroke={l.color} strokeWidth={5.5} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}

            {model.transfer ? (
              <g className={cm.pop} style={{ '--i': 0 } as React.CSSProperties}>
                <circle cx={model.transfer[0]} cy={model.transfer[1]} r={11} fill="var(--cream)" stroke="var(--ink)" strokeWidth={3} />
                <circle cx={model.transfer[0]} cy={model.transfer[1]} r={5} fill="var(--ink)" />
              </g>
            ) : null}

            {/* --- the buses --- */}
            {live ? (
              <g className={cm.buses}>
                {live.map((b) => {
                  const [x, y] = project(b.lat, b.lng)
                  const line = model.lines.find((l) => l.slug === b.route)
                  const on = b.id === picked
                  const say = busSentence(b, busWords)
                  return (
                    <g
                      key={b.id}
                      className={cm.liveBus}
                      style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` }}
                      role="button"
                      tabIndex={0}
                      aria-label={say}
                      aria-pressed={on}
                      onClick={() => setPicked(on ? null : b.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setPicked(on ? null : b.id)
                        }
                      }}
                    >
                      {/* A thumb-sized target around a dot the eye can find:
                          on a phone the whole city is ~330px wide. */}
                      <circle r={30} fill="transparent" />
                      <g transform={`rotate(${b.bearing})`}>
                        <path d="M0,-30 L9,-19 L-9,-19 Z" fill="var(--ink)" />
                      </g>
                      {on ? <circle r={25} fill="var(--yellow)" stroke="var(--ink)" strokeWidth={3} /> : null}
                      <circle r={18} fill={line?.color ?? 'var(--yellow)'} stroke="var(--ink)" strokeWidth={4} />
                      <text y={7.5} textAnchor="middle" className={cm.busLetter} fill={line?.ink ?? 'var(--ink)'}>
                        {line?.name[0] ?? ''}
                      </text>
                      {b.delayMin >= 2 ? <circle r={6} cx={15} cy={-15} fill="var(--magenta)" stroke="var(--cream)" strokeWidth={2} /> : null}
                    </g>
                  )
                })}
              </g>
            ) : running ? (
              <g className={`${cm.buses} ${cm.moving}`}>
                {model.lines.flatMap((l) =>
                  Array.from({ length: l.buses }, (_, i) => (
                    <g key={`${l.slug}-${i}`}>
                      <Bus color={l.color} />
                      <animateMotion
                        dur={`${l.cycle}s`}
                        begin={`-${((l.cycle / l.buses) * i).toFixed(2)}s`}
                        repeatCount="indefinite"
                        keyPoints="0;1"
                        keyTimes="0;1"
                        calcMode="linear"
                        rotate="auto"
                      >
                        <mpath href={`#${id}-${l.slug}`} />
                      </animateMotion>
                    </g>
                  )),
                )}
              </g>
            ) : (
              <g className={cm.buses}>
                {model.lines.map((l) => (
                  <g key={l.slug} transform={`translate(${l.start[0] + 14} ${l.start[1] + 16})`}>
                    <Bus color={l.color} />
                  </g>
                ))}
              </g>
            )}

            {/* --- the spots: links, labelled on hover and focus --- */}
            {model.spots.map((s, i) => {
              const right = s.x > w * 0.62
              const label = s.name.length > 26 ? `${s.name.slice(0, 25)}…` : s.name
              const lw = label.length * 6.6 + 16
              return (
                <a key={s.href} href={s.href} className={cm.spot} aria-label={s.name}>
                  <g className={cm.pop} style={{ '--i': i + 1 } as React.CSSProperties}>
                    <circle cx={s.x} cy={s.y} r={14} fill="transparent" />
                    <circle cx={s.x} cy={s.y} r={7} fill="var(--yellow)" stroke="var(--ink)" strokeWidth={3} />
                  </g>
                  <g className={cm.tag} transform={`translate(${right ? s.x - 12 - lw : s.x + 12} ${s.y - 12})`}>
                    <rect width={lw} height={24} fill="var(--ink)" />
                    <text x={8} y={16} className={cm.tagText}>
                      {label}
                    </text>
                  </g>
                </a>
              )
            })}

            {/* --- line bullets at the first stop --- */}
            {model.lines.map((l) => (
              <g key={`b-${l.slug}`} className={cm.pop} style={{ '--i': 0 } as React.CSSProperties}>
                <circle cx={l.start[0]} cy={l.start[1]} r={13} fill={l.color} stroke="var(--ink)" strokeWidth={3} />
                <text x={l.start[0]} y={l.start[1] + 5.5} textAnchor="middle" className={cm.bullet} fill={l.ink}>
                  {l.name[0]}
                </text>
              </g>
            ))}
          </g>
        </svg>

        <div className={cm.status} data-live={running || live ? '' : undefined}>
          <span className={`${cm.statusDot} ${live ? cm.statusDotLive : ''}`} />
          {live ? fillIn(copy.liveStatus, { n: live.length, s: ago ?? 0 }) : copy.status}
        </div>
      </div>

      {live ? (
        <div className={cm.busCard} data-on={pickedBus ? '' : undefined}>
          {pickedBus ? (
            <>
              <span>{busSentence(pickedBus, busWords)}</span>
              <button type="button" onClick={() => setPicked(null)} className={cm.busCardClose}>
                {copy.close}
              </button>
            </>
          ) : (
            <span>{copy.tapBus}</span>
          )}
        </div>
      ) : null}

      <figcaption style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', fontSize: 12, fontWeight: 800 }}>
        {model.lines.map((l) => (
          <span key={l.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden="true" style={{ width: 22, height: 7, background: l.color, border: '2px solid var(--cream)' }} />
            {l.name}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--yellow)', border: '2px solid var(--cream)' }} />
          {copy.spots}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span
            aria-hidden="true"
            style={{ width: 22, height: 5, background: 'repeating-linear-gradient(90deg, var(--cream) 0 5px, transparent 5px 9px)', border: '1px solid var(--cream)' }}
          />
          {copy.rail}
        </span>
        <span style={{ flexBasis: '100%', fontWeight: 600, color: '#c9ced4' }}>{live ? copy.liveNote : copy.note}</span>
      </figcaption>
    </figure>
  )
}

/** A bus, centred on its own origin so animateMotion can steer it. */
function Bus({ color }: { color: string }) {
  return (
    <g>
      <rect x={-11} y={-7} width={22} height={14} rx={4} fill={color} stroke="var(--ink)" strokeWidth={2.5} />
      <rect x={-6.5} y={-3} width={13} height={3.5} rx={1} fill="var(--cream)" />
    </g>
  )
}
