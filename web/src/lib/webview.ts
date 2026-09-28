/**
 * Recognises the in-app browsers Google refuses to sign in from
 * (`Error 403: disallowed_useragent`), so My Week can offer "open this in your
 * browser" instead of a button that dead-ends on Google's error page.
 *
 * A miss is harmless — the visitor sees Google's error, which is what they
 * would have seen with no detection at all. So this errs towards naming only
 * apps whose user agents say so unambiguously. When a new one turns up in the
 * wild, add its token here and a case to tests/int/webview.int.spec.ts.
 *
 * Deliberately no generic iOS WKWebView sniffing: an iPhone home-screen web app
 * has a similar user agent, and Google does allow sign-in there.
 */
export type Webview = { app: string; os: 'ios' | 'android' | 'other' }

const APPS: [RegExp, string][] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/, 'Facebook'],
  [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
  [/\bLine\//, 'LINE'],
  [/Snapchat/i, 'Snapchat'],
  [/LinkedInApp/i, 'LinkedIn'],
]

export function detectWebview(ua: string | null | undefined): Webview | null {
  if (!ua) return null
  const os = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other'
  for (const [re, app] of APPS) if (re.test(ua)) return { app, os }
  // Android's system WebView marks itself `; wv)` — any app embedding it.
  if (os === 'android' && /; wv\)/.test(ua)) return { app: '', os }
  return null
}

/**
 * An Android intent URL that asks the system to open `url` in Chrome. Most
 * Android in-app browsers honour it; iOS has no equivalent.
 */
export function chromeIntent(url: string): string {
  const u = new URL(url)
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;end`
}
