'use client'

import { Link, useConfig } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'

/**
 * The nav entry for the HQ dashboard. Payload builds nav groups only from
 * collections and globals, so a custom view cannot join the HQ group; this
 * sits above the groups instead (`admin.components.beforeNavLinks`), styled as
 * one of Payload's own links.
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

  const label = (
    <>
      {active && <div className="nav__link-indicator" />}
      <span className="nav__link-label">🦩 HQ dashboard</span>
    </>
  )

  return (
    <div className="hq-nav-link">
      {active ? (
        <div className="nav__link" id="nav-hq">
          {label}
        </div>
      ) : (
        <Link className="nav__link" href={href} id="nav-hq" prefetch={false}>
          {label}
        </Link>
      )}
    </div>
  )
}
