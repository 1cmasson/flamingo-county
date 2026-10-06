// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { requestEmail } from '@/lib/requestEmail'
import { sendRequest } from '@/components/actions'

describe('request confirmation email', () => {
  it('repeats what they sent, in their language, from the right kind', () => {
    const m = requestEmail({
      kind: 'event',
      lang: 'es',
      to: 'ana@example.com',
      name: 'Ana',
      title: 'Noche de dominó',
      when: 'Sáb 18 oct · 7 PM',
      where: 'Milander Park',
    })
    expect(m.to).toBe('ana@example.com')
    expect(m.subject).toBe('Recibimos tu evento')
    expect(m.text).toContain('Hola, Ana:')
    expect(m.text).toContain('NOMBRE DEL EVENTO: Noche de dominó')
    expect(m.text).toContain('CUÁNDO: Sáb 18 oct · 7 PM')
    expect(m.text).toContain('DÓNDE: Milander Park')
  })

  it('escapes whatever the visitor typed in the HTML part', () => {
    const m = requestEmail({ kind: 'story', lang: 'en', to: 'x@example.com', title: '<script>alert(1)</script>' })
    expect(m.subject).toBe('Thanks for the story tip')
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })
})

describe('sendRequest and the confirmation email', () => {
  let payload: Payload
  const address = `req-email-${Date.now()}@example.com`
  const resendCalls: { to: string[]; text: string }[] = []

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).includes('api.resend.com')) resendCalls.push(JSON.parse(String(init?.body)))
        return Response.json({ ok: true, id: 'x', result: { message_id: 1 } })
      }),
    )
  })

  afterEach(() => vi.clearAllMocks())

  afterAll(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    await payload.delete({ collection: 'listing-requests', where: { email: { equals: address } }, overrideAccess: true })
  })

  const submit = (link: string) => {
    const fd = new FormData()
    fd.set('kind', 'event')
    fd.set('lang', 'en')
    fd.set('business', 'REQ-EMAIL-TEST night')
    fd.set('eventWhen', 'Sat 7 PM')
    fd.set('phone', address)
    fd.set('link', link)
    return sendRequest({ ok: false }, fd)
  }

  it('emails the first request from an address, without the link they gave', async () => {
    expect(await submit('https://spam.example/buy')).toEqual({ ok: true })
    expect(resendCalls).toHaveLength(1)
    expect(resendCalls[0].to).toEqual([address])
    expect(resendCalls[0].text).not.toContain('spam.example')

    const saved = await payload.find({
      collection: 'listing-requests',
      where: { email: { equals: address } },
      overrideAccess: true,
    })
    expect(saved.docs[0]).toMatchObject({ kind: 'event', phone: address, email: address })
  })

  it('saves a second request from the same address but sends nothing', async () => {
    expect(await submit('https://spam.example/again')).toEqual({ ok: true })
    expect(resendCalls).toHaveLength(1)
    const saved = await payload.count({
      collection: 'listing-requests',
      where: { email: { equals: address } },
      overrideAccess: true,
    })
    expect(saved.totalDocs).toBe(2)
  })
})

describe('birthday shoutouts', () => {
  let payload: Payload
  const marker = `SHOUTOUT-TEST ${Date.now()}`

  beforeAll(async () => {
    payload = await getPayload({ config })
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, result: { message_id: 1 } })))
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await payload.delete({ collection: 'listing-requests', where: { business: { equals: marker } }, overrideAccess: true })
  })

  const shoutout = (consent: boolean) => {
    const fd = new FormData()
    fd.set('kind', 'shoutout')
    fd.set('lang', 'es')
    fd.set('business', marker)
    fd.set('eventWhen', '18 de octubre')
    fd.set('owner', 'Nieta')
    fd.set('phone', '305-000-0000')
    if (consent) fd.set('consent', 'yes')
    return sendRequest({ ok: false }, fd)
  }

  it('refuses one without the birthday person’s say-so', async () => {
    expect(await shoutout(false)).toEqual({ ok: false, error: 'missing-required' })
  })

  it('saves one with it, as kind shoutout', async () => {
    expect(await shoutout(true)).toEqual({ ok: true })
    const { docs } = await payload.find({
      collection: 'listing-requests',
      where: { business: { equals: marker } },
      overrideAccess: true,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ kind: 'shoutout', eventWhen: '18 de octubre', owner: 'Nieta' })
  })
})
