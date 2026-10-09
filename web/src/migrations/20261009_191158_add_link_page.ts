import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`link_page_sections_buttons\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`emoji\` text,
  	\`label_es\` text,
  	\`label_en\` text,
  	\`kind\` text DEFAULT 'link',
  	\`url\` text,
  	\`featured\` integer,
  	\`starts_on\` text,
  	\`ends_on\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`link_page_sections\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`link_page_sections_buttons_order_idx\` ON \`link_page_sections_buttons\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`link_page_sections_buttons_parent_id_idx\` ON \`link_page_sections_buttons\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`link_page_sections\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`emoji\` text,
  	\`title_es\` text,
  	\`title_en\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`link_page\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`link_page_sections_order_idx\` ON \`link_page_sections\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`link_page_sections_parent_id_idx\` ON \`link_page_sections\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`link_page\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`tagline_es\` text,
  	\`tagline_en\` text,
  	\`_status\` text DEFAULT 'draft',
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`link_page__status_idx\` ON \`link_page\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`_link_page_v_version_sections_buttons\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`emoji\` text,
  	\`label_es\` text,
  	\`label_en\` text,
  	\`kind\` text DEFAULT 'link',
  	\`url\` text,
  	\`featured\` integer,
  	\`starts_on\` text,
  	\`ends_on\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_link_page_v_version_sections\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_link_page_v_version_sections_buttons_order_idx\` ON \`_link_page_v_version_sections_buttons\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_link_page_v_version_sections_buttons_parent_id_idx\` ON \`_link_page_v_version_sections_buttons\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_link_page_v_version_sections\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`emoji\` text,
  	\`title_es\` text,
  	\`title_en\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_link_page_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_link_page_v_version_sections_order_idx\` ON \`_link_page_v_version_sections\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_link_page_v_version_sections_parent_id_idx\` ON \`_link_page_v_version_sections\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_link_page_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`version_tagline_es\` text,
  	\`version_tagline_en\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer
  );
  `)
  await db.run(sql`CREATE INDEX \`_link_page_v_version_version__status_idx\` ON \`_link_page_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_link_page_v_created_at_idx\` ON \`_link_page_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_link_page_v_updated_at_idx\` ON \`_link_page_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_link_page_v_snapshot_idx\` ON \`_link_page_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_link_page_v_published_locale_idx\` ON \`_link_page_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_link_page_v_latest_idx\` ON \`_link_page_v\` (\`latest\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`link_page_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`link_page_update\` integer DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`link_page_sections_buttons\`;`)
  await db.run(sql`DROP TABLE \`link_page_sections\`;`)
  await db.run(sql`DROP TABLE \`link_page\`;`)
  await db.run(sql`DROP TABLE \`_link_page_v_version_sections_buttons\`;`)
  await db.run(sql`DROP TABLE \`_link_page_v_version_sections\`;`)
  await db.run(sql`DROP TABLE \`_link_page_v\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`link_page_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`link_page_update\`;`)
}
