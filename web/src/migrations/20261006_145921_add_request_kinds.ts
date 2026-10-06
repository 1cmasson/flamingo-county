import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`listing_requests\` ADD \`kind\` text DEFAULT 'listing';`)
  await db.run(sql`ALTER TABLE \`listing_requests\` ADD \`event_when\` text;`)
  await db.run(sql`ALTER TABLE \`listing_requests\` ADD \`venue\` text;`)
  await db.run(sql`ALTER TABLE \`listing_requests\` ADD \`link\` text;`)
  await db.run(sql`CREATE INDEX \`listing_requests_kind_idx\` ON \`listing_requests\` (\`kind\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX \`listing_requests_kind_idx\`;`)
  await db.run(sql`ALTER TABLE \`listing_requests\` DROP COLUMN \`kind\`;`)
  await db.run(sql`ALTER TABLE \`listing_requests\` DROP COLUMN \`event_when\`;`)
  await db.run(sql`ALTER TABLE \`listing_requests\` DROP COLUMN \`venue\`;`)
  await db.run(sql`ALTER TABLE \`listing_requests\` DROP COLUMN \`link\`;`)
}
