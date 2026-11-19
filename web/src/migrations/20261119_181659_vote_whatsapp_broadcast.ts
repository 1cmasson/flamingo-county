import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`vote_whatsapp_optins\` ADD \`last_poll_sent_id\` numeric;`)
  await db.run(sql`ALTER TABLE \`vote_whatsapp_optins\` ADD \`last_poll_sent_at\` text;`)
  await db.run(sql`CREATE INDEX \`vote_whatsapp_optins_last_poll_sent_id_idx\` ON \`vote_whatsapp_optins\` (\`last_poll_sent_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`vote_whatsapp_optins_last_poll_sent_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`vote_whatsapp_optins\` DROP COLUMN \`last_poll_sent_id\`;`)
  await db.run(sql`ALTER TABLE \`vote_whatsapp_optins\` DROP COLUMN \`last_poll_sent_at\`;`)
}
