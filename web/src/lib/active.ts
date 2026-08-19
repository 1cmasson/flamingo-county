import { headers } from 'next/headers'
import { PATH_HEADER } from '../proxy'

export type ActiveSection =
  | 'home'
  | 'city'
  | 'biz'
  | 'events'
  | 'event'
  | 'myweek'
  | 'stories'
  | 'story'
  | 'join'

/**
 * Which section the nav should highlight.
 *
 * The source passed this explicitly per page — `<dc-import name="Nav"
 * active="story">`. Here the nav lives in the layout, which cannot see the
 * current route, so the middleware stamps the pathname onto a request header
 * and this reads it back.
 *
 * Returns the city slug too, since the nav's city tabs highlight independently.
 */
export async function activeSection(): Promise<{ active?: ActiveSection; city?: string }> {
  const path = (await headers()).get(PATH_HEADER) ?? ''
  // Drop the leading /[lang].
  const segs = path.split('/').filter(Boolean).slice(1)

  if (segs.length === 0) return { active: 'home' }

  switch (segs[0]) {
    case 'events':
      return { active: segs[1] ? 'event' : 'events' }
    case 'stories':
      return { active: segs[1] ? 'story' : 'stories' }
    case 'my-week':
      return { active: 'myweek' }
    case 'list-your-spot':
      return { active: 'join' }
    case 'about':
      return {}
    default:
      // Anything else is /[city] or /[city]/[business].
      return { active: segs[1] ? 'biz' : 'city', city: segs[0] }
  }
}
