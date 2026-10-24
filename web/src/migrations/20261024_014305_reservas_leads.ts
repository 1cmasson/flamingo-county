import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`hq_leads\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`event\` text NOT NULL,
  	\`phone\` text NOT NULL,
  	\`whatsapp_name\` text,
  	\`lang\` text DEFAULT 'es',
  	\`source\` text,
  	\`status\` text DEFAULT 'new' NOT NULL,
  	\`step\` text DEFAULT 'menu',
  	\`party_size\` numeric,
  	\`tier\` text,
  	\`opt_in\` integer DEFAULT false,
  	\`opt_in_at\` text,
  	\`misses\` numeric DEFAULT 0,
  	\`last_inbound_at\` text,
  	\`messages\` text,
  	\`draft_reply\` text,
  	\`notes\` text,
  	\`test\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`hq_leads_event_idx\` ON \`hq_leads\` (\`event\`);`)
  await db.run(sql`CREATE INDEX \`hq_leads_phone_idx\` ON \`hq_leads\` (\`phone\`);`)
  await db.run(sql`CREATE INDEX \`hq_leads_source_idx\` ON \`hq_leads\` (\`source\`);`)
  await db.run(sql`CREATE INDEX \`hq_leads_status_idx\` ON \`hq_leads\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`hq_leads_last_inbound_at_idx\` ON \`hq_leads\` (\`last_inbound_at\`);`)
  await db.run(sql`CREATE INDEX \`hq_leads_test_idx\` ON \`hq_leads\` (\`test\`);`)
  await db.run(sql`CREATE INDEX \`hq_leads_updated_at_idx\` ON \`hq_leads\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`hq_leads_created_at_idx\` ON \`hq_leads\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`event_phone_idx\` ON \`hq_leads\` (\`event\`,\`phone\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`hq_leads_find\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`hq_leads_update\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` ADD \`payload_mcp_tool_hq_lead_draft_reply\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`hq_leads_id\` integer REFERENCES hq_leads(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_leads_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_leads_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`hq_leads\`;`)
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
  	\`promotions_id\` integer,
  	\`partners_id\` integer,
  	\`promo_coupons_id\` integer,
  	\`subscribers_id\` integer,
  	\`listing_requests_id\` integer,
  	\`members_id\` integer,
  	\`hq_events_id\` integer,
  	\`hq_tasks_id\` integer,
  	\`hq_media_id\` integer,
  	\`hq_social_drafts_id\` integer,
  	\`hq_social_stats_id\` integer,
  	\`hq_social_comments_id\` integer,
  	\`hq_market_accounts_id\` integer,
  	\`hq_market_posts_id\` integer,
  	\`hq_clicks_id\` integer,
  	\`hq_publish_requests_id\` integer,
  	\`hq_spend_approvals_id\` integer,
  	\`hq_chat_turns_id\` integer,
  	\`hq_visits_id\` integer,
  	\`hq_uses_id\` integer,
  	\`hq_experiments_id\` integer,
  	\`hq_reel_reviews_id\` integer,
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
  	FOREIGN KEY (\`promotions_id\`) REFERENCES \`promotions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`partners_id\`) REFERENCES \`partners\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`promo_coupons_id\`) REFERENCES \`promo_coupons\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`subscribers_id\`) REFERENCES \`subscribers\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`listing_requests_id\`) REFERENCES \`listing_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`members_id\`) REFERENCES \`members\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_events_id\`) REFERENCES \`hq_events\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_tasks_id\`) REFERENCES \`hq_tasks\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_media_id\`) REFERENCES \`hq_media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_social_drafts_id\`) REFERENCES \`hq_social_drafts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_social_stats_id\`) REFERENCES \`hq_social_stats\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_social_comments_id\`) REFERENCES \`hq_social_comments\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_market_accounts_id\`) REFERENCES \`hq_market_accounts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_market_posts_id\`) REFERENCES \`hq_market_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_clicks_id\`) REFERENCES \`hq_clicks\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_publish_requests_id\`) REFERENCES \`hq_publish_requests\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_spend_approvals_id\`) REFERENCES \`hq_spend_approvals\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_chat_turns_id\`) REFERENCES \`hq_chat_turns\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_visits_id\`) REFERENCES \`hq_visits\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_uses_id\`) REFERENCES \`hq_uses\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_experiments_id\`) REFERENCES \`hq_experiments\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_reel_reviews_id\`) REFERENCES \`hq_reel_reviews\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_artwork_uploads_id\`) REFERENCES \`hq_artwork_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`payload_mcp_api_keys_id\`) REFERENCES \`payload_mcp_api_keys\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "videos_id", "cities_id", "categories_id", "event_kinds_id", "listings_id", "stories_id", "events_id", "weekly_events_id", "spotlights_id", "promotions_id", "partners_id", "promo_coupons_id", "subscribers_id", "listing_requests_id", "members_id", "hq_events_id", "hq_tasks_id", "hq_media_id", "hq_social_drafts_id", "hq_social_stats_id", "hq_social_comments_id", "hq_market_accounts_id", "hq_market_posts_id", "hq_clicks_id", "hq_publish_requests_id", "hq_spend_approvals_id", "hq_chat_turns_id", "hq_visits_id", "hq_uses_id", "hq_experiments_id", "hq_reel_reviews_id", "hq_artwork_uploads_id", "payload_mcp_api_keys_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "videos_id", "cities_id", "categories_id", "event_kinds_id", "listings_id", "stories_id", "events_id", "weekly_events_id", "spotlights_id", "promotions_id", "partners_id", "promo_coupons_id", "subscribers_id", "listing_requests_id", "members_id", "hq_events_id", "hq_tasks_id", "hq_media_id", "hq_social_drafts_id", "hq_social_stats_id", "hq_social_comments_id", "hq_market_accounts_id", "hq_market_posts_id", "hq_clicks_id", "hq_publish_requests_id", "hq_spend_approvals_id", "hq_chat_turns_id", "hq_visits_id", "hq_uses_id", "hq_experiments_id", "hq_reel_reviews_id", "hq_artwork_uploads_id", "payload_mcp_api_keys_id" FROM \`payload_locked_documents_rels\`;`)
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_promotions_id_idx\` ON \`payload_locked_documents_rels\` (\`promotions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_partners_id_idx\` ON \`payload_locked_documents_rels\` (\`partners_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_promo_coupons_id_idx\` ON \`payload_locked_documents_rels\` (\`promo_coupons_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_subscribers_id_idx\` ON \`payload_locked_documents_rels\` (\`subscribers_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_listing_requests_id_idx\` ON \`payload_locked_documents_rels\` (\`listing_requests_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_members_id_idx\` ON \`payload_locked_documents_rels\` (\`members_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_events_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_tasks_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_tasks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_media_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_social_drafts_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_social_drafts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_social_stats_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_social_stats_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_social_comments_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_social_comments_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_market_accounts_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_market_accounts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_market_posts_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_market_posts_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_clicks_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_clicks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_publish_requests_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_publish_requests_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_spend_approvals_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_spend_approvals_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_chat_turns_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_chat_turns_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_visits_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_visits_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_uses_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_uses_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_experiments_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_experiments_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_reel_reviews_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_reel_reviews_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_artwork_uploads_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_artwork_uploads_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_payload_mcp_api_keys_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_mcp_api_keys_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`hq_leads_find\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`hq_leads_update\`;`)
  await db.run(sql`ALTER TABLE \`payload_mcp_api_keys\` DROP COLUMN \`payload_mcp_tool_hq_lead_draft_reply\`;`)
}
