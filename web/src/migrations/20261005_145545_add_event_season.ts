import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` ADD \`season\` text;`)
  await db.run(sql`ALTER TABLE \`_events_v\` ADD \`version_season\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`season\`;`)
  await db.run(sql`ALTER TABLE \`_events_v\` DROP COLUMN \`version_season\`;`)
}
