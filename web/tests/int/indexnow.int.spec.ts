import { describe, expect, it } from 'vitest'
import { urlsFor } from '../../src/lib/indexnow'

describe('urlsFor', () => {
  it('listing: both languages of the page and of its city page', () => {
    expect(urlsFor('listings', { slug: 'morro-castle', publicationStatus: 'ready' }, 'hialeah')).toEqual([
      'https://flamingocounty.com/en/hialeah/morro-castle',
      'https://flamingocounty.com/es/hialeah/morro-castle',
      'https://flamingocounty.com/en/hialeah',
      'https://flamingocounty.com/es/hialeah',
    ])
  })
  it('skips unsourced listings and listings with no city', () => {
    expect(urlsFor('listings', { slug: 'x', publicationStatus: 'unsourced' }, 'hialeah')).toEqual([])
    expect(urlsFor('listings', { slug: 'x' }, null)).toEqual([])
  })
  it('events and stories include their index pages', () => {
    expect(urlsFor('events', { slug: 'e' })).toContain('https://flamingocounty.com/en/events')
    expect(urlsFor('stories', { slug: 's' })).toContain('https://flamingocounty.com/es/stories/s')
  })
  it('nothing without a slug or for unknown collections', () => {
    expect(urlsFor('events', {})).toEqual([])
    expect(urlsFor('media', { slug: 'a' })).toEqual([])
  })
})

import { afterEach, beforeEach, vi } from 'vitest'
import { pingIndexNow } from '../../src/lib/indexnow'

describe('pingIndexNow', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('sends host, key, keyLocation and de-duplicated urls in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('INDEXNOW_KEY', 'abc123abc123abc123abc123abc123ab')
    await pingIndexNow(['https://flamingocounty.com/en', 'https://flamingocounty.com/en'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.indexnow.org/IndexNow')
    expect(JSON.parse(init.body)).toEqual({
      host: 'flamingocounty.com',
      key: 'abc123abc123abc123abc123abc123ab',
      keyLocation: 'https://flamingocounty.com/abc123abc123abc123abc123abc123ab.txt',
      urlList: ['https://flamingocounty.com/en'],
    })
  })
  it('sends nothing without a key, outside production, or with no urls', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('INDEXNOW_KEY', '')
    await pingIndexNow(['https://flamingocounty.com/en'])
    vi.stubEnv('INDEXNOW_KEY', 'abc123abc123abc123abc123abc123ab')
    vi.stubEnv('NODE_ENV', 'development')
    await pingIndexNow(['https://flamingocounty.com/en'])
    vi.stubEnv('NODE_ENV', 'production')
    await pingIndexNow([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('swallows network failures so a CMS save never fails', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('INDEXNOW_KEY', 'abc123abc123abc123abc123abc123ab')
    fetchMock.mockRejectedValue(new Error('offline'))
    const log = vi.fn()
    await expect(pingIndexNow(['https://flamingocounty.com/en'], log)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
  })
})
