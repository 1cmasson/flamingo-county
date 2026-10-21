import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`source\` text DEFAULT 'postiz';`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`age_minutes\` numeric;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`media_id\` text;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`media_published_at\` text;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`permalink\` text;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`caption\` text;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`duration_sec\` numeric;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`retention\` text;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` ADD \`failed_metrics\` text;`)
  await db.run(sql`CREATE INDEX \`hq_social_stats_source_idx\` ON \`hq_social_stats\` (\`source\`);`)
  await db.run(sql`CREATE INDEX \`hq_social_stats_media_id_idx\` ON \`hq_social_stats\` (\`media_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`hq_social_stats_source_idx\`;`)
  await db.run(sql`DROP INDEX \`hq_social_stats_media_id_idx\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`source\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`age_minutes\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`media_id\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`media_published_at\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`permalink\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`caption\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`duration_sec\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`retention\`;`)
  await db.run(sql`ALTER TABLE \`hq_social_stats\` DROP COLUMN \`failed_metrics\`;`)
}
