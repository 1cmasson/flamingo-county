import { randomBytes } from 'node:crypto'
import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-sqlite'

/**
 * Data only, no schema: the link page's first sections and buttons
 * (globals/LinkPage.ts), so /links works the day it ships, before anyone
 * opens the admin. Published, like the rest of the site's live content.
 *
 * Plain SQL, not payload.updateGlobal, for the reason add_gems_category gives:
 * on a fresh database a Payload write selects every column the CURRENT config
 * declares, which later migrations may not have added yet.
 *
 * A no-op when the page already has sections, so a re-run, or a database
 * where someone already filled it in, is left alone. Every internal path is
 * one of lib/routes.ts's. "This week" goes to the events board for now; it
 * can point at a this-week page once there is one. Little Havana is left out
 * of the bios and this page for now (the owner's call, 2026-10-09).
 */
type Button = { emoji: string; es: string; en: string; url?: string; newestStory?: true; featured?: true }
type Section = { emoji: string; es: string; en: string; buttons: Button[] }

const TAGLINE = { es: 'Los lugares que tus vecinos respaldan', en: 'The spots your neighbors vouch for' }

const SECTIONS: Section[] = [
  {
    emoji: '📅',
    es: 'Esta semana',
    en: 'This week',
    buttons: [
      { emoji: '🎉', es: 'Eventos de la semana', en: 'This week’s events', url: '/events', featured: true },
      { emoji: '🗓️', es: 'Calendario', en: 'Calendar', url: '/events?view=cal' },
    ],
  },
  {
    emoji: '📖',
    es: 'Historias',
    en: 'Stories',
    buttons: [
      { emoji: '🆕', es: 'La historia nueva', en: 'The newest story', newestStory: true, featured: true },
      { emoji: '📚', es: 'Todas las historias', en: 'All the stories', url: '/stories' },
    ],
  },
  {
    emoji: '📍',
    es: 'Lugares',
    en: 'Places',
    buttons: [
      { emoji: '🗺️', es: 'Todos los lugares', en: 'All the spots', url: '/' },
      { emoji: '🏙️', es: 'Hialeah', en: 'Hialeah', url: '/hialeah' },
      { emoji: '🌳', es: 'Miami Lakes', en: 'Miami Lakes', url: '/lakes' },
      { emoji: '🚌', es: 'Guaguas gratis', en: 'Free rides', url: '/free-rides' },
    ],
  },
  {
    emoji: '🏪',
    es: 'Únete',
    en: 'Get listed',
    buttons: [
      { emoji: '📝', es: 'Pon tu negocio', en: 'List your spot', url: '/list-your-spot?type=listing' },
      { emoji: '📣', es: 'Manda un evento', en: 'Send an event', url: '/list-your-spot?type=event' },
      { emoji: '🎂', es: 'Felicitación de cumpleaños', en: 'Birthday shoutout', url: '/list-your-spot?type=shoutout' },
    ],
  },
  {
    emoji: '📲',
    es: 'Síguenos',
    en: 'Follow us',
    buttons: [
      { emoji: '📸', es: 'Instagram', en: 'Instagram', url: 'https://www.instagram.com/flamingo.county/' },
      { emoji: '🎵', es: 'TikTok', en: 'TikTok', url: 'https://www.tiktok.com/@flamingo.county' },
      { emoji: '👍', es: 'Facebook', en: 'Facebook', url: 'https://www.facebook.com/flamingocounty.mia' },
    ],
  },
]

// Payload's own array row ids are 24 hex characters.
const rowId = () => randomBytes(12).toString('hex')

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  const has = (await db.all(sql`SELECT COUNT(*) AS n FROM \`link_page_sections\`;`)) as { n: number }[]
  if (Number(has[0]?.n ?? 0) > 0) {
    payload.logger.info('[migrate] link page: already has sections, left alone')
    return
  }
  const now = new Date().toISOString()
  await db.run(sql`
    INSERT INTO \`link_page\` (\`id\`, \`_status\`, \`updated_at\`, \`created_at\`)
    SELECT 1, 'published', ${now}, ${now}
    WHERE NOT EXISTS (SELECT 1 FROM \`link_page\`);
  `)
  await db.run(sql`
    UPDATE \`link_page\`
    SET \`_status\` = 'published', \`updated_at\` = ${now},
        \`tagline_es\` = COALESCE(\`tagline_es\`, ${TAGLINE.es}), \`tagline_en\` = COALESCE(\`tagline_en\`, ${TAGLINE.en});
  `)
  const page = (await db.all(sql`SELECT \`id\` FROM \`link_page\` LIMIT 1;`)) as { id: number }[]
  const pageId = page[0].id

  for (const [si, section] of SECTIONS.entries()) {
    const sectionId = rowId()
    await db.run(sql`
      INSERT INTO \`link_page_sections\` (\`_order\`, \`_parent_id\`, \`id\`, \`emoji\`, \`title_es\`, \`title_en\`)
      VALUES (${si + 1}, ${pageId}, ${sectionId}, ${section.emoji}, ${section.es}, ${section.en});
    `)
    for (const [bi, b] of section.buttons.entries()) {
      await db.run(sql`
        INSERT INTO \`link_page_sections_buttons\`
          (\`_order\`, \`_parent_id\`, \`id\`, \`emoji\`, \`label_es\`, \`label_en\`, \`kind\`, \`url\`, \`featured\`)
        VALUES (${bi + 1}, ${sectionId}, ${rowId()}, ${b.emoji}, ${b.es}, ${b.en},
          ${b.newestStory ? 'newestStory' : 'link'}, ${b.url ?? null}, ${b.featured ? 1 : 0});
      `)
    }
  }
  payload.logger.info('[migrate] link page: seeded')
}

/** Empties the page; the rows go with their sections (ON DELETE cascade). */
export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DELETE FROM \`link_page_sections\`;`)
  payload.logger.info('[migrate] link page: emptied')
}
