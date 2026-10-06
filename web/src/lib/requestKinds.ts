/**
 * What a visitor can ask for on the "list your spot" hub. Shared by the page,
 * the server action and the `listing-requests` collection, so it lives on its
 * own: the collection module pulls in server code a client component can't load.
 */
export const REQUEST_KINDS = ['listing', 'event', 'interview', 'story'] as const
export type RequestKind = (typeof REQUEST_KINDS)[number]

export const isRequestKind = (v: unknown): v is RequestKind =>
  typeof v === 'string' && (REQUEST_KINDS as readonly string[]).includes(v)

/** What HQ calls each kind: the ping, the brief and the dashboard. */
export const KIND_LABEL: Record<RequestKind, string> = {
  listing: 'Listing request',
  event: 'Event request',
  interview: 'Interview request',
  story: 'Story pitch',
}

/**
 * "2 new listing requests", or, once there is more than one kind waiting,
 * "3 new requests (2 listing, 1 event)". Rows from before `kind` existed count
 * as listings, which is what they were.
 */
export function describeNewRequests(kinds: (string | null | undefined)[]): string {
  const n = kinds.length
  const by = new Map<RequestKind, number>()
  for (const k of kinds) {
    const kind = isRequestKind(k) ? k : 'listing'
    by.set(kind, (by.get(kind) ?? 0) + 1)
  }
  if (by.size === 1) {
    const [only] = by.keys()
    const word = KIND_LABEL[only].toLowerCase()
    return `${n} new ${word}${n === 1 ? '' : word.endsWith('ch') ? 'es' : 's'}`
  }
  const parts = [...by].map(([k, c]) => `${c} ${k}`)
  return `${n} new requests (${parts.join(', ')})`
}
