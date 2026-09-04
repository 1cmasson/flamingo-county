import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` ADD \`start_time\` text;`)
  await db.run(sql`ALTER TABLE \`events\` ADD \`end_time\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`start_time\`;`)
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`end_time\`;`)
}
