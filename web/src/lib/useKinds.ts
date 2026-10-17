/**
 * What the address tool's use counter knows (lib/uses.ts), with no imports so
 * the collection and the browser's tracker can share it.
 */

export const USE_ACTIONS = [
  /** A report was shown for an address. */
  'lookup',
  /** An address link that matched nothing. */
  'not_found',
  /** The calendar file was downloaded (server side). */
  'calendar',
  'print',
  /** In an in-app browser: "Open in Chrome" (Android). */
  'open_chrome',
  /** In an in-app browser: "Copy the link" (iPhone's way out). */
  'copy_link',
  /** The report's map tab. */
  'map',
  /** "Look up another address". */
  'change',
  /** A link inside one of the report's cards; `section` says which. */
  'link',
] as const
export type UseAction = (typeof USE_ACTIONS)[number]

/** The report's cards, by their heading id on the address page. */
export const USE_SECTIONS = ['trash', 'bus', 'flood', 'reps', 'vote', 'schools', 'near', 'sources'] as const
export type UseSection = (typeof USE_SECTIONS)[number]

/** Where the page was open: a normal browser or one app's built-in one. */
export const USE_BROWSERS = ['browser', 'instagram', 'facebook', 'tiktok', 'other-app'] as const
export type UseBrowser = (typeof USE_BROWSERS)[number]
