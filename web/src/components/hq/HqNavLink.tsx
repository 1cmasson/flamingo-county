'use client'

import { Link, useConfig } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * The HQ collections' `admin.group`. Payload gives each nav group the id
 * `nav-group-<label>` and puts its links in `.nav-group__content`.
 */
const HQ_GROUP = 'HQ'

/**
 * The nav entry for the HQ dashboard, as the first link of the HQ group.
 *
 * Payload builds nav groups only from collections and globals, so a custom
 * view cannot join one by config. This is mounted above the groups
 * (`admin.components.beforeNavLinks`) and renders into a slot it adds at the
 * top of the HQ group's list. A collapsed group only hides that list, so the
 * slot survives collapsing. If the group isn't there (a user who can't see
 * the HQ collections), the link stays where it is mounted.
 */
export function HqNavLink() {
  const pathname = usePathname()
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const href = formatAdminURL({ adminRoute, path: '/hq' })
  const active = pathname === href

  // undefined until the group is looked for, so the link never shows in the
  // wrong place first; null when there is no group to join.
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined)
  useEffect(() => {
    const list = document.querySelector(`#nav-group-${HQ_GROUP} .nav-group__content`)
    if (!list) {
      setSlot(null)
      return
    }
    const el = document.createElement('div')
    el.className = 'hq-nav-link-slot'
    list.prepend(el)
    setSlot(el)
    return () => el.remove()
  }, [])

  const label = (
    <>
      {active && <div className="nav__link-indicator" />}
      <span className="nav__link-label">🦩 HQ dashboard</span>
    </>
  )
  const link = active ? (
    <div className="nav__link" id="nav-hq">
      {label}
    </div>
  ) : (
    <Link className="nav__link" href={href} id="nav-hq" prefetch={false}>
      {label}
    </Link>
  )

  if (slot === undefined) return null
  if (slot) return createPortal(link, slot)
  return <div className="hq-nav-link">{link}</div>
}
