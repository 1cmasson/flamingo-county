import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LANG, detectLang, isLang } from './i18n'

export const LANG_COOKIE = 'fc.lang'

/**
 * Next 16 renamed the middleware file convention to `proxy`.
 *
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
/**
 * Sign-in only trusts the one origin in BETTER_AUTH_URL, and its state cookie
 * lives on the host that started it. A visitor browsing www.flamingocounty.com
 * was refused outright ("Invalid origin"), so www is sent to the bare domain
 * before anything else happens — permanently, and with the path and query kept.
 */
const WWW = 'www.flamingocounty.com'
const CANONICAL = 'flamingocounty.com'

/**
 * AI crawlers and AI-referred visits, one JSON line each to stdout (Railway
 * keeps these in the service logs). This is the raw data for the AEO
 * measurement loop: which engines fetch which pages, and which people arrive
 * from an answer. Nothing identifying is kept — no IP, no cookies.
 *
 * Referrers are undercounted: several assistants strip them. ChatGPT tags its
 * outbound links with utm_source=chatgpt.com, which is matched too.
 */
const AI_BOTS =
  /(GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|anthropic-ai|PerplexityBot|Perplexity-User|Google-Extended|Google-CloudVertexBot|Applebot-Extended|Bytespider|CCBot|Amazonbot|meta-externalagent|DuckAssistBot|MistralAI-User)/i
const AI_REFERRERS = /(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com)/i

function logAiTraffic(req: NextRequest) {
  const ua = req.headers.get('user-agent') ?? ''
  const bot = ua.match(AI_BOTS)?.[1]
  const ref = req.headers.get('referer') ?? ''
  const utm = req.nextUrl.searchParams.get('utm_source') ?? ''
  const source = ref.match(AI_REFERRERS)?.[1] ?? utm.match(AI_REFERRERS)?.[1]
  if (!bot && !source) return
  console.log(
    JSON.stringify({ aeo: bot ? 'bot' : 'referral', who: bot ?? source, path: req.nextUrl.pathname, t: new Date().toISOString() }),
  )
}

export function proxy(req: NextRequest) {
  logAiTraffic(req)
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(':')[0]
  if (host === WWW) {
    const url = req.nextUrl.clone()
    url.protocol = 'https:'
    url.host = CANONICAL
    url.port = ''
    return NextResponse.redirect(url, 308)
  }

  const { pathname, searchParams } = req.nextUrl

  const first = pathname.split('/')[1]
  if (isLang(first)) return NextResponse.next()
  // `/go/...` tracking links (src/app/go) count the click and redirect on
  // themselves; the landing page they send to comes back through here and gets
  // its language then. Without this they would be sent to `/es/go/...`, a 404.
  if (first === 'go') return NextResponse.next()

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
