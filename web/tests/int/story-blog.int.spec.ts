// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Block, Field } from 'payload'

import { Stories } from '@/collections/Stories'
import { headingId } from '@/components/StoryBlocks'
import { faqJsonLd, storyJsonLd } from '@/lib/jsonld'
import type { Story } from '@/payload-types'

/** The blog shapes on stories: short answer, subheading, list, Q&A and links. */

const blocksField = Stories.fields.find((f) => 'name' in f && f.name === 'blocks') as { blocks: Block[] }
const block = (slug: string) => blocksField.blocks.find((b) => b.slug === slug)!

describe('story blog blocks', () => {
  it('are all offered on a story', () => {
    expect(blocksField.blocks.map((b) => b.slug)).toEqual(
      expect.arrayContaining(['quickAnswer', 'heading', 'list', 'faq', 'links']),
    )
  })

  it('accept a link that is a site path or an https page, and nothing else', () => {
    const items = block('links').fields.find((f) => 'name' in f && f.name === 'items') as { fields: Field[] }
    const url = items.fields.find((f) => 'name' in f && f.name === 'url') as { validate: (v: unknown) => true | string }
    expect(url.validate('/es/stories/al-capone-in-hialeah')).toBe(true)
    expect(url.validate('https://doi.org/10.1650/CONDOR-17-187.1')).toBe(true)
    expect(url.validate('//evil.example')).not.toBe(true)
    expect(url.validate('javascript:alert(1)')).not.toBe(true)
    expect(url.validate('hialeahparkcasino.com')).not.toBe(true)
  })

  it('gives a subheading a stable anchor without accents', () => {
    expect(headingId('Cómo visitarlo hoy')).toBe('como-visitarlo-hoy')
    expect(headingId('¿Los flamencos de Florida se escaparon de Hialeah?')).toBe('los-flamencos-de-florida-se-escaparon-de-hialeah')
  })
})

describe('story blog structured data', () => {
  const blocks = [
    { blockType: 'quickAnswer', question: '¿Hay flamencos en Hialeah Park?', answer: 'Sí. La colonia sigue en la laguna.' },
    { blockType: 'paragraph', text: 'x' },
    {
      blockType: 'faq',
      items: [
        { question: '¿Cuándo abrió?', answer: 'En 1925.' },
        { question: '¿Es histórico?', answer: 'Sí, desde 1979.' },
      ],
    },
  ] as unknown as Story['blocks']

  it('marks up every printed question and answer as an FAQPage', () => {
    const ld = faqJsonLd(blocks)!
    expect(ld['@type']).toBe('FAQPage')
    expect(ld.mainEntity).toEqual([
      { '@type': 'Question', name: '¿Cuándo abrió?', acceptedAnswer: { '@type': 'Answer', text: 'En 1925.' } },
      { '@type': 'Question', name: '¿Es histórico?', acceptedAnswer: { '@type': 'Answer', text: 'Sí, desde 1979.' } },
    ])
  })

  it('emits no FAQPage for a story without questions', () => {
    expect(faqJsonLd([{ blockType: 'paragraph', text: 'x' }] as unknown as Story['blocks'])).toBeNull()
  })

  it('uses the short answer as the Article abstract', () => {
    const story = { slug: 'hialeah-park-un-siglo', title: 'Hialeah Park', createdAt: '2026-10-07T00:00:00.000Z', blocks } as Story
    expect(storyJsonLd('es', story, {}).abstract).toBe('Sí. La colonia sigue en la laguna.')
  })
})
