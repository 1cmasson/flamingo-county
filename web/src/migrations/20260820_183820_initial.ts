import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`credit\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric,
  	\`sizes_thumbnail_url\` text,
  	\`sizes_thumbnail_width\` numeric,
  	\`sizes_thumbnail_height\` numeric,
  	\`sizes_thumbnail_mime_type\` text,
  	\`sizes_thumbnail_filesize\` numeric,
  	\`sizes_thumbnail_filename\` text,
  	\`sizes_card_url\` text,
  	\`sizes_card_width\` numeric,
  	\`sizes_card_height\` numeric,
  	\`sizes_card_mime_type\` text,
  	\`sizes_card_filesize\` numeric,
  	\`sizes_card_filename\` text,
  	\`sizes_hero_url\` text,
  	\`sizes_hero_width\` numeric,
  	\`sizes_hero_height\` numeric,
  	\`sizes_hero_mime_type\` text,
  	\`sizes_hero_filesize\` numeric,
  	\`sizes_hero_filename\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_thumbnail_sizes_thumbnail_filename_idx\` ON \`media\` (\`sizes_thumbnail_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_card_sizes_card_filename_idx\` ON \`media\` (\`sizes_card_filename\`);`)
  await db.run(sql`CREATE INDEX \`media_sizes_hero_sizes_hero_filename_idx\` ON \`media\` (\`sizes_hero_filename\`);`)
  await db.run(sql`CREATE TABLE \`media_locales\` (
  	\`alt\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`media_locales_locale_parent_id_unique\` ON \`media_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`cities_cast\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`name\` text,
  	\`bg\` text,
  	\`z\` numeric,
  	\`group\` integer DEFAULT false,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`cities_cast_order_idx\` ON \`cities_cast\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`cities_cast_parent_id_idx\` ON \`cities_cast\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`cities_cast_image_idx\` ON \`cities_cast\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`cities\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`order\` numeric,
  	\`lead\` numeric DEFAULT 0,
  	\`accent\` text,
  	\`cast_bg\` text,
  	\`photo_id\` integer,
  	\`photo_pos\` text,
  	\`solo_id\` integer,
  	\`solo_name\` text,
  	\`cast_count\` numeric,
  	\`group_a_r\` text,
  	\`head_offset_h\` text,
  	\`head_offset_l\` text,
  	\`head_offset_t\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`photo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`solo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`cities_slug_idx\` ON \`cities\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`cities_photo_idx\` ON \`cities\` (\`photo_id\`);`)
  await db.run(sql`CREATE INDEX \`cities_solo_idx\` ON \`cities\` (\`solo_id\`);`)
  await db.run(sql`CREATE INDEX \`cities_updated_at_idx\` ON \`cities\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`cities_created_at_idx\` ON \`cities\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`cities_locales\` (
  	\`sub\` text,
  	\`blurb\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`cities_locales_locale_parent_id_unique\` ON \`cities_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`categories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`order\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`categories_slug_idx\` ON \`categories\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`categories_updated_at_idx\` ON \`categories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`categories_created_at_idx\` ON \`categories\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`categories_locales\` (
  	\`label\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`categories_locales_locale_parent_id_unique\` ON \`categories_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`event_kinds\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`bg\` text NOT NULL,
  	\`ink\` text NOT NULL,
  	\`order\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`event_kinds_slug_idx\` ON \`event_kinds\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`event_kinds_updated_at_idx\` ON \`event_kinds\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`event_kinds_created_at_idx\` ON \`event_kinds\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`event_kinds_locales\` (
  	\`label\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`event_kinds_locales_locale_parent_id_unique\` ON \`event_kinds_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`listings_detail_story\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`text\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_detail_story_order_idx\` ON \`listings_detail_story\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_story_parent_id_idx\` ON \`listings_detail_story\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_story_locale_idx\` ON \`listings_detail_story\` (\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`listings_detail_hours\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`t\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_order_idx\` ON \`listings_detail_hours\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_parent_id_idx\` ON \`listings_detail_hours\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`listings_detail_hours_locales\` (
  	\`d\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings_detail_hours\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_detail_hours_locales_locale_parent_id_unique\` ON \`listings_detail_hours_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`listings_detail_hours_conflicts\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`source\` text NOT NULL,
  	\`detail\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_conflicts_order_idx\` ON \`listings_detail_hours_conflicts\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_conflicts_parent_id_idx\` ON \`listings_detail_hours_conflicts\` (\`_parent_id\`);`)
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
  await db.run(sql`CREATE TABLE \`listings_research_sources\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`url\` text NOT NULL,
  	\`title\` text,
  	\`publisher\` text,
  	\`type\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_research_sources_order_idx\` ON \`listings_research_sources\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_research_sources_parent_id_idx\` ON \`listings_research_sources\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`listings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`city_id\` integer NOT NULL,
  	\`category_id\` integer NOT NULL,
  	\`hood\` text,
  	\`rating\` numeric,
  	\`reviews\` numeric,
  	\`price\` text,
  	\`publication_status\` text DEFAULT 'unsourced' NOT NULL,
  	\`member\` integer DEFAULT false,
  	\`detail_quote_by\` text,
  	\`detail_address\` text,
  	\`detail_phone\` text,
  	\`detail_site\` text,
  	\`detail_email\` text,
  	\`detail_instagram\` text,
  	\`detail_hours_confidence\` text,
  	\`research_established\` text,
  	\`research_established_note\` text,
  	\`research_legal_entity\` text,
  	\`research_source_file\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_slug_idx\` ON \`listings\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`listings_city_idx\` ON \`listings\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_category_idx\` ON \`listings\` (\`category_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_updated_at_idx\` ON \`listings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`listings_created_at_idx\` ON \`listings\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`listings_locales\` (
  	\`tag\` text,
  	\`image_hint\` text,
  	\`detail_quote\` text,
  	\`detail_crew_line\` text,
  	\`detail_cta\` text,
  	\`detail_menu_note\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_locales_locale_parent_id_unique\` ON \`listings_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`listings_texts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`text\` text,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_texts_order_parent\` ON \`listings_texts\` (\`order\`,\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`listings_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`listings_rels_order_idx\` ON \`listings_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`listings_rels_parent_idx\` ON \`listings_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_rels_path_idx\` ON \`listings_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`listings_rels_media_id_idx\` ON \`listings_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_drop_cap\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_drop_cap_order_idx\` ON \`stories_blocks_drop_cap\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_drop_cap_parent_id_idx\` ON \`stories_blocks_drop_cap\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_drop_cap_path_idx\` ON \`stories_blocks_drop_cap\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_drop_cap_locales\` (
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_drop_cap\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_drop_cap_locales_locale_parent_id_unique\` ON \`stories_blocks_drop_cap_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_paragraph\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_paragraph_order_idx\` ON \`stories_blocks_paragraph\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_paragraph_parent_id_idx\` ON \`stories_blocks_paragraph\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_paragraph_path_idx\` ON \`stories_blocks_paragraph\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_paragraph_locales\` (
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_paragraph\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_paragraph_locales_locale_parent_id_unique\` ON \`stories_blocks_paragraph_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_pull_quote\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`attribution\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_pull_quote_order_idx\` ON \`stories_blocks_pull_quote\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_pull_quote_parent_id_idx\` ON \`stories_blocks_pull_quote\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_pull_quote_path_idx\` ON \`stories_blocks_pull_quote\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_pull_quote_locales\` (
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_pull_quote\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_pull_quote_locales_locale_parent_id_unique\` ON \`stories_blocks_pull_quote_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_image\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`aspect_ratio\` text DEFAULT '16 / 9',
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_order_idx\` ON \`stories_blocks_image\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_parent_id_idx\` ON \`stories_blocks_image\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_path_idx\` ON \`stories_blocks_image\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_image_idx\` ON \`stories_blocks_image\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_image_locales\` (
  	\`hint\` text,
  	\`caption\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_image\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_image_locales_locale_parent_id_unique\` ON \`stories_blocks_image_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_image_pair\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`a_image_id\` integer,
  	\`b_image_id\` integer,
  	\`block_name\` text,
  	FOREIGN KEY (\`a_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`b_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_pair_order_idx\` ON \`stories_blocks_image_pair\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_pair_parent_id_idx\` ON \`stories_blocks_image_pair\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_pair_path_idx\` ON \`stories_blocks_image_pair\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_pair_a_a_image_idx\` ON \`stories_blocks_image_pair\` (\`a_image_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_image_pair_b_b_image_idx\` ON \`stories_blocks_image_pair\` (\`b_image_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_image_pair_locales\` (
  	\`a_hint\` text,
  	\`a_caption\` text,
  	\`b_hint\` text,
  	\`b_caption\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_image_pair\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_image_pair_locales_locale_parent_id_unique\` ON \`stories_blocks_image_pair_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_callout_note\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_callout_note_order_idx\` ON \`stories_blocks_callout_note\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_callout_note_parent_id_idx\` ON \`stories_blocks_callout_note\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_callout_note_path_idx\` ON \`stories_blocks_callout_note\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_callout_note_locales\` (
  	\`title\` text NOT NULL,
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_callout_note\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_callout_note_locales_locale_parent_id_unique\` ON \`stories_blocks_callout_note_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`stories_blocks_section_break\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`stories_blocks_section_break_order_idx\` ON \`stories_blocks_section_break\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_section_break_parent_id_idx\` ON \`stories_blocks_section_break\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_blocks_section_break_path_idx\` ON \`stories_blocks_section_break\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`stories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`read_time\` text,
  	\`byline\` text,
  	\`listing_id\` integer,
  	\`cover_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_slug_idx\` ON \`stories\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`stories_listing_idx\` ON \`stories\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_cover_idx\` ON \`stories\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_updated_at_idx\` ON \`stories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`stories_created_at_idx\` ON \`stories\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`stories_locales\` (
  	\`title\` text NOT NULL,
  	\`dek\` text,
  	\`kicker\` text,
  	\`biz_cta\` text,
  	\`cover_hint\` text,
  	\`cover_cap\` text,
  	\`outro\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_locales_locale_parent_id_unique\` ON \`stories_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`date\` text NOT NULL,
  	\`time_label\` text,
  	\`kind_id\` integer NOT NULL,
  	\`venue_type\` text DEFAULT 'listing' NOT NULL,
  	\`listing_id\` integer,
  	\`hood\` text,
  	\`city_id\` integer,
  	\`star\` integer DEFAULT false,
  	\`going\` numeric DEFAULT 0,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`kind_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`events_slug_idx\` ON \`events\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`events_kind_idx\` ON \`events\` (\`kind_id\`);`)
  await db.run(sql`CREATE INDEX \`events_listing_idx\` ON \`events\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`events_city_idx\` ON \`events\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`events_image_idx\` ON \`events\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`events_updated_at_idx\` ON \`events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`events_created_at_idx\` ON \`events\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`events_locales\` (
  	\`title\` text NOT NULL,
  	\`place\` text,
  	\`free_label\` text,
  	\`note\` text,
  	\`image_hint\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`events_locales_locale_parent_id_unique\` ON \`events_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`weekly_events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`dow\` text NOT NULL,
  	\`time\` text,
  	\`listing_id\` integer NOT NULL,
  	\`kind_id\` integer NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`kind_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`weekly_events_slug_idx\` ON \`weekly_events\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_listing_idx\` ON \`weekly_events\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_kind_idx\` ON \`weekly_events\` (\`kind_id\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_updated_at_idx\` ON \`weekly_events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_created_at_idx\` ON \`weekly_events\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`weekly_events_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`weekly_events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`weekly_events_locales_locale_parent_id_unique\` ON \`weekly_events_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`spotlights\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`city_id\` integer NOT NULL,
  	\`listing_id\` integer NOT NULL,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`spotlights_slug_idx\` ON \`spotlights\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_city_idx\` ON \`spotlights\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_listing_idx\` ON \`spotlights\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_image_idx\` ON \`spotlights\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_updated_at_idx\` ON \`spotlights\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_created_at_idx\` ON \`spotlights\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`spotlights_locales\` (
  	\`kind\` text,
  	\`deal\` text,
  	\`blurb\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`spotlights\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`spotlights_locales_locale_parent_id_unique\` ON \`spotlights_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`subscribers\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`email\` text NOT NULL,
  	\`lang\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`subscribers_email_idx\` ON \`subscribers\` (\`email\`);`)
  await db.run(sql`CREATE INDEX \`subscribers_updated_at_idx\` ON \`subscribers\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`subscribers_created_at_idx\` ON \`subscribers\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`listing_requests\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`status\` text DEFAULT 'new',
  	\`business\` text NOT NULL,
  	\`owner\` text,
  	\`phone\` text NOT NULL,
  	\`email\` text,
  	\`city_id\` integer,
  	\`category_id\` integer,
  	\`story\` text,
  	\`lang\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`listing_requests_city_idx\` ON \`listing_requests\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`listing_requests_category_idx\` ON \`listing_requests\` (\`category_id\`);`)
  await db.run(sql`CREATE INDEX \`listing_requests_updated_at_idx\` ON \`listing_requests\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`listing_requests_created_at_idx\` ON \`listing_requests\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`cities_id\` integer,
  	\`categories_id\` integer,
  	\`event_kinds_id\` integer,
  	\`listings_id\` integer,
  	\`stories_id\` integer,
  	\`events_id\` integer,
  	\`weekly_events_id\` integer,
  	\`spotlights_id\` integer,
  	\`subscribers_id\` integer,
  	\`listing_requests_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`cities_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`categories_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`event_kinds_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`listings_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`stories_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`weekly_events_id\`) REFERENCES \`weekly_events\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`spotlights_id\`) REFERENCES \`spotlights\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`subscribers_id\`) REFERENCES \`subscribers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`listing_requests_id\`) REFERENCES \`listing_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_cities_id_idx\` ON \`payload_locked_documents_rels\` (\`cities_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_categories_id_idx\` ON \`payload_locked_documents_rels\` (\`categories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_event_kinds_id_idx\` ON \`payload_locked_documents_rels\` (\`event_kinds_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_listings_id_idx\` ON \`payload_locked_documents_rels\` (\`listings_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_stories_id_idx\` ON \`payload_locked_documents_rels\` (\`stories_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_events_id_idx\` ON \`payload_locked_documents_rels\` (\`events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_weekly_events_id_idx\` ON \`payload_locked_documents_rels\` (\`weekly_events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_spotlights_id_idx\` ON \`payload_locked_documents_rels\` (\`spotlights_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_subscribers_id_idx\` ON \`payload_locked_documents_rels\` (\`subscribers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_listing_requests_id_idx\` ON \`payload_locked_documents_rels\` (\`listing_requests_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`site_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`price\` numeric DEFAULT 20,
  	\`show_spotlight\` integer DEFAULT true,
  	\`show_ratings\` integer DEFAULT true,
  	\`member_badges\` integer DEFAULT true,
  	\`show_menu_prices\` integer DEFAULT true,
  	\`contact_email\` text,
  	\`contact_phone\` text,
  	\`hero_photo_id\` integer,
  	\`hero_cast_id\` integer,
  	\`hero_cast_bg\` text DEFAULT '#00feff',
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`hero_photo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`hero_cast_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`site_settings_hero_photo_idx\` ON \`site_settings\` (\`hero_photo_id\`);`)
  await db.run(sql`CREATE INDEX \`site_settings_hero_cast_idx\` ON \`site_settings\` (\`hero_cast_id\`);`)
  await db.run(sql`CREATE TABLE \`about_page_steps\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`n\` text,
  	\`bg\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`about_page\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`about_page_steps_order_idx\` ON \`about_page_steps\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`about_page_steps_parent_id_idx\` ON \`about_page_steps\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`about_page_steps_locales\` (
  	\`t\` text,
  	\`d\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`about_page_steps\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`about_page_steps_locales_locale_parent_id_unique\` ON \`about_page_steps_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`about_page\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`photo_id\` integer,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`photo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`about_page_photo_idx\` ON \`about_page\` (\`photo_id\`);`)
  await db.run(sql`CREATE TABLE \`about_page_locales\` (
  	\`kicker\` text,
  	\`h1a\` text,
  	\`h1b\` text,
  	\`intro\` text,
  	\`photo_hint\` text,
  	\`founder_kicker\` text,
  	\`founder_p1\` text,
  	\`founder_p2\` text,
  	\`founder_sig\` text,
  	\`founder_tag\` text,
  	\`how_h\` text,
  	\`cta_h\` text,
  	\`cta_p\` text,
  	\`cta_btn\` text,
  	\`reach_h\` text,
  	\`reach_p\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`about_page\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`about_page_locales_locale_parent_id_unique\` ON \`about_page_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`list_your_spot_page_perks\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`icon\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`list_your_spot_page\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`list_your_spot_page_perks_order_idx\` ON \`list_your_spot_page_perks\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`list_your_spot_page_perks_parent_id_idx\` ON \`list_your_spot_page_perks\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`list_your_spot_page_perks_locales\` (
  	\`t\` text NOT NULL,
  	\`d\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`list_your_spot_page_perks\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`list_your_spot_page_perks_locales_locale_parent_id_unique\` ON \`list_your_spot_page_perks_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`list_your_spot_page_services\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`list_your_spot_page\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`list_your_spot_page_services_order_idx\` ON \`list_your_spot_page_services\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`list_your_spot_page_services_parent_id_idx\` ON \`list_your_spot_page_services\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`list_your_spot_page_services_locales\` (
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`list_your_spot_page_services\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`list_your_spot_page_services_locales_locale_parent_id_unique\` ON \`list_your_spot_page_services_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`list_your_spot_page\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`users_sessions\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`DROP TABLE \`media_locales\`;`)
  await db.run(sql`DROP TABLE \`cities_cast\`;`)
  await db.run(sql`DROP TABLE \`cities\`;`)
  await db.run(sql`DROP TABLE \`cities_locales\`;`)
  await db.run(sql`DROP TABLE \`categories\`;`)
  await db.run(sql`DROP TABLE \`categories_locales\`;`)
  await db.run(sql`DROP TABLE \`event_kinds\`;`)
  await db.run(sql`DROP TABLE \`event_kinds_locales\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_story\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours_locales\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours_conflicts\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_menu\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_menu_locales\`;`)
  await db.run(sql`DROP TABLE \`listings_research_sources\`;`)
  await db.run(sql`DROP TABLE \`listings\`;`)
  await db.run(sql`DROP TABLE \`listings_locales\`;`)
  await db.run(sql`DROP TABLE \`listings_texts\`;`)
  await db.run(sql`DROP TABLE \`listings_rels\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_drop_cap\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_drop_cap_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_paragraph\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_paragraph_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_pull_quote\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_pull_quote_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_image\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_image_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_image_pair\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_image_pair_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_callout_note\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_callout_note_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_section_break\`;`)
  await db.run(sql`DROP TABLE \`stories\`;`)
  await db.run(sql`DROP TABLE \`stories_locales\`;`)
  await db.run(sql`DROP TABLE \`events\`;`)
  await db.run(sql`DROP TABLE \`events_locales\`;`)
  await db.run(sql`DROP TABLE \`weekly_events\`;`)
  await db.run(sql`DROP TABLE \`weekly_events_locales\`;`)
  await db.run(sql`DROP TABLE \`spotlights\`;`)
  await db.run(sql`DROP TABLE \`spotlights_locales\`;`)
  await db.run(sql`DROP TABLE \`subscribers\`;`)
  await db.run(sql`DROP TABLE \`listing_requests\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
  await db.run(sql`DROP TABLE \`site_settings\`;`)
  await db.run(sql`DROP TABLE \`about_page_steps\`;`)
  await db.run(sql`DROP TABLE \`about_page_steps_locales\`;`)
  await db.run(sql`DROP TABLE \`about_page\`;`)
  await db.run(sql`DROP TABLE \`about_page_locales\`;`)
  await db.run(sql`DROP TABLE \`list_your_spot_page_perks\`;`)
  await db.run(sql`DROP TABLE \`list_your_spot_page_perks_locales\`;`)
  await db.run(sql`DROP TABLE \`list_your_spot_page_services\`;`)
  await db.run(sql`DROP TABLE \`list_your_spot_page_services_locales\`;`)
  await db.run(sql`DROP TABLE \`list_your_spot_page\`;`)
}
