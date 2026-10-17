import { createElement } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clickUse, UseClicks, UseOnce } from '@/components/UseTracker'

/**
 * The browser half of the address tool's use counter: what each tap on the
 * report sends to /api/use, and that a lookup is sent once.
 */

let sent: Record<string, unknown>[] = []

beforeEach(() => {
  sent = []
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (_url: string, blob: Blob) => {
      // jsdom's Blob has no text(); FileReader reads it.
      const r = new FileReader()
      r.onload = () => sent.push(JSON.parse(String(r.result)))
      r.readAsText(blob)
      return true
    },
  })
})
afterEach(() => cleanup())

const flush = () => new Promise((r) => setTimeout(r, 30))

const report = () =>
  createElement(
    UseClicks,
    { area: 'HIALEAH', lang: 'es' },
    createElement(
      'section',
      { 'aria-labelledby': 'addr' },
      createElement('a', { href: '/api/address/calendar?a=x', 'data-testid': 'calendar' }, 'calendar'),
      createElement('button', { 'data-use': 'print', 'data-testid': 'print' }, createElement('span', null, '🖨️')),
    ),
    createElement(
      'section',
      { 'aria-labelledby': 'flood' },
      createElement('a', { href: 'https://example.gov', 'data-testid': 'flood' }, 'zone'),
      createElement('p', { 'data-testid': 'text' }, 'text'),
    ),
  )

describe('UseClicks', () => {
  it('counts a named control, and a link as its card', async () => {
    const { getByTestId } = render(report())
    fireEvent.click(getByTestId('print').firstChild as Element)
    fireEvent.click(getByTestId('flood'), { button: 0 })
    await flush()
    expect(sent).toEqual([
      { tool: 'address', action: 'print', area: 'HIALEAH', lang: 'es', path: '/' },
      { tool: 'address', action: 'link', section: 'flood', area: 'HIALEAH', lang: 'es', path: '/' },
    ])
  })

  it('leaves the calendar button to the server, and ignores plain text', async () => {
    const { getByTestId } = render(report())
    fireEvent.click(getByTestId('calendar'))
    fireEvent.click(getByTestId('text'))
    await flush()
    expect(sent).toEqual([])
  })
})

describe('UseOnce', () => {
  it('sends a lookup once per address, never the address itself', async () => {
    const el = createElement(UseOnce, { action: 'lookup', once: '5410-w-6-ln-33012', area: 'HIALEAH', lang: 'es' })
    const { rerender } = render(el)
    rerender(el)
    render(createElement(UseOnce, { action: 'lookup', once: '5410-w-6-ln-33012', area: 'HIALEAH', lang: 'es' }))
    await flush()
    expect(sent).toEqual([{ tool: 'address', action: 'lookup', area: 'HIALEAH', lang: 'es', path: '/' }])
    expect(JSON.stringify(sent)).not.toMatch(/5410/)
  })

  it('stays quiet in automated browsers', async () => {
    Object.defineProperty(navigator, 'webdriver', { configurable: true, value: true })
    render(createElement(UseOnce, { action: 'lookup', once: 'another-address', area: 'HIALEAH' }))
    await flush()
    delete (navigator as { webdriver?: boolean }).webdriver
    expect(sent).toEqual([])
  })
})

describe('clickUse (the site-wide listener)', () => {
  const page = () =>
    render(
      createElement(
        'main',
        { 'data-use-tool': 'listing', 'data-use-target': 'el-gallo' },
        createElement('a', { href: 'tel:+13055551234', 'data-testid': 'tel' }, createElement('span', null, 'call')),
        createElement('a', { href: 'https://www.instagram.com/elgallo/', 'data-testid': 'ig' }, 'ig'),
        createElement('a', { href: '/es/hialeah', 'data-testid': 'inside' }, 'inside'),
        createElement(
          'div',
          { 'data-use-tool': 'event', 'data-use-target': 'son-night' },
          createElement('button', { 'data-use': 'save', 'data-testid': 'save' }, 'save'),
        ),
        createElement('div', { 'data-use-local': '' }, createElement('a', { href: 'tel:1', 'data-testid': 'local' }, 'x')),
      ),
    )
  const own = 'flamingocounty.com'

  it('names the tap in its page\'s context, the nearest one winning', () => {
    const { getByTestId } = page()
    expect(clickUse(getByTestId('tel').firstChild, own)).toEqual({ tool: 'listing', target: 'el-gallo', action: 'call' })
    expect(clickUse(getByTestId('ig'), own)).toEqual({ tool: 'listing', target: 'el-gallo', action: 'social', network: 'instagram' })
    expect(clickUse(getByTestId('save'), own)).toEqual({ tool: 'event', target: 'son-night', action: 'save' })
  })

  it('leaves links inside the site, and the address report\'s own counter, alone', () => {
    const { getByTestId } = page()
    expect(clickUse(getByTestId('inside'), own)).toBeNull()
    expect(clickUse(getByTestId('local'), own)).toBeNull()
  })

  it('is "page" where the page says nothing', () => {
    const { container } = render(createElement('a', { href: 'https://maps.apple.com/?daddr=x' }, 'go'))
    expect(clickUse(container.querySelector('a'), own)).toEqual({ tool: 'page', target: undefined, action: 'directions' })
  })
})
