import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_social_drafts\` ADD \`postiz_backend\` text;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_hq_move_draft_to_cloud\` integer DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`hq_social_drafts\` DROP COLUMN \`postiz_backend\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_hq_move_draft_to_cloud\`;`)
}
