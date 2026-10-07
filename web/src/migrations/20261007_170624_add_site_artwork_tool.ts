import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`origin\` text;`)
  await db.run(sql`ALTER TABLE \`media_locales\` ADD \`based_on\` text;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_hq_add_site_artwork_from_upload\` integer DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`origin\`;`)
  await db.run(sql`ALTER TABLE \`media_locales\` DROP COLUMN \`based_on\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_hq_add_site_artwork_from_upload\`;`)
}
