import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_social_drafts\` ADD \`source_collection\` text;`)
  await db.run(sql`ALTER TABLE \`hq_social_drafts\` ADD \`source_id\` text;`)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_source_id_idx\` ON \`hq_social_drafts\` (\`source_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`hq_social_drafts_source_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_drafts\` DROP COLUMN \`source_collection\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_drafts\` DROP COLUMN \`source_id\`;`)
}
