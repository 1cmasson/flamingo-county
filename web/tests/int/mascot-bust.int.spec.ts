import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MascotBust, MASCOT_SHADOW } from '@/components/MascotBust'
import { BusinessCard } from '@/components/BusinessCard'
import type { City, Listing, Media } from '@/payload-types'

const mascot = {
  id: 1,
  url: '/api/media/file/flamingo-hialeah.png',
  width: 422,
  height: 1200,
  sizes: {},
} as unknown as Media

const render = (props: Parameters<typeof MascotBust>[0]) =>
  renderToStaticMarkup(createElement(MascotBust, props))

describe('MascotBust', () => {
  it('renders nothing without art', () => {
    expect(render({ media: null, height: 100 })).toBe('')
    expect(render({ media: { id: 2 } as unknown as Media, height: 100 })).toBe('')
  })

  it('hangs a bust from the top on the right by default', () => {
    const html = render({ media: mascot, top: '30%', height: '100%' })
    expect(html).toContain('data-mascot-bust')
    expect(html).toContain('alt=""')
    expect(html).toMatch(/right:12px/)
    expect(html).toMatch(/top:30%/)
    expect(html).not.toMatch(/bottom:/)
    expect(html).toMatch(/object-position:top/)
    expect(html).toContain(`filter:${MASCOT_SHADOW}`)
  })

  it('stands a full figure on the lower edge, on either side', () => {
    const html = render({ media: mascot, side: 'left', inset: '3%', height: '72%' })
    expect(html).toMatch(/left:3%/)
    expect(html).toMatch(/bottom:-14px/)
    expect(html).not.toMatch(/right:/)
    expect(html).toMatch(/object-position:bottom/)
  })

  it('is never boxed into a shape', () => {
    const html = render({ media: mascot, top: 54, height: 170 })
    expect(html).not.toMatch(/border-radius/)
    expect(html).not.toMatch(/background/)
    expect(html).not.toMatch(/<div/)
  })
})

describe('BusinessCard', () => {
  it('stands the city mascot as a bust over the photo', () => {
    const city = { id: 1, slug: 'hialeah', name: 'HIALEAH', solo: mascot } as unknown as City
    const listing = {
      id: 1,
      slug: 'demo',
      name: 'Demo',
      city,
      category: null,
      gallery: [],
      tag: 'A tag',
    } as unknown as Listing
    const html = renderToStaticMarkup(
      createElement(BusinessCard, { lang: 'es', listing, t: (s: string) => s }),
    )
    expect(html).toContain('data-mascot-bust')
    expect(html).toMatch(/right:8px/)
    expect(html).toMatch(/top:54px/)
    expect(html).not.toMatch(/border-radius:50%/)
  })
})
