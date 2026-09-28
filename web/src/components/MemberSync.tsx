'use client'

import { useEffect } from 'react'
import { startSync } from '../lib/saved'
import type { Lang } from '../i18n'

/**
 * Starts keeping the saved store in step with the member's account. Rendered
 * once, in the [lang] layout, only when the server found a session — so a
 * signed-out visitor never makes a sync request.
 */
export function MemberSync({ lang }: { lang: Lang }) {
  useEffect(() => {
    void startSync(lang)
  }, [lang])
  return null
}
