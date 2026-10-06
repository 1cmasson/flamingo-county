import { describe, expect, it } from 'vitest'
import { requestEmail } from '../../src/lib/requestEmail'

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
    expect(m.text).not.toContain('LINK')
  })

  it('escapes whatever the visitor typed in the HTML part', () => {
    const m = requestEmail({ kind: 'story', lang: 'en', to: 'x@example.com', title: '<script>alert(1)</script>' })
    expect(m.subject).toBe('Thanks for the story tip')
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })
})
