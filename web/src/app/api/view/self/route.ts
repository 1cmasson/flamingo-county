import { selfCookie } from '../../../../lib/visits'

/**
 * "Don't count this device" for the site's visit counter (lib/visits.ts).
 * The owner opens `/api/view/self` once on each phone and laptop they check
 * the site from; `?off` undoes it. It only ever affects the browser that
 * opens it, so it needs no sign-in.
 */
export function GET(req: Request) {
  const on = !new URL(req.url).searchParams.has('off')
  const text = on
    ? 'Listo: este dispositivo ya no cuenta en las visitas de Flamingo County. / Done: this device is no longer counted.'
    : 'Este dispositivo vuelve a contar. / This device is counted again.'
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Flamingo County</title><body style="font:16px/1.5 system-ui,sans-serif;padding:24px;max-width:32rem"><p>${text}</p><p><a href="/es">flamingocounty.com</a></p></body>`
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': selfCookie(on) },
  })
}
