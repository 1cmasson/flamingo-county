import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`stories_blocks_quick_answer\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_quick_answer_order_idx\` ON \`stories_blocks_quick_answer\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_quick_answer_parent_id_idx\` ON \`stories_blocks_quick_answer\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_quick_answer_path_idx\` ON \`stories_blocks_quick_answer\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_quick_answer_locales\` (
  	\`question\` text,
  	\`answer\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_quick_answer\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_quick_answer_locales_locale_parent_id_unique\` ON \`stories_blocks_quick_answer_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_heading\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_heading_order_idx\` ON \`stories_blocks_heading\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_heading_parent_id_idx\` ON \`stories_blocks_heading\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_heading_path_idx\` ON \`stories_blocks_heading\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_heading_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_heading\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_heading_locales_locale_parent_id_unique\` ON \`stories_blocks_heading_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_list_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_list\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_list_items_order_idx\` ON \`stories_blocks_list_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_list_items_parent_id_idx\` ON \`stories_blocks_list_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_list_items_locales\` (
  	\`label\` text,
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_list_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_list_items_locales_locale_parent_id_unique\` ON \`stories_blocks_list_items_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_list\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`style\` text DEFAULT 'bullets',
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_list_order_idx\` ON \`stories_blocks_list\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_list_parent_id_idx\` ON \`stories_blocks_list\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_list_path_idx\` ON \`stories_blocks_list\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_faq_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_faq\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_faq_items_order_idx\` ON \`stories_blocks_faq_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_faq_items_parent_id_idx\` ON \`stories_blocks_faq_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_faq_items_locales\` (
  	\`question\` text,
  	\`answer\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_faq_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_faq_items_locales_locale_parent_id_unique\` ON \`stories_blocks_faq_items_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_faq_order_idx\` ON \`stories_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_faq_parent_id_idx\` ON \`stories_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_faq_path_idx\` ON \`stories_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_links_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`url\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_links\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_links_items_order_idx\` ON \`stories_blocks_links_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_links_items_parent_id_idx\` ON \`stories_blocks_links_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_links_items_locales\` (
  	\`label\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_links_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_links_items_locales_locale_parent_id_unique\` ON \`stories_blocks_links_items_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_links\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`style\` text DEFAULT 'sources',
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_links_order_idx\` ON \`stories_blocks_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_links_parent_id_idx\` ON \`stories_blocks_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_links_path_idx\` ON \`stories_blocks_links\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_links_locales\` (
  	\`title\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_links\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_links_locales_locale_parent_id_unique\` ON \`stories_blocks_links_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_quick_answer\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_quick_answer_order_idx\` ON \`_stories_v_blocks_quick_answer\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_quick_answer_parent_id_idx\` ON \`_stories_v_blocks_quick_answer\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_quick_answer_path_idx\` ON \`_stories_v_blocks_quick_answer\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_quick_answer_locales\` (
  	\`question\` text,
  	\`answer\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_quick_answer\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_quick_answer_locales_locale_parent_id_uniq\` ON \`_stories_v_blocks_quick_answer_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_heading\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_heading_order_idx\` ON \`_stories_v_blocks_heading\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_heading_parent_id_idx\` ON \`_stories_v_blocks_heading\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_heading_path_idx\` ON \`_stories_v_blocks_heading\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_heading_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_heading\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_heading_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_heading_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_list_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_list\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_list_items_order_idx\` ON \`_stories_v_blocks_list_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_list_items_parent_id_idx\` ON \`_stories_v_blocks_list_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_list_items_locales\` (
  	\`label\` text,
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_list_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_list_items_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_list_items_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_list\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`style\` text DEFAULT 'bullets',
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_list_order_idx\` ON \`_stories_v_blocks_list\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_list_parent_id_idx\` ON \`_stories_v_blocks_list\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_list_path_idx\` ON \`_stories_v_blocks_list\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_faq_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_faq\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_faq_items_order_idx\` ON \`_stories_v_blocks_faq_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_faq_items_parent_id_idx\` ON \`_stories_v_blocks_faq_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_faq_items_locales\` (
  	\`question\` text,
  	\`answer\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_faq_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_faq_items_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_faq_items_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_faq\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_faq_order_idx\` ON \`_stories_v_blocks_faq\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_faq_parent_id_idx\` ON \`_stories_v_blocks_faq\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_faq_path_idx\` ON \`_stories_v_blocks_faq\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_links_items\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`url\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_links\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_links_items_order_idx\` ON \`_stories_v_blocks_links_items\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_links_items_parent_id_idx\` ON \`_stories_v_blocks_links_items\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_links_items_locales\` (
  	\`label\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_links_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_links_items_locales_locale_parent_id_uniqu\` ON \`_stories_v_blocks_links_items_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_links\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`style\` text DEFAULT 'sources',
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_links_order_idx\` ON \`_stories_v_blocks_links\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_links_parent_id_idx\` ON \`_stories_v_blocks_links\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_links_path_idx\` ON \`_stories_v_blocks_links\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_links_locales\` (
  	\`title\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_links\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_links_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_links_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`stories_locales\` ADD \`meta_title\` text;`)
  await db.run(sql`ALTER TABLE \`stories_locales\` ADD \`meta_description\` text;`)
  await db.run(sql`ALTER TABLE \`_stories_v_locales\` ADD \`version_meta_title\` text;`)
  await db.run(sql`ALTER TABLE \`_stories_v_locales\` ADD \`version_meta_description\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`stories_blocks_quick_answer\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_quick_answer_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_heading\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_heading_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_list_items\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_list_items_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_list\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_faq_items\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_faq_items_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_links_items\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_links_items_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_links\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_links_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_quick_answer\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_quick_answer_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_heading\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_heading_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_list_items\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_list_items_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_list\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_faq_items\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_faq_items_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_faq\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_links_items\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_links_items_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_links\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_links_locales\`;`)
  await db.run(sql`ALTER TABLE \`stories_locales\` DROP COLUMN \`meta_title\`;`)
  await db.run(sql`ALTER TABLE \`stories_locales\` DROP COLUMN \`meta_description\`;`)
  await db.run(sql`ALTER TABLE \`_stories_v_locales\` DROP COLUMN \`version_meta_title\`;`)
  await db.run(sql`ALTER TABLE \`_stories_v_locales\` DROP COLUMN \`version_meta_description\`;`)
}
