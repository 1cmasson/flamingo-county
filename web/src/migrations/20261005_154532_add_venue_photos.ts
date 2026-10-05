import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`license\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`license_url\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`source_url\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`modified\` integer;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`media_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_hq_add_site_media_from_url\` integer DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`license\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`license_url\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`source_url\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`modified\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`media_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_hq_add_site_media_from_url\`;`)
}
