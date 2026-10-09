import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_social_drafts\` ADD \`dedupe_key\` text;`)
  await db.run(sql`CREATE UNIQUE INDEX \`hq_social_drafts_dedupe_key_idx\` ON \`hq_social_drafts\` (\`dedupe_key\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`hq_social_drafts_dedupe_key_idx\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_drafts\` DROP COLUMN \`dedupe_key\`;`)
}
