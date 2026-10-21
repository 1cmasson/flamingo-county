import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`promotions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text,
  	\`listing_id\` integer,
  	\`starts_on\` text,
  	\`ends_on\` text,
  	\`limit\` numeric,
  	\`image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`promotions_slug_idx\` ON \`promotions\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`promotions_listing_idx\` ON \`promotions\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`promotions_image_idx\` ON \`promotions\` (\`image_id\`);`)
  await db.run(sql`CREATE INDEX \`promotions_updated_at_idx\` ON \`promotions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`promotions_created_at_idx\` ON \`promotions\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`promotions__status_idx\` ON \`promotions\` (\`_status\`);`)
  await db.run(sql`CREATE TABLE \`promotions_locales\` (
  	\`title\` text,
  	\`details\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`promotions\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`promotions_locales_locale_parent_id_unique\` ON \`promotions_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_promotions_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text,
  	\`version_listing_id\` integer,
  	\`version_starts_on\` text,
  	\`version_ends_on\` text,
  	\`version_limit\` numeric,
  	\`version_image_id\` integer,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`snapshot\` integer,
  	\`published_locale\` text,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`promotions\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_promotions_v_parent_idx\` ON \`_promotions_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_version_version_slug_idx\` ON \`_promotions_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_version_version_listing_idx\` ON \`_promotions_v\` (\`version_listing_id\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_version_version_image_idx\` ON \`_promotions_v\` (\`version_image_id\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_version_version_updated_at_idx\` ON \`_promotions_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_version_version_created_at_idx\` ON \`_promotions_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_version_version__status_idx\` ON \`_promotions_v\` (\`version__status\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_created_at_idx\` ON \`_promotions_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_updated_at_idx\` ON \`_promotions_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_snapshot_idx\` ON \`_promotions_v\` (\`snapshot\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_published_locale_idx\` ON \`_promotions_v\` (\`published_locale\`);`)
  await db.run(sql`CREATE INDEX \`_promotions_v_latest_idx\` ON \`_promotions_v\` (\`latest\`);`)
  await db.run(sql`CREATE TABLE \`_promotions_v_locales\` (
  	\`version_title\` text,
  	\`version_details\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_promotions_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`_promotions_v_locales_locale_parent_id_unique\` ON \`_promotions_v_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`partners\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`listing_id\` integer NOT NULL,
  	\`staff_pin\` text NOT NULL,
  	\`dashboard_key\` text,
  	\`notes\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`partners_listing_idx\` ON \`partners\` (\`listing_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`partners_dashboard_key_idx\` ON \`partners\` (\`dashboard_key\`);`)
  await db.run(sql`CREATE INDEX \`partners_updated_at_idx\` ON \`partners\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`partners_created_at_idx\` ON \`partners\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`promo_coupons\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`code\` text NOT NULL,
  	\`promotion_id\` integer NOT NULL,
  	\`listing_id\` integer NOT NULL,
  	\`source\` text,
  	\`lang\` text,
  	\`redeemed_at\` text,
  	\`pin_fails\` numeric DEFAULT 0,
  	\`test\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`promotion_id\`) REFERENCES \`promotions\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`listing_id\`) REFERENCES \`listings\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`promo_coupons_code_idx\` ON \`promo_coupons\` (\`code\`);`)
  await db.run(sql`CREATE INDEX \`promo_coupons_promotion_idx\` ON \`promo_coupons\` (\`promotion_id\`);`)
  await db.run(sql`CREATE INDEX \`promo_coupons_listing_idx\` ON \`promo_coupons\` (\`listing_id\`);`)
  await db.run(sql`CREATE INDEX \`promo_coupons_source_idx\` ON \`promo_coupons\` (\`source\`);`)
  await db.run(sql`CREATE INDEX \`promo_coupons_redeemed_at_idx\` ON \`promo_coupons\` (\`redeemed_at\`);`)
  await db.run(sql`CREATE INDEX \`promo_coupons_test_idx\` ON \`promo_coupons\` (\`test\`);`)
  await db.run(sql`CREATE INDEX \`promo_coupons_updated_at_idx\` ON \`promo_coupons\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`promo_coupons_created_at_idx\` ON \`promo_coupons\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`promotions_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`promotions_create\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`promotions_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`promotions_id\` integer REFERENCES promotions(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`partners_id\` integer REFERENCES partners(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`promo_coupons_id\` integer REFERENCES promo_coupons(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_promotions_id_idx\` ON \`payload_locked_documents_rels\` (\`promotions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_partners_id_idx\` ON \`payload_locked_documents_rels\` (\`partners_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_promo_coupons_id_idx\` ON \`payload_locked_documents_rels\` (\`promo_coupons_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`promotions\`;`)
  await db.run(sql`DROP TABLE \`promotions_locales\`;`)
  await db.run(sql`DROP TABLE \`_promotions_v\`;`)
  await db.run(sql`DROP TABLE \`_promotions_v_locales\`;`)
  await db.run(sql`DROP TABLE \`partners\`;`)
  await db.run(sql`DROP TABLE \`promo_coupons\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`videos_id\` integer,
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
  	\`hq_publish_requests_id\` integer,
  	\`hq_spend_approvals_id\` integer,
  	\`hq_chat_turns_id\` integer,
  	\`hq_visits_id\` integer,
  	\`hq_uses_id\` integer,
  	\`hq_experiments_id\` integer,
  	\`hq_artwork_uploads_id\` integer,
  	\`payload_mcp_api_keys_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`videos_id\`) REFERENCES \`videos\`(\`id\`) ON UPDATE no action ON DELETE cascade,
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
  	FOREIGN KEY (\`hq_publish_requests_id\`) REFERENCES \`hq_publish_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_spend_approvals_id\`) REFERENCES \`hq_spend_approvals\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_chat_turns_id\`) REFERENCES \`hq_chat_turns\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_visits_id\`) REFERENCES \`hq_visits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_uses_id\`) REFERENCES \`hq_uses\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_experiments_id\`) REFERENCES \`hq_experiments\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_artwork_uploads_id\`) REFERENCES \`hq_artwork_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "videos_id", "cities_id", "categories_id", "event_kinds_id", "listings_id", "stories_id", "events_id", "weekly_events_id", "spotlights_id", "subscribers_id", "listing_requests_id", "members_id", "hq_events_id", "hq_tasks_id", "hq_media_id", "hq_social_drafts_id", "hq_social_stats_id", "hq_clicks_id", "hq_publish_requests_id", "hq_spend_approvals_id", "hq_chat_turns_id", "hq_visits_id", "hq_uses_id", "hq_experiments_id", "hq_artwork_uploads_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "videos_id", "cities_id", "categories_id", "event_kinds_id", "listings_id", "stories_id", "events_id", "weekly_events_id", "spotlights_id", "subscribers_id", "listing_requests_id", "members_id", "hq_events_id", "hq_tasks_id", "hq_media_id", "hq_social_drafts_id", "hq_social_stats_id", "hq_clicks_id", "hq_publish_requests_id", "hq_spend_approvals_id", "hq_chat_turns_id", "hq_visits_id", "hq_uses_id", "hq_experiments_id", "hq_artwork_uploads_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_videos_id_idx\` ON \`payload_locked_documents_rels\` (\`videos_id\`);`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_publish_requests_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_publish_requests_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_spend_approvals_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_spend_approvals_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_chat_turns_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_chat_turns_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_visits_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_visits_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_uses_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_uses_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_experiments_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_experiments_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_artwork_uploads_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_artwork_uploads_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`promotions_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`promotions_create\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`promotions_update\`;`)
}
