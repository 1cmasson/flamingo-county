import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`listings_locales\` ADD \`answer\` text;`)
  await db.run(sql`ALTER TABLE \`_listings_v_locales\` ADD \`version_answer\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`listings_locales\` DROP COLUMN \`answer\`;`)
  await db.run(sql`ALTER TABLE \`_listings_v_locales\` DROP COLUMN \`version_answer\`;`)
}
