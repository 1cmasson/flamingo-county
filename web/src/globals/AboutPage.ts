import type { GlobalConfig } from 'payload'

/**
 * About page copy.
 *
 * All of this currently lives as inline `L(en, es)` pairs inside the
 * About.dc.html component (lines 133-178) — it is in NEITHER the ES dictionary
 * nor fc-data.js, so it was the one body of copy no one could edit without
 * opening a component file. The city cards on that page are derived from the
 * Cities collection and are not duplicated here.
 */
export const AboutPage: GlobalConfig = {
  slug: 'about-page',
  access: { read: () => true },
  admin: { group: 'Page copy' },
  fields: [
    {
      type: 'collapsible',
      label: 'Hero',
      fields: [
        { name: 'kicker', type: 'text', localized: true },
        {
          type: 'row',
          fields: [
            { name: 'h1a', type: 'text', localized: true },
            { name: 'h1b', type: 'text', localized: true },
          ],
        },
        { name: 'intro', type: 'textarea', localized: true },
        { name: 'photo', type: 'upload', relationTo: 'media' },
        { name: 'photoHint', type: 'text', localized: true },
      ],
    },
    {
      type: 'collapsible',
      label: 'Founder',
      fields: [
        { name: 'founderKicker', type: 'text', localized: true },
        { name: 'founderP1', type: 'textarea', localized: true },
        { name: 'founderP2', type: 'textarea', localized: true },
        { name: 'founderSig', type: 'text', localized: true },
        { name: 'founderTag', type: 'text', localized: true },
      ],
    },
    {
      type: 'collapsible',
      label: 'How it works',
      fields: [
        { name: 'howH', type: 'text', localized: true },
        {
          name: 'steps',
          type: 'array',
          maxRows: 6,
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'n', type: 'text', admin: { description: 'Step number.' } },
                {
                  name: 'bg',
                  type: 'text',
                  admin: { description: 'Hex or linear-gradient(...) for the step chip.' },
                },
              ],
            },
            { name: 't', type: 'text', localized: true },
            { name: 'd', type: 'textarea', localized: true },
          ],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Call to action',
      fields: [
        { name: 'ctaH', type: 'text', localized: true },
        { name: 'ctaP', type: 'textarea', localized: true },
        { name: 'ctaBtn', type: 'text', localized: true },
      ],
    },
    {
      type: 'collapsible',
      label: 'Reach me',
      fields: [
        { name: 'reachH', type: 'text', localized: true },
        { name: 'reachP', type: 'textarea', localized: true },
      ],
    },
  ],
}
