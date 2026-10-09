import { ValidationError, type GlobalConfig } from 'payload'
import { draftVersions, mcpGlobalDraftsOnly, publishedRead } from '../fields/shared'
import { checkLinkUrl } from '../lib/links'

const dayOnly = { date: { pickerAppearance: 'dayOnly' as const, displayFormat: 'yyyy-MM-dd' } }

/**
 * The "link in bio" page, /es/links and /en/links. Instagram and TikTok
 * captions can't hold a link, so every bio points here instead.
 *
 * Sections of buttons, in order. A featured button is pulled out to the top
 * as a big one.
 *
 * The two languages are two fields side by side (`labelEs`, `labelEn`), not
 * Payload's `localized`. The MCP tools strip array rows' ids and take one
 * language per call, so a localized label inside these arrays could not be
 * edited over MCP without losing the other language (tests/int/links.int.spec.ts). A button with dates shows only on those days (Miami days,
 * both ends included), so a seasonal one can be set up ahead and forgotten.
 *
 * Drafts like the site's content collections: Claude saves drafts over MCP
 * (`updateLinkPage` with draft: true, nothing else is accepted) and the owner
 * publishes from Telegram (hqRequestPublish). Every tap goes through /go/ and
 * is counted in hq-clicks. See lib/links.ts and HQ.md.
 */
export const LinkPage: GlobalConfig = {
  slug: 'link-page',
  label: 'Link page (bio)',
  access: publishedRead,
  versions: draftVersions,
  hooks: { beforeOperation: [mcpGlobalDraftsOnly] },
  admin: {
    group: 'Page copy',
    description:
      'flamingocounty.com/links: the page the Instagram, TikTok and Facebook bios point to. Internal links are paths without the language (/events); the page adds /es or /en.',
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'taglineEs', label: 'Tagline (ES)', type: 'text', maxLength: 90, admin: { description: 'One line under the name.' } },
        { name: 'taglineEn', label: 'Tagline (EN)', type: 'text', maxLength: 90 },
      ],
    },
    {
      name: 'sections',
      type: 'array',
      maxRows: 8,
      labels: { singular: 'Section', plural: 'Sections' },
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'emoji', type: 'text', maxLength: 8, admin: { width: '20%' } },
            { name: 'titleEs', label: 'Title (ES)', type: 'text', required: true, maxLength: 40, admin: { width: '40%' } },
            { name: 'titleEn', label: 'Title (EN)', type: 'text', required: true, maxLength: 40, admin: { width: '40%' } },
          ],
        },
        {
          name: 'buttons',
          type: 'array',
          maxRows: 10,
          labels: { singular: 'Button', plural: 'Buttons' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'emoji', type: 'text', maxLength: 8, admin: { width: '20%' } },
                {
                  name: 'labelEs',
                  label: 'Label (ES)',
                  type: 'text',
                  required: true,
                  maxLength: 40,
                  admin: { width: '40%', description: 'Short: two to four words.' },
                },
                { name: 'labelEn', label: 'Label (EN)', type: 'text', required: true, maxLength: 40, admin: { width: '40%' } },
              ],
            },
            {
              name: 'kind',
              type: 'select',
              required: true,
              defaultValue: 'link',
              options: [
                { label: 'A link', value: 'link' },
                { label: 'The newest published story', value: 'newestStory' },
              ],
              admin: { description: 'The newest story is looked up on every visit, so the button never goes stale.' },
            },
            {
              name: 'url',
              type: 'text',
              maxLength: 300,
              validate: (value: unknown, { siblingData }: { siblingData: { kind?: string } }) =>
                siblingData?.kind === 'newestStory' ? true : (checkLinkUrl(value) ?? true),
              hooks: {
                // Payload skips validation on a draft save, which is the only
                // save Claude can make: refuse a bad link then too, so it hears
                // about it at once rather than when the owner taps Publish.
                beforeChange: [
                  ({ value, siblingData }) => {
                    const problem = siblingData?.kind === 'newestStory' ? null : checkLinkUrl(value)
                    if (problem) throw new ValidationError({ errors: [{ message: problem, path: 'url' }] })
                    return value
                  },
                ],
              },
              admin: {
                condition: (_data, sibling) => sibling?.kind !== 'newestStory',
                description: 'A path on the site without the language (/events, /list-your-spot?type=listing), or a full https:// address.',
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'featured',
                  type: 'checkbox',
                  admin: { width: '30%', description: 'A big button at the top.' },
                },
                { name: 'startsOn', type: 'date', admin: { ...dayOnly, width: '35%', description: 'Optional: first day shown.' } },
                { name: 'endsOn', type: 'date', admin: { ...dayOnly, width: '35%', description: 'Optional: last day shown.' } },
              ],
            },
          ],
        },
      ],
    },
  ],
}
