/**
 * A modest number of requests a minute per address, for what reaches a free
 * service shared by everyone (Photon): a person searching is fine, a script isn't.
 * In memory, per server: it's politeness, not security.
 */
export function perMinute(max: number) {
  const hits = new Map<string, { at: number; n: number }>()
  return (headers: Headers): boolean => {
    const ip = (headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
    const now = Date.now()
    const h = hits.get(ip)
    if (!h || now - h.at > 60_000) {
      if (hits.size > 5000) hits.clear()
      hits.set(ip, { at: now, n: 1 })
      return true
    }
    h.n++
    return h.n <= max
  }
}
