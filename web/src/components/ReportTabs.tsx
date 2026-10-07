'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { MapCopy } from '../lib/addressCopy'
import type { LatLng } from '../lib/transit'
import type { LensId } from '../lib/mapLenses'
import s from './address.module.css'

const AddressMap = dynamic(() => import('./AddressMap').then((m) => m.AddressMap), { ssr: false })

/** While the list is being read, fetch the map's code and style in the background. */
function useWarmMap() {
  useEffect(() => {
    const go = () => void import('./AddressMap').then((m) => m.warmMap())
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 4000 })
    else setTimeout(go, 2500)
  }, [])
}

/** Remembers the view in the address bar, so a shared link opens on the same layer. */
function remember(key: string, value: string | null) {
  try {
    const url = new URL(window.location.href)
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
    window.history.replaceState(window.history.state, '', url)
  } catch {
    /* a sandboxed frame may refuse; the view still works */
  }
}

/**
 * LIST or MAP for one address. The list is the page as the server rendered it;
 * the map loads the first time someone opens it, and stays loaded after.
 */
export function ReportTabs({
  at,
  copy,
  version,
  initialView,
  initialLens,
  children,
}: {
  at: LatLng
  copy: MapCopy
  version: string
  initialView: 'list' | 'map'
  initialLens: LensId
  children: React.ReactNode
}) {
  useWarmMap()
  const [view, setView] = useState(initialView)
  const [opened, setOpened] = useState(initialView === 'map')
  const pick = (v: 'list' | 'map') => {
    setView(v)
    if (v === 'map') setOpened(true)
    remember('view', v === 'map' ? 'map' : null)
  }
  return (
    <>
      <div className={`${s.tabs} ${s.noPrint}`} role="tablist">
        <button type="button" role="tab" aria-selected={view === 'list'} className={s.tab} onClick={() => pick('list')}>
          📋 {copy.list}
        </button>
        <button type="button" role="tab" aria-selected={view === 'map'} className={s.tab} onClick={() => pick('map')}>
          🗺️ {copy.map}
        </button>
      </div>
      <div hidden={view !== 'list'} className={s.listPanel}>
        {children}
      </div>
      {opened ? (
        <div hidden={view !== 'map'} className={s.noPrint}>
          <AddressMap at={at} copy={copy} version={version} initialLens={initialLens} onLens={(l) => remember('lens', l)} />
        </div>
      ) : null}
    </>
  )
}

/** The county map on its own, under the search, for when no address is picked yet. */
export function ExploreMap({ copy, version, initialLens }: { copy: MapCopy; version: string; initialLens: LensId }) {
  return (
    <section className={`${s.card} ${s.noPrint}`} aria-labelledby="explore">
      <h2 id="explore" className={s.cardTag} style={{ background: 'var(--cyan)', color: 'var(--ink)' }}>
        🗺️ {copy.explore}
      </h2>
      <p className={s.small}>{copy.exploreLead}</p>
      <AddressMap at={null} copy={copy} version={version} initialLens={initialLens} onLens={(l) => remember('lens', l)} />
    </section>
  )
}
