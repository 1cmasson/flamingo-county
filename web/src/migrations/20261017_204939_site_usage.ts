import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_uses\` ADD \`target\` text;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` ADD \`network\` text;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` ADD \`term\` text;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` ADD \`results\` numeric;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` ADD \`path\` text;`)
  await db.run(sql`CREATE INDEX \`hq_uses_target_idx\` ON \`hq_uses\` (\`target\`);`)
  await db.run(sql`CREATE INDEX \`hq_uses_term_idx\` ON \`hq_uses\` (\`term\`);`)
  await db.run(sql`CREATE INDEX \`hq_uses_path_idx\` ON \`hq_uses\` (\`path\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`hq_uses_target_idx\`;`)
  await db.run(sql`DROP INDEX \`hq_uses_term_idx\`;`)
  await db.run(sql`DROP INDEX \`hq_uses_path_idx\`;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` DROP COLUMN \`target\`;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` DROP COLUMN \`network\`;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` DROP COLUMN \`term\`;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` DROP COLUMN \`results\`;`)
  await db.run(sql`ALTER TABLE \`hq_uses\` DROP COLUMN \`path\`;`)
}
