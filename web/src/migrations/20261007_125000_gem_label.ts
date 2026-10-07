import { sql, type MigrateDownArgs, type MigrateUpArgs } from '@payloadcms/db-sqlite'

/**
 * Data only, no schema: the `gems` category's label becomes
 * FLAMINGO COUNTY GEM / JOYA DE FLAMINGO COUNTY.
 *
 * The listing hero shows it as the diamond badge (`components/GemBadge.tsx`),
 * but the same label also reads as plain text in a card's meta line and in the
 * search dropdown, so the wording is changed at the source rather than only
 * where the badge is drawn.
 *
 * Plain SQL for the same reason as `20261007_120000_add_gems_category`. Only a
 * label still holding the old wording is rewritten, so a re-run is a no-op and
 * a label someone has since edited in the admin is left alone.
 */
const LABELS = [
  { locale: 'en', from: 'LOCAL GEMS', to: 'FLAMINGO COUNTY GEM' },
  { locale: 'es', from: 'JOYAS LOCALES', to: 'JOYA DE FLAMINGO COUNTY' },
] as const

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  for (const { locale, from, to } of LABELS) {
    await db.run(sql`
      UPDATE \`categories_locales\` SET \`label\` = ${to}
      WHERE \`_locale\` = ${locale} AND \`label\` = ${from}
        AND \`_parent_id\` IN (SELECT \`id\` FROM \`categories\` WHERE \`slug\` = 'gems');
    `)
  }
  payload.logger.info('[migrate] gems label: FLAMINGO COUNTY GEM / JOYA DE FLAMINGO COUNTY')
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  for (const { locale, from, to } of LABELS) {
    await db.run(sql`
      UPDATE \`categories_locales\` SET \`label\` = ${from}
      WHERE \`_locale\` = ${locale} AND \`label\` = ${to}
        AND \`_parent_id\` IN (SELECT \`id\` FROM \`categories\` WHERE \`slug\` = 'gems');
    `)
  }
  payload.logger.info('[migrate] gems label: back to LOCAL GEMS / JOYAS LOCALES')
}
