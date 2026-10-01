import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // drizzle-kit re-enabled foreign keys after the first table rebuild, and
  // dropping a parent table with them on cascades into its children
  // (hours, story blocks, translations). Off once, around the whole thing.
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`_listings_v_version_detail_story\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`text\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_listings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_story_order_idx\` ON \`_listings_v_version_detail_story\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_story_parent_id_idx\` ON \`_listings_v_version_detail_story\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_story_locale_idx\` ON \`_listings_v_version_detail_story\` (\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_version_detail_hours\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`t\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_listings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_hours_order_idx\` ON \`_listings_v_version_detail_hours\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_hours_parent_id_idx\` ON \`_listings_v_version_detail_hours\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_version_detail_hours_locales\` (
  	\`d\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_listings_v_version_detail_hours\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_listings_v_version_detail_hours_locales_locale_parent_id_un\` ON \`_listings_v_version_detail_hours_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_version_detail_hours_conflicts\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`source\` text,
  	\`detail\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_listings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_hours_conflicts_order_idx\` ON \`_listings_v_version_detail_hours_conflicts\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_detail_hours_conflicts_parent_id_idx\` ON \`_listings_v_version_detail_hours_conflicts\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_version_research_sources\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`url\` text,
  	\`title\` text,
  	\`publisher\` text,
  	\`type\` text,
  	\`_uuid\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_listings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_version_research_sources_order_idx\` ON \`_listings_v_version_research_sources\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_research_sources_parent_id_idx\` ON \`_listings_v_version_research_sources\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text,
  	\`version_name\` text,
  	\`version_city_id\` integer,
  	\`version_category_id\` integer,
  	\`version_hood\` text,
  	\`version_rating\` numeric,
  	\`version_reviews\` numeric,
  	\`version_publication_status\` text DEFAULT 'unsourced',
  	\`version_member\` integer DEFAULT false,
  	\`version_logo_id\` integer,
  	\`version_detail_quote_by\` text,
  	\`version_detail_address\` text,
  	\`version_detail_phone\` text,
  	\`version_detail_site\` text,
  	\`version_detail_email\` text,
  	\`version_detail_instagram\` text,
  	\`version_detail_hours_confidence\` text,
  	\`version_research_established\` text,
  	\`version_research_established_note\` text,
  	\`version_research_legal_entity\` text,
  	\`version_research_source_file\` text,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_parent_idx\` ON \`_listings_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_version_slug_idx\` ON \`_listings_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_version_city_idx\` ON \`_listings_v\` (\`version_city_id\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_version_category_idx\` ON \`_listings_v\` (\`version_category_id\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_version_logo_idx\` ON \`_listings_v\` (\`version_logo_id\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_version_updated_at_idx\` ON \`_listings_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_version_created_at_idx\` ON \`_listings_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_version_version__status_idx\` ON \`_listings_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_created_at_idx\` ON \`_listings_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_updated_at_idx\` ON \`_listings_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_snapshot_idx\` ON \`_listings_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_published_locale_idx\` ON \`_listings_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_latest_idx\` ON \`_listings_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_locales\` (
  	\`version_tag\` text,
  	\`version_image_hint\` text,
  	\`version_detail_quote\` text,
  	\`version_detail_crew_line\` text,
  	\`version_detail_cta\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_listings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_listings_v_locales_locale_parent_id_unique\` ON \`_listings_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_texts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`text\` text,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_listings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_texts_order_parent\` ON \`_listings_v_texts\` (\`order\`,\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_listings_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_listings_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_listings_v_rels_order_idx\` ON \`_listings_v_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_rels_parent_idx\` ON \`_listings_v_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_rels_path_idx\` ON \`_listings_v_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`_listings_v_rels_media_id_idx\` ON \`_listings_v_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_drop_cap\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_drop_cap_order_idx\` ON \`_stories_v_blocks_drop_cap\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_drop_cap_parent_id_idx\` ON \`_stories_v_blocks_drop_cap\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_drop_cap_path_idx\` ON \`_stories_v_blocks_drop_cap\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_drop_cap_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_drop_cap\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_drop_cap_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_drop_cap_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_paragraph\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_paragraph_order_idx\` ON \`_stories_v_blocks_paragraph\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_paragraph_parent_id_idx\` ON \`_stories_v_blocks_paragraph\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_paragraph_path_idx\` ON \`_stories_v_blocks_paragraph\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_paragraph_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_paragraph\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_paragraph_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_paragraph_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_pull_quote\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`attribution\` text,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_pull_quote_order_idx\` ON \`_stories_v_blocks_pull_quote\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_pull_quote_parent_id_idx\` ON \`_stories_v_blocks_pull_quote\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_pull_quote_path_idx\` ON \`_stories_v_blocks_pull_quote\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_pull_quote_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_pull_quote\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_pull_quote_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_pull_quote_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_image\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`image_id\` integer,
  	\`aspect_ratio\` text DEFAULT '16 / 9',
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_order_idx\` ON \`_stories_v_blocks_image\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_parent_id_idx\` ON \`_stories_v_blocks_image\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_path_idx\` ON \`_stories_v_blocks_image\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_image_idx\` ON \`_stories_v_blocks_image\` (\`image_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_image_locales\` (
  	\`hint\` text,
  	\`caption\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_image\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_image_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_image_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_image_pair\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`a_image_id\` integer,
  	\`b_image_id\` integer,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`a_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`b_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_pair_order_idx\` ON \`_stories_v_blocks_image_pair\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_pair_parent_id_idx\` ON \`_stories_v_blocks_image_pair\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_pair_path_idx\` ON \`_stories_v_blocks_image_pair\` (\`_path\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_pair_a_a_image_idx\` ON \`_stories_v_blocks_image_pair\` (\`a_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_image_pair_b_b_image_idx\` ON \`_stories_v_blocks_image_pair\` (\`b_image_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_image_pair_locales\` (
  	\`a_hint\` text,
  	\`a_caption\` text,
  	\`b_hint\` text,
  	\`b_caption\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_image_pair\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_image_pair_locales_locale_parent_id_unique\` ON \`_stories_v_blocks_image_pair_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_callout_note\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_callout_note_order_idx\` ON \`_stories_v_blocks_callout_note\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_callout_note_parent_id_idx\` ON \`_stories_v_blocks_callout_note\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_callout_note_path_idx\` ON \`_stories_v_blocks_callout_note\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_callout_note_locales\` (
  	\`title\` text,
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v_blocks_callout_note\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_blocks_callout_note_locales_locale_parent_id_uniq\` ON \`_stories_v_blocks_callout_note_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_blocks_section_break\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_path\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_uuid\` text,
  	\`block_name\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_section_break_order_idx\` ON \`_stories_v_blocks_section_break\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_section_break_parent_id_idx\` ON \`_stories_v_blocks_section_break\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_blocks_section_break_path_idx\` ON \`_stories_v_blocks_section_break\` (\`_path\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text,
  	\`version_read_time\` text,
  	\`version_byline\` text,
  	\`version_listing_id\` integer,
  	\`version_cover_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`stories\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_stories_v_parent_idx\` ON \`_stories_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_version_version_slug_idx\` ON \`_stories_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_version_version_listing_idx\` ON \`_stories_v\` (\`version_listing_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_version_version_cover_idx\` ON \`_stories_v\` (\`version_cover_id\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_version_version_updated_at_idx\` ON \`_stories_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_version_version_created_at_idx\` ON \`_stories_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_version_version__status_idx\` ON \`_stories_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_created_at_idx\` ON \`_stories_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_updated_at_idx\` ON \`_stories_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_snapshot_idx\` ON \`_stories_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_published_locale_idx\` ON \`_stories_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_stories_v_latest_idx\` ON \`_stories_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_stories_v_locales\` (
  	\`version_title\` text,
  	\`version_dek\` text,
  	\`version_kicker\` text,
  	\`version_biz_cta\` text,
  	\`version_cover_hint\` text,
  	\`version_cover_cap\` text,
  	\`version_outro\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_stories_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_stories_v_locales_locale_parent_id_unique\` ON \`_stories_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_events_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text,
  	\`version_date\` text,
  	\`version_kind_id\` integer,
  	\`version_venue_type\` text DEFAULT 'listing',
  	\`version_listing_id\` integer,
  	\`version_hood\` text,
  	\`version_city_id\` integer,
  	\`version_start_time\` text,
  	\`version_end_time\` text,
  	\`version_star\` integer DEFAULT false,
  	\`version_going\` numeric DEFAULT 0,
  	\`version_image_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_kind_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_events_v_parent_idx\` ON \`_events_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_slug_idx\` ON \`_events_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_kind_idx\` ON \`_events_v\` (\`version_kind_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_listing_idx\` ON \`_events_v\` (\`version_listing_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_city_idx\` ON \`_events_v\` (\`version_city_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_image_idx\` ON \`_events_v\` (\`version_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_updated_at_idx\` ON \`_events_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version_created_at_idx\` ON \`_events_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_version_version__status_idx\` ON \`_events_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_created_at_idx\` ON \`_events_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_updated_at_idx\` ON \`_events_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_snapshot_idx\` ON \`_events_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_published_locale_idx\` ON \`_events_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_events_v_latest_idx\` ON \`_events_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_events_v_locales\` (
  	\`version_title\` text,
  	\`version_time_label\` text,
  	\`version_place\` text,
  	\`version_free_label\` text,
  	\`version_note\` text,
  	\`version_image_hint\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_events_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_events_v_locales_locale_parent_id_unique\` ON \`_events_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_weekly_events_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text,
  	\`version_dow\` text,
  	\`version_time\` text,
  	\`version_listing_id\` integer,
  	\`version_kind_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`weekly_events\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_kind_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_parent_idx\` ON \`_weekly_events_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_version_version_slug_idx\` ON \`_weekly_events_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_version_version_listing_idx\` ON \`_weekly_events_v\` (\`version_listing_id\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_version_version_kind_idx\` ON \`_weekly_events_v\` (\`version_kind_id\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_version_version_updated_at_idx\` ON \`_weekly_events_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_version_version_created_at_idx\` ON \`_weekly_events_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_version_version__status_idx\` ON \`_weekly_events_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_created_at_idx\` ON \`_weekly_events_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_updated_at_idx\` ON \`_weekly_events_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_snapshot_idx\` ON \`_weekly_events_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_published_locale_idx\` ON \`_weekly_events_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_weekly_events_v_latest_idx\` ON \`_weekly_events_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_weekly_events_v_locales\` (
  	\`version_title\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_weekly_events_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_weekly_events_v_locales_locale_parent_id_unique\` ON \`_weekly_events_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_spotlights_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text,
  	\`version_city_id\` integer,
  	\`version_listing_id\` integer,
  	\`version_image_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`spotlights\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_spotlights_v_parent_idx\` ON \`_spotlights_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_version_version_slug_idx\` ON \`_spotlights_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_version_version_city_idx\` ON \`_spotlights_v\` (\`version_city_id\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_version_version_listing_idx\` ON \`_spotlights_v\` (\`version_listing_id\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_version_version_image_idx\` ON \`_spotlights_v\` (\`version_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_version_version_updated_at_idx\` ON \`_spotlights_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_version_version_created_at_idx\` ON \`_spotlights_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_version_version__status_idx\` ON \`_spotlights_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_created_at_idx\` ON \`_spotlights_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_updated_at_idx\` ON \`_spotlights_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_snapshot_idx\` ON \`_spotlights_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_published_locale_idx\` ON \`_spotlights_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_spotlights_v_latest_idx\` ON \`_spotlights_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_spotlights_v_locales\` (
  	\`version_kind\` text,
  	\`version_deal\` text,
  	\`version_blurb\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_spotlights_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_spotlights_v_locales_locale_parent_id_unique\` ON \`_spotlights_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`hq_publish_requests\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`title\` text,
  	\`collection\` text NOT NULL,
  	\`target_id\` text NOT NULL,
  	\`draft_stamp\` text,
  	\`reason\` text,
  	\`preview\` text,
  	\`expires_at\` text,
  	\`telegram_message_id\` numeric,
  	\`error\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`hq_publish_requests_status_idx\` ON \`hq_publish_requests\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`hq_publish_requests_target_id_idx\` ON \`hq_publish_requests\` (\`target_id\`);`)
  await db.run(sql`CREATE INDEX \`hq_publish_requests_updated_at_idx\` ON \`hq_publish_requests\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`hq_publish_requests_created_at_idx\` ON \`hq_publish_requests\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_detail_story\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`text\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_detail_story\`("_order", "_parent_id", "_locale", "id", "text") SELECT "_order", "_parent_id", "_locale", "id", "text" FROM \`listings_detail_story\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_story\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_detail_story\` RENAME TO \`listings_detail_story\`;`)
  await db.run(sql`CREATE INDEX \`listings_detail_story_order_idx\` ON \`listings_detail_story\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_story_parent_id_idx\` ON \`listings_detail_story\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_story_locale_idx\` ON \`listings_detail_story\` (\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_detail_hours\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`t\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_detail_hours\`("_order", "_parent_id", "id", "t") SELECT "_order", "_parent_id", "id", "t" FROM \`listings_detail_hours\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_detail_hours\` RENAME TO \`listings_detail_hours\`;`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_order_idx\` ON \`listings_detail_hours\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_parent_id_idx\` ON \`listings_detail_hours\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_detail_hours_locales\` (
  	\`d\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings_detail_hours\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_detail_hours_locales\`("d", "id", "_locale", "_parent_id") SELECT "d", "id", "_locale", "_parent_id" FROM \`listings_detail_hours_locales\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_detail_hours_locales\` RENAME TO \`listings_detail_hours_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_detail_hours_locales_locale_parent_id_unique\` ON \`listings_detail_hours_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_detail_hours_conflicts\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`source\` text,
  	\`detail\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_detail_hours_conflicts\`("_order", "_parent_id", "id", "source", "detail") SELECT "_order", "_parent_id", "id", "source", "detail" FROM \`listings_detail_hours_conflicts\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours_conflicts\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_detail_hours_conflicts\` RENAME TO \`listings_detail_hours_conflicts\`;`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_conflicts_order_idx\` ON \`listings_detail_hours_conflicts\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_conflicts_parent_id_idx\` ON \`listings_detail_hours_conflicts\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_research_sources\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`url\` text,
  	\`title\` text,
  	\`publisher\` text,
  	\`type\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_research_sources\`("_order", "_parent_id", "id", "url", "title", "publisher", "type") SELECT "_order", "_parent_id", "id", "url", "title", "publisher", "type" FROM \`listings_research_sources\`;`)
  await db.run(sql`DROP TABLE \`listings_research_sources\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_research_sources\` RENAME TO \`listings_research_sources\`;`)
  await db.run(sql`CREATE INDEX \`listings_research_sources_order_idx\` ON \`listings_research_sources\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_research_sources_parent_id_idx\` ON \`listings_research_sources\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`name\` text,
  	\`city_id\` integer,
  	\`category_id\` integer,
  	\`hood\` text,
  	\`rating\` numeric,
  	\`reviews\` numeric,
  	\`publication_status\` text DEFAULT 'unsourced',
  	\`member\` integer DEFAULT false,
  	\`logo_id\` integer,
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
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings\`("id", "slug", "name", "city_id", "category_id", "hood", "rating", "reviews", "publication_status", "member", "logo_id", "detail_quote_by", "detail_address", "detail_phone", "detail_site", "detail_email", "detail_instagram", "detail_hours_confidence", "research_established", "research_established_note", "research_legal_entity", "research_source_file", "updated_at", "created_at", "_status") SELECT "id", "slug", "name", "city_id", "category_id", "hood", "rating", "reviews", "publication_status", "member", "logo_id", "detail_quote_by", "detail_address", "detail_phone", "detail_site", "detail_email", "detail_instagram", "detail_hours_confidence", "research_established", "research_established_note", "research_legal_entity", "research_source_file", "updated_at", "created_at", 'published' FROM \`listings\`;`)
  await db.run(sql`DROP TABLE \`listings\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings\` RENAME TO \`listings\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_slug_idx\` ON \`listings\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`listings_city_idx\` ON \`listings\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_category_idx\` ON \`listings\` (\`category_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_logo_idx\` ON \`listings\` (\`logo_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_updated_at_idx\` ON \`listings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`listings_created_at_idx\` ON \`listings\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`listings__status_idx\` ON \`listings\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_blocks_drop_cap_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_drop_cap\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories_blocks_drop_cap_locales\`("text", "id", "_locale", "_parent_id") SELECT "text", "id", "_locale", "_parent_id" FROM \`stories_blocks_drop_cap_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_drop_cap_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_blocks_drop_cap_locales\` RENAME TO \`stories_blocks_drop_cap_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_drop_cap_locales_locale_parent_id_unique\` ON \`stories_blocks_drop_cap_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_blocks_paragraph_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_paragraph\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories_blocks_paragraph_locales\`("text", "id", "_locale", "_parent_id") SELECT "text", "id", "_locale", "_parent_id" FROM \`stories_blocks_paragraph_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_paragraph_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_blocks_paragraph_locales\` RENAME TO \`stories_blocks_paragraph_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_paragraph_locales_locale_parent_id_unique\` ON \`stories_blocks_paragraph_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_blocks_pull_quote_locales\` (
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_pull_quote\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories_blocks_pull_quote_locales\`("text", "id", "_locale", "_parent_id") SELECT "text", "id", "_locale", "_parent_id" FROM \`stories_blocks_pull_quote_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_pull_quote_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_blocks_pull_quote_locales\` RENAME TO \`stories_blocks_pull_quote_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_pull_quote_locales_locale_parent_id_unique\` ON \`stories_blocks_pull_quote_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_blocks_callout_note_locales\` (
  	\`title\` text,
  	\`text\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_callout_note\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories_blocks_callout_note_locales\`("title", "text", "id", "_locale", "_parent_id") SELECT "title", "text", "id", "_locale", "_parent_id" FROM \`stories_blocks_callout_note_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_callout_note_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_blocks_callout_note_locales\` RENAME TO \`stories_blocks_callout_note_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_callout_note_locales_locale_parent_id_unique\` ON \`stories_blocks_callout_note_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`read_time\` text,
  	\`byline\` text,
  	\`listing_id\` integer,
  	\`cover_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories\`("id", "slug", "read_time", "byline", "listing_id", "cover_id", "updated_at", "created_at", "_status") SELECT "id", "slug", "read_time", "byline", "listing_id", "cover_id", "updated_at", "created_at", 'published' FROM \`stories\`;`)
  await db.run(sql`DROP TABLE \`stories\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories\` RENAME TO \`stories\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_slug_idx\` ON \`stories\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`stories_listing_idx\` ON \`stories\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_cover_idx\` ON \`stories\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_updated_at_idx\` ON \`stories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`stories_created_at_idx\` ON \`stories\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`stories__status_idx\` ON \`stories\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_locales\` (
  	\`title\` text,
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
  await db.run(sql`INSERT INTO \`__new_stories_locales\`("title", "dek", "kicker", "biz_cta", "cover_hint", "cover_cap", "outro", "id", "_locale", "_parent_id") SELECT "title", "dek", "kicker", "biz_cta", "cover_hint", "cover_cap", "outro", "id", "_locale", "_parent_id" FROM \`stories_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_locales\` RENAME TO \`stories_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_locales_locale_parent_id_unique\` ON \`stories_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`date\` text,
  	\`kind_id\` integer,
  	\`venue_type\` text DEFAULT 'listing',
  	\`listing_id\` integer,
  	\`hood\` text,
  	\`city_id\` integer,
  	\`start_time\` text,
  	\`end_time\` text,
  	\`star\` integer DEFAULT false,
  	\`going\` numeric DEFAULT 0,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`kind_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_events\`("id", "slug", "date", "kind_id", "venue_type", "listing_id", "hood", "city_id", "start_time", "end_time", "star", "going", "image_id", "updated_at", "created_at", "_status") SELECT "id", "slug", "date", "kind_id", "venue_type", "listing_id", "hood", "city_id", "start_time", "end_time", "star", "going", "image_id", "updated_at", "created_at", 'published' FROM \`events\`;`)
  await db.run(sql`DROP TABLE \`events\`;`)
  await db.run(sql`ALTER TABLE \`__new_events\` RENAME TO \`events\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`events_slug_idx\` ON \`events\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`events_kind_idx\` ON \`events\` (\`kind_id\`);`)
  await db.run(sql`CREATE INDEX \`events_listing_idx\` ON \`events\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`events_city_idx\` ON \`events\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`events_image_idx\` ON \`events\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`events_updated_at_idx\` ON \`events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`events_created_at_idx\` ON \`events\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`events__status_idx\` ON \`events\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new_events_locales\` (
  	\`title\` text,
  	\`time_label\` text,
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
  await db.run(sql`INSERT INTO \`__new_events_locales\`("title", "time_label", "place", "free_label", "note", "image_hint", "id", "_locale", "_parent_id") SELECT "title", "time_label", "place", "free_label", "note", "image_hint", "id", "_locale", "_parent_id" FROM \`events_locales\`;`)
  await db.run(sql`DROP TABLE \`events_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_events_locales\` RENAME TO \`events_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`events_locales_locale_parent_id_unique\` ON \`events_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_weekly_events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`dow\` text,
  	\`time\` text,
  	\`listing_id\` integer,
  	\`kind_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`kind_id\`) REFERENCES \`event_kinds\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_weekly_events\`("id", "slug", "dow", "time", "listing_id", "kind_id", "updated_at", "created_at", "_status") SELECT "id", "slug", "dow", "time", "listing_id", "kind_id", "updated_at", "created_at", 'published' FROM \`weekly_events\`;`)
  await db.run(sql`DROP TABLE \`weekly_events\`;`)
  await db.run(sql`ALTER TABLE \`__new_weekly_events\` RENAME TO \`weekly_events\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`weekly_events_slug_idx\` ON \`weekly_events\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_listing_idx\` ON \`weekly_events\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_kind_idx\` ON \`weekly_events\` (\`kind_id\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_updated_at_idx\` ON \`weekly_events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_created_at_idx\` ON \`weekly_events\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events__status_idx\` ON \`weekly_events\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`__new_weekly_events_locales\` (
  	\`title\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`weekly_events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_weekly_events_locales\`("title", "id", "_locale", "_parent_id") SELECT "title", "id", "_locale", "_parent_id" FROM \`weekly_events_locales\`;`)
  await db.run(sql`DROP TABLE \`weekly_events_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_weekly_events_locales\` RENAME TO \`weekly_events_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`weekly_events_locales_locale_parent_id_unique\` ON \`weekly_events_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_spotlights\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`city_id\` integer,
  	\`listing_id\` integer,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`city_id\`) REFERENCES \`cities\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_spotlights\`("id", "slug", "city_id", "listing_id", "image_id", "updated_at", "created_at", "_status") SELECT "id", "slug", "city_id", "listing_id", "image_id", "updated_at", "created_at", 'published' FROM \`spotlights\`;`)
  await db.run(sql`DROP TABLE \`spotlights\`;`)
  await db.run(sql`ALTER TABLE \`__new_spotlights\` RENAME TO \`spotlights\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`spotlights_slug_idx\` ON \`spotlights\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_city_idx\` ON \`spotlights\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_listing_idx\` ON \`spotlights\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_image_idx\` ON \`spotlights\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_updated_at_idx\` ON \`spotlights\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_created_at_idx\` ON \`spotlights\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`spotlights__status_idx\` ON \`spotlights\` (\`_status\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`listings_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`listings_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`events_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`events_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`weekly_events_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`weekly_events_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`stories_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`stories_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`spotlights_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`spotlights_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_hq_request_publish\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_hq_publish_status\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`hq_publish_requests_id\` integer REFERENCES hq_publish_requests(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_publish_requests_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_publish_requests_id\`);`)

  // drizzle-kit's copy step read `_status` from the old tables, which have no
  // such column — the migration failed outright. It now writes 'published'
  // for every existing row instead (the column defaults to 'draft', which
  // would take every page off the site). These UPDATEs are a second guard.
  await db.run(sql`UPDATE \`events\` SET \`_status\` = 'published';`)
  await db.run(sql`UPDATE \`weekly_events\` SET \`_status\` = 'published';`)
  await db.run(sql`UPDATE \`stories\` SET \`_status\` = 'published';`)
  await db.run(sql`UPDATE \`spotlights\` SET \`_status\` = 'published';`)
  await db.run(sql`UPDATE \`listings\` SET \`_status\` = 'published';`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // drizzle-kit re-enabled foreign keys after the first table rebuild, and
  // dropping a parent table with them on cascades into its children
  // (hours, story blocks, translations). Off once, around the whole thing.
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`DROP TABLE \`_listings_v_version_detail_story\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_version_detail_hours\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_version_detail_hours_locales\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_version_detail_hours_conflicts\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_version_research_sources\`;`)
  await db.run(sql`DROP TABLE \`_listings_v\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_texts\`;`)
  await db.run(sql`DROP TABLE \`_listings_v_rels\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_drop_cap\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_drop_cap_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_paragraph\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_paragraph_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_pull_quote\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_pull_quote_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_image\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_image_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_image_pair\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_image_pair_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_callout_note\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_callout_note_locales\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_blocks_section_break\`;`)
  await db.run(sql`DROP TABLE \`_stories_v\`;`)
  await db.run(sql`DROP TABLE \`_stories_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_events_v\`;`)
  await db.run(sql`DROP TABLE \`_events_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_weekly_events_v\`;`)
  await db.run(sql`DROP TABLE \`_weekly_events_v_locales\`;`)
  await db.run(sql`DROP TABLE \`_spotlights_v\`;`)
  await db.run(sql`DROP TABLE \`_spotlights_v_locales\`;`)
  await db.run(sql`DROP TABLE \`hq_publish_requests\`;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
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
  	\`members_id\` integer,
  	\`hq_events_id\` integer,
  	\`hq_tasks_id\` integer,
  	\`hq_media_id\` integer,
  	\`hq_social_drafts_id\` integer,
  	\`hq_social_stats_id\` integer,
  	\`hq_clicks_id\` integer,
  	\`payload_mcp_api_keys_id\` integer,
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
  	FOREIGN KEY (\`listing_requests_id\`) REFERENCES \`listing_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`members_id\`) REFERENCES \`members\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_events_id\`) REFERENCES \`hq_events\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_tasks_id\`) REFERENCES \`hq_tasks\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_media_id\`) REFERENCES \`hq_media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_social_drafts_id\`) REFERENCES \`hq_social_drafts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_social_stats_id\`) REFERENCES \`hq_social_stats\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_clicks_id\`) REFERENCES \`hq_clicks\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "cities_id", "categories_id", "event_kinds_id", "listings_id", "stories_id", "events_id", "weekly_events_id", "spotlights_id", "subscribers_id", "listing_requests_id", "members_id", "hq_events_id", "hq_tasks_id", "hq_media_id", "hq_social_drafts_id", "hq_social_stats_id", "hq_clicks_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "cities_id", "categories_id", "event_kinds_id", "listings_id", "stories_id", "events_id", "weekly_events_id", "spotlights_id", "subscribers_id", "listing_requests_id", "members_id", "hq_events_id", "hq_tasks_id", "hq_media_id", "hq_social_drafts_id", "hq_social_stats_id", "hq_clicks_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_members_id_idx\` ON \`payload_locked_documents_rels\` (\`members_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_events_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_tasks_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_tasks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_media_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_social_drafts_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_social_drafts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_social_stats_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_social_stats_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_clicks_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_clicks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`name\` text NOT NULL,
  	\`city_id\` integer NOT NULL,
  	\`category_id\` integer NOT NULL,
  	\`hood\` text,
  	\`rating\` numeric,
  	\`reviews\` numeric,
  	\`publication_status\` text DEFAULT 'unsourced' NOT NULL,
  	\`member\` integer DEFAULT false,
  	\`logo_id\` integer,
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
  	FOREIGN KEY (\`category_id\`) REFERENCES \`categories\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`logo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings\`("id", "slug", "name", "city_id", "category_id", "hood", "rating", "reviews", "publication_status", "member", "logo_id", "detail_quote_by", "detail_address", "detail_phone", "detail_site", "detail_email", "detail_instagram", "detail_hours_confidence", "research_established", "research_established_note", "research_legal_entity", "research_source_file", "updated_at", "created_at") SELECT "id", "slug", "name", "city_id", "category_id", "hood", "rating", "reviews", "publication_status", "member", "logo_id", "detail_quote_by", "detail_address", "detail_phone", "detail_site", "detail_email", "detail_instagram", "detail_hours_confidence", "research_established", "research_established_note", "research_legal_entity", "research_source_file", "updated_at", "created_at" FROM \`listings\`;`)
  await db.run(sql`DROP TABLE \`listings\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings\` RENAME TO \`listings\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_slug_idx\` ON \`listings\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`listings_city_idx\` ON \`listings\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_category_idx\` ON \`listings\` (\`category_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_logo_idx\` ON \`listings\` (\`logo_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_updated_at_idx\` ON \`listings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`listings_created_at_idx\` ON \`listings\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories\` (
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
  await db.run(sql`INSERT INTO \`__new_stories\`("id", "slug", "read_time", "byline", "listing_id", "cover_id", "updated_at", "created_at") SELECT "id", "slug", "read_time", "byline", "listing_id", "cover_id", "updated_at", "created_at" FROM \`stories\`;`)
  await db.run(sql`DROP TABLE \`stories\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories\` RENAME TO \`stories\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_slug_idx\` ON \`stories\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`stories_listing_idx\` ON \`stories\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_cover_idx\` ON \`stories\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`stories_updated_at_idx\` ON \`stories\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`stories_created_at_idx\` ON \`stories\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`date\` text NOT NULL,
  	\`kind_id\` integer NOT NULL,
  	\`venue_type\` text DEFAULT 'listing' NOT NULL,
  	\`listing_id\` integer,
  	\`hood\` text,
  	\`city_id\` integer,
  	\`start_time\` text,
  	\`end_time\` text,
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
  await db.run(sql`INSERT INTO \`__new_events\`("id", "slug", "date", "kind_id", "venue_type", "listing_id", "hood", "city_id", "start_time", "end_time", "star", "going", "image_id", "updated_at", "created_at") SELECT "id", "slug", "date", "kind_id", "venue_type", "listing_id", "hood", "city_id", "start_time", "end_time", "star", "going", "image_id", "updated_at", "created_at" FROM \`events\`;`)
  await db.run(sql`DROP TABLE \`events\`;`)
  await db.run(sql`ALTER TABLE \`__new_events\` RENAME TO \`events\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`events_slug_idx\` ON \`events\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`events_kind_idx\` ON \`events\` (\`kind_id\`);`)
  await db.run(sql`CREATE INDEX \`events_listing_idx\` ON \`events\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`events_city_idx\` ON \`events\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`events_image_idx\` ON \`events\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`events_updated_at_idx\` ON \`events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`events_created_at_idx\` ON \`events\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_weekly_events\` (
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
  await db.run(sql`INSERT INTO \`__new_weekly_events\`("id", "slug", "dow", "time", "listing_id", "kind_id", "updated_at", "created_at") SELECT "id", "slug", "dow", "time", "listing_id", "kind_id", "updated_at", "created_at" FROM \`weekly_events\`;`)
  await db.run(sql`DROP TABLE \`weekly_events\`;`)
  await db.run(sql`ALTER TABLE \`__new_weekly_events\` RENAME TO \`weekly_events\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`weekly_events_slug_idx\` ON \`weekly_events\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_listing_idx\` ON \`weekly_events\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_kind_idx\` ON \`weekly_events\` (\`kind_id\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_updated_at_idx\` ON \`weekly_events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`weekly_events_created_at_idx\` ON \`weekly_events\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_spotlights\` (
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
  await db.run(sql`INSERT INTO \`__new_spotlights\`("id", "slug", "city_id", "listing_id", "image_id", "updated_at", "created_at") SELECT "id", "slug", "city_id", "listing_id", "image_id", "updated_at", "created_at" FROM \`spotlights\`;`)
  await db.run(sql`DROP TABLE \`spotlights\`;`)
  await db.run(sql`ALTER TABLE \`__new_spotlights\` RENAME TO \`spotlights\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`spotlights_slug_idx\` ON \`spotlights\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_city_idx\` ON \`spotlights\` (\`city_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_listing_idx\` ON \`spotlights\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_image_idx\` ON \`spotlights\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_updated_at_idx\` ON \`spotlights\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`spotlights_created_at_idx\` ON \`spotlights\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_detail_story\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`text\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_detail_story\`("_order", "_parent_id", "_locale", "id", "text") SELECT "_order", "_parent_id", "_locale", "id", "text" FROM \`listings_detail_story\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_story\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_detail_story\` RENAME TO \`listings_detail_story\`;`)
  await db.run(sql`CREATE INDEX \`listings_detail_story_order_idx\` ON \`listings_detail_story\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_story_parent_id_idx\` ON \`listings_detail_story\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_story_locale_idx\` ON \`listings_detail_story\` (\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_detail_hours\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`t\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_detail_hours\`("_order", "_parent_id", "id", "t") SELECT "_order", "_parent_id", "id", "t" FROM \`listings_detail_hours\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_detail_hours\` RENAME TO \`listings_detail_hours\`;`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_order_idx\` ON \`listings_detail_hours\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_parent_id_idx\` ON \`listings_detail_hours\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_detail_hours_locales\` (
  	\`d\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings_detail_hours\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_detail_hours_locales\`("d", "id", "_locale", "_parent_id") SELECT "d", "id", "_locale", "_parent_id" FROM \`listings_detail_hours_locales\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_detail_hours_locales\` RENAME TO \`listings_detail_hours_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`listings_detail_hours_locales_locale_parent_id_unique\` ON \`listings_detail_hours_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_detail_hours_conflicts\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`source\` text NOT NULL,
  	\`detail\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_listings_detail_hours_conflicts\`("_order", "_parent_id", "id", "source", "detail") SELECT "_order", "_parent_id", "id", "source", "detail" FROM \`listings_detail_hours_conflicts\`;`)
  await db.run(sql`DROP TABLE \`listings_detail_hours_conflicts\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_detail_hours_conflicts\` RENAME TO \`listings_detail_hours_conflicts\`;`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_conflicts_order_idx\` ON \`listings_detail_hours_conflicts\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_detail_hours_conflicts_parent_id_idx\` ON \`listings_detail_hours_conflicts\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_listings_research_sources\` (
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
  await db.run(sql`INSERT INTO \`__new_listings_research_sources\`("_order", "_parent_id", "id", "url", "title", "publisher", "type") SELECT "_order", "_parent_id", "id", "url", "title", "publisher", "type" FROM \`listings_research_sources\`;`)
  await db.run(sql`DROP TABLE \`listings_research_sources\`;`)
  await db.run(sql`ALTER TABLE \`__new_listings_research_sources\` RENAME TO \`listings_research_sources\`;`)
  await db.run(sql`CREATE INDEX \`listings_research_sources_order_idx\` ON \`listings_research_sources\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`listings_research_sources_parent_id_idx\` ON \`listings_research_sources\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_blocks_drop_cap_locales\` (
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_drop_cap\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories_blocks_drop_cap_locales\`("text", "id", "_locale", "_parent_id") SELECT "text", "id", "_locale", "_parent_id" FROM \`stories_blocks_drop_cap_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_drop_cap_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_blocks_drop_cap_locales\` RENAME TO \`stories_blocks_drop_cap_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_drop_cap_locales_locale_parent_id_unique\` ON \`stories_blocks_drop_cap_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_blocks_paragraph_locales\` (
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_paragraph\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories_blocks_paragraph_locales\`("text", "id", "_locale", "_parent_id") SELECT "text", "id", "_locale", "_parent_id" FROM \`stories_blocks_paragraph_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_paragraph_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_blocks_paragraph_locales\` RENAME TO \`stories_blocks_paragraph_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_paragraph_locales_locale_parent_id_unique\` ON \`stories_blocks_paragraph_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_blocks_pull_quote_locales\` (
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_pull_quote\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories_blocks_pull_quote_locales\`("text", "id", "_locale", "_parent_id") SELECT "text", "id", "_locale", "_parent_id" FROM \`stories_blocks_pull_quote_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_pull_quote_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_blocks_pull_quote_locales\` RENAME TO \`stories_blocks_pull_quote_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_pull_quote_locales_locale_parent_id_unique\` ON \`stories_blocks_pull_quote_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_blocks_callout_note_locales\` (
  	\`title\` text NOT NULL,
  	\`text\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`stories_blocks_callout_note\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_stories_blocks_callout_note_locales\`("title", "text", "id", "_locale", "_parent_id") SELECT "title", "text", "id", "_locale", "_parent_id" FROM \`stories_blocks_callout_note_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_blocks_callout_note_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_blocks_callout_note_locales\` RENAME TO \`stories_blocks_callout_note_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_blocks_callout_note_locales_locale_parent_id_unique\` ON \`stories_blocks_callout_note_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_stories_locales\` (
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
  await db.run(sql`INSERT INTO \`__new_stories_locales\`("title", "dek", "kicker", "biz_cta", "cover_hint", "cover_cap", "outro", "id", "_locale", "_parent_id") SELECT "title", "dek", "kicker", "biz_cta", "cover_hint", "cover_cap", "outro", "id", "_locale", "_parent_id" FROM \`stories_locales\`;`)
  await db.run(sql`DROP TABLE \`stories_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_stories_locales\` RENAME TO \`stories_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`stories_locales_locale_parent_id_unique\` ON \`stories_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_events_locales\` (
  	\`title\` text NOT NULL,
  	\`time_label\` text,
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
  await db.run(sql`INSERT INTO \`__new_events_locales\`("title", "time_label", "place", "free_label", "note", "image_hint", "id", "_locale", "_parent_id") SELECT "title", "time_label", "place", "free_label", "note", "image_hint", "id", "_locale", "_parent_id" FROM \`events_locales\`;`)
  await db.run(sql`DROP TABLE \`events_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_events_locales\` RENAME TO \`events_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`events_locales_locale_parent_id_unique\` ON \`events_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`__new_weekly_events_locales\` (
  	\`title\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`weekly_events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_weekly_events_locales\`("title", "id", "_locale", "_parent_id") SELECT "title", "id", "_locale", "_parent_id" FROM \`weekly_events_locales\`;`)
  await db.run(sql`DROP TABLE \`weekly_events_locales\`;`)
  await db.run(sql`ALTER TABLE \`__new_weekly_events_locales\` RENAME TO \`weekly_events_locales\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`weekly_events_locales_locale_parent_id_unique\` ON \`weekly_events_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`listings_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`listings_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`events_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`events_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`weekly_events_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`weekly_events_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`stories_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`stories_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`spotlights_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`spotlights_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_hq_request_publish\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_hq_publish_status\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
}
