import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` ADD \`setting\` text;`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_setting\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`setting\`;`)
  await db.run(sql`ALTER TABLE \`_events_v\` DROP COLUMN \`version_setting\`;`)
}
