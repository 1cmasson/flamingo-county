import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_leads\` ADD \`domino_at\` text;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` ADD \`domino_event\` text;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` ADD \`domino_party\` numeric;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` ADD \`domino_place\` text;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` ADD \`domino_consent_text\` text;`)
  await db.run(sql`CREATE INDEX \`hq_leads_domino_at_idx\` ON \`hq_leads\` (\`domino_at\`);`)
  await db.run(sql`CREATE INDEX \`hq_leads_domino_event_idx\` ON \`hq_leads\` (\`domino_event\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`hq_leads_domino_at_idx\`;`)
  await db.run(sql`DROP INDEX \`hq_leads_domino_event_idx\`;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` DROP COLUMN \`domino_at\`;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` DROP COLUMN \`domino_event\`;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` DROP COLUMN \`domino_party\`;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` DROP COLUMN \`domino_place\`;`)
  await db.run(sql`ALTER TABLE \`hq_leads\` DROP COLUMN \`domino_consent_text\`;`)
}
