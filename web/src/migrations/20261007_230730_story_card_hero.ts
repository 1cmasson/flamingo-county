import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`stories_locales\` ADD \`card_tagline\` text;`)
  await db.run(sql`ALTER TABLE \`stories_locales\` ADD \`card_title\` text;`)
  await db.run(sql`ALTER TABLE \`_stories_v_locales\` ADD \`version_card_tagline\` text;`)
  await db.run(sql`ALTER TABLE \`_stories_v_locales\` ADD \`version_card_title\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`stories_locales\` DROP COLUMN \`card_tagline\`;`)
  await db.run(sql`ALTER TABLE \`stories_locales\` DROP COLUMN \`card_title\`;`)
  await db.run(sql`ALTER TABLE \`_stories_v_locales\` DROP COLUMN \`version_card_tagline\`;`)
  await db.run(sql`ALTER TABLE \`_stories_v_locales\` DROP COLUMN \`version_card_title\`;`)
}
