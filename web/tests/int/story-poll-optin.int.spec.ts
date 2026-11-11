import { createElement } from 'react'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { StoryPollVote, type PollOptionView } from '@/components/StoryPollVote'
import { pollOptinWhatsApp, storyPollCopy } from '@/lib/storyPollCopy'
import { WHATSAPP_NUMBER } from '@/lib/site'

/**
 * The weekly vote's WhatsApp opt-in box: shown only after this browser has
 * voted and only while the poll is open; a number plus a consent box the
 * visitor must tick, and a small wa.me link marked so the site-wide counter
 * names the tap.
 */

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const options: PollOptionView[] = [
  { key: 'a', title: 'Story A', teaser: null, image: null },
  { key: 'b', title: 'Story B', teaser: null, image: null },
]
const tally = { counts: { a: 3, b: 1 }, total: 4 }

const box = (container: HTMLElement) => container.querySelector('[data-use-tool="poll"]')
const voted = (lang: 'es' | 'en') =>
  render(createElement(StoryPollVote, { slug: 'vota-1', lang, phase: 'open', options, initial: { ...tally, pick: 'a' } }))

describe('the WhatsApp opt-in', () => {
  it('links to our number with the message written, in each language', () => {
    expect(WHATSAPP_NUMBER).toBe('17869774602')
    expect(pollOptinWhatsApp('es')).toBe(`https://wa.me/17869774602?text=${encodeURIComponent('Quiero votar cada semana 🦩')}`)
    expect(pollOptinWhatsApp('en')).toBe(`https://wa.me/17869774602?text=${encodeURIComponent('I want to vote every week 🦩')}`)
  })

  it('shows after a vote while the poll is open: number, consent, button and the counted link', () => {
    const { container, getByRole, getByPlaceholderText } = voted('es')
    const c = storyPollCopy('es')
    expect(box(container)?.getAttribute('data-use-target')).toBe('vota-1')
    expect(getByRole('heading', { name: '¿Quieres votar cada semana?' })).toBeTruthy()
    expect(box(container)?.textContent).toContain(c.optinText)
    expect(getByPlaceholderText('Tu número de WhatsApp').getAttribute('type')).toBe('tel')
    expect(getByRole('checkbox', { name: c.optinConsent })).toBeTruthy()
    expect(getByRole('button', { name: 'Avísame' })).toBeTruthy()
    const link = getByRole('link', { name: 'o escríbenos por WhatsApp' })
    expect(link.getAttribute('href')).toBe(pollOptinWhatsApp('es'))
    expect(link.getAttribute('data-use')).toBe('whatsapp_optin')
  })

  it('asks for the box to be ticked before sending anything', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { getByRole, getByPlaceholderText, findByRole } = voted('en')
    fireEvent.change(getByPlaceholderText('Your WhatsApp number'), { target: { value: '786 555 1234' } })
    fireEvent.click(getByRole('button', { name: 'Notify me' }))
    expect((await findByRole('alert')).textContent).toBe(storyPollCopy('en').optinNeedConsent)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the number with consent, then says it is done', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, created: true }), { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const { getByRole, getByPlaceholderText, findByRole } = voted('en')
    fireEvent.change(getByPlaceholderText('Your WhatsApp number'), { target: { value: '786 555 1234' } })
    fireEvent.click(getByRole('checkbox'))
    fireEvent.click(getByRole('button', { name: 'Notify me' }))
    expect((await findByRole('status')).textContent).toBe('Done! We’ll message you on WhatsApp 🦩')
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/story-polls/whatsapp-optin')
    expect(JSON.parse(String(init.body))).toMatchObject({ slug: 'vota-1', phone: '786 555 1234', consent: true, lang: 'en' })
  })

  it('is not there before voting, nor once the poll has closed', () => {
    const before = render(createElement(StoryPollVote, { slug: 'vota-1', lang: 'en', phase: 'open', options, initial: null }))
    expect(box(before.container)).toBeNull()
    cleanup()
    const closed = render(
      createElement(StoryPollVote, { slug: 'vota-1', lang: 'en', phase: 'closed', options, initial: { ...tally, pick: 'a' }, winner: 'a' }),
    )
    expect(box(closed.container)).toBeNull()
  })
})
