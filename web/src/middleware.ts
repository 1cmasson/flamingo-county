import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LANG, detectLang, isLang } from './i18n'

export const LANG_COOKIE = 'fc.lang'
/** Lets the layout know which page is rendering, for the nav's active state. */
export const PATH_HEADER = 'x-fc-pathname'

/**
 * Resolves the language for URLs that carry no /[lang] prefix and redirects to
 * one that does. Mirrors the chain documented in the site README, in order:
 *
 *   1. ?lang=en|es          — shared links keep their language
 *   2. the fc.lang cookie   — written ONLY by the EN/ES toggle
 *   3. Accept-Language      — the device's own setting
 *   4. 'es'
 *
 * Step 3 must never be persisted. The static site made that mistake impossible
 * by writing localStorage only from setLang(); the same rule applies here. If a
 * detected language were written to the cookie, step 2 would win on every later
 * request and the device setting would be ignored permanently. So this handler
 * only ever *reads* the cookie — the toggle is what writes it.
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  const first = pathname.split('/')[1]
  if (isLang(first)) {
    // Server components cannot see the current path, and the nav lives in the
    // layout, so pass it down as a request header for the active-state logic.
    const headers = new Headers(req.headers)
    headers.set(PATH_HEADER, pathname)
    return NextResponse.next({ request: { headers } })
  }

  const cookie = req.cookies.get(LANG_COOKIE)?.value
  const fromQuery = searchParams.get('lang')
  const lang =
    (isLang(fromQuery ?? undefined) ? (fromQuery as 'en' | 'es') : undefined) ??
    (isLang(cookie) ? (cookie as 'en' | 'es') : undefined) ??
    detectLang(req.headers.get('accept-language')) ??
    DEFAULT_LANG

  const url = req.nextUrl.clone()
  url.pathname = `/${lang}${pathname === '/' ? '' : pathname}`
  url.searchParams.delete('lang')
  return NextResponse.redirect(url)
}

export const config = {
  // Everything except Payload's admin/API, Next internals and static files.
  matcher: ['/((?!admin|api|_next|favicon|.*\\.[\\w]+$).*)'],
}
