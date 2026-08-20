import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`listings_detail_menu\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_menu_locales\`;`)
  await db.run(sql`ALTER TABLE \`listings\` DROP COLUMN \`price\`;`)
  await db.run(sql`ALTER TABLE \`listings_locales\` DROP COLUMN \`detail_menu_note\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`price\`;`)
  await db.run(sql`ALTER TABLE \`site_settings\` DROP COLUMN \`show_menu_prices\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`listings_detail_menu\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`price\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_detail_menu_order_idx\` ON \`listings_detail_menu\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_menu_parent_id_idx\` ON \`listings_detail_menu\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`listings_detail_menu_locales\` (
  	\`name\` text NOT NULL,
  	\`desc\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings_detail_menu\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_detail_menu_locales_locale_parent_id_unique\` ON \`listings_detail_menu_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`listings\` ADD \`price\` text;`)
  await db.run(sql`ALTER TABLE \`listings_locales\` ADD \`detail_menu_note\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`price\` numeric DEFAULT 20;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD \`show_menu_prices\` integer DEFAULT true;`)
}
