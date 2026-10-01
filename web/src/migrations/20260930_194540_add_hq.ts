import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`hq_events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`status\` text DEFAULT 'new',
  	\`type\` text NOT NULL,
  	\`summary\` text NOT NULL,
  	\`ref_collection\` text,
  	\`ref_id\` text,
  	\`data\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`hq_events_status_idx\` ON \`hq_events\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`hq_events_type_idx\` ON \`hq_events\` (\`type\`);`)
  await db.run(sql`CREATE INDEX \`hq_events_updated_at_idx\` ON \`hq_events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`hq_events_created_at_idx\` ON \`hq_events\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`hq_tasks\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`status\` text DEFAULT 'open',
  	\`assignee\` text DEFAULT 'me',
  	\`due_at\` text,
  	\`title\` text NOT NULL,
  	\`detail\` text,
  	\`event_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`event_id\`) REFERENCES \`hq_events\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`hq_tasks_status_idx\` ON \`hq_tasks\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`hq_tasks_event_idx\` ON \`hq_tasks\` (\`event_id\`);`)
  await db.run(sql`CREATE INDEX \`hq_tasks_updated_at_idx\` ON \`hq_tasks\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`hq_tasks_created_at_idx\` ON \`hq_tasks\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`hq_media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`note\` text,
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
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`hq_media_updated_at_idx\` ON \`hq_media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`hq_media_created_at_idx\` ON \`hq_media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`hq_media_filename_idx\` ON \`hq_media\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`hq_social_drafts_platforms\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`hq_social_drafts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_platforms_order_idx\` ON \`hq_social_drafts_platforms\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_platforms_parent_idx\` ON \`hq_social_drafts_platforms\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`hq_social_drafts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`scheduled_for\` text NOT NULL,
  	\`caption\` text NOT NULL,
  	\`error\` text,
  	\`postiz_response\` text,
  	\`telegram_message_id\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_status_idx\` ON \`hq_social_drafts\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_updated_at_idx\` ON \`hq_social_drafts\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_created_at_idx\` ON \`hq_social_drafts\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`hq_social_drafts_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`hq_media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`hq_social_drafts\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`hq_media_id\`) REFERENCES \`hq_media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_rels_order_idx\` ON \`hq_social_drafts_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_rels_parent_idx\` ON \`hq_social_drafts_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_rels_path_idx\` ON \`hq_social_drafts_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`hq_social_drafts_rels_hq_media_id_idx\` ON \`hq_social_drafts_rels\` (\`hq_media_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_jobs_log\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`executed_at\` text NOT NULL,
  	\`completed_at\` text NOT NULL,
  	\`task_slug\` text NOT NULL,
  	\`task_i_d\` text NOT NULL,
  	\`input\` text,
  	\`output\` text,
  	\`state\` text NOT NULL,
  	\`error\` text,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`payload_jobs\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_jobs_log_order_idx\` ON \`payload_jobs_log\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_log_parent_id_idx\` ON \`payload_jobs_log\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`input\` text,
  	\`completed_at\` text,
  	\`total_tried\` numeric DEFAULT 0,
  	\`has_error\` integer DEFAULT false,
  	\`error\` text,
  	\`task_slug\` text,
  	\`queue\` text DEFAULT 'default',
  	\`wait_until\` text,
  	\`processing\` integer DEFAULT false,
  	\`meta\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_jobs_completed_at_idx\` ON \`payload_jobs\` (\`completed_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_total_tried_idx\` ON \`payload_jobs\` (\`total_tried\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_has_error_idx\` ON \`payload_jobs\` (\`has_error\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_task_slug_idx\` ON \`payload_jobs\` (\`task_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_queue_idx\` ON \`payload_jobs\` (\`queue\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_wait_until_idx\` ON \`payload_jobs\` (\`wait_until\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_processing_idx\` ON \`payload_jobs\` (\`processing\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_updated_at_idx\` ON \`payload_jobs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_jobs_created_at_idx\` ON \`payload_jobs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_jobs_stats\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`stats\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`hq_events_id\` integer REFERENCES hq_events(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`hq_tasks_id\` integer REFERENCES hq_tasks(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`hq_media_id\` integer REFERENCES hq_media(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`hq_social_drafts_id\` integer REFERENCES hq_social_drafts(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_events_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_events_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_tasks_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_tasks_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_media_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_hq_social_drafts_id_idx\` ON \`payload_locked_documents_rels\` (\`hq_social_drafts_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`hq_events\`;`)
  await db.run(sql`DROP TABLE \`hq_tasks\`;`)
  await db.run(sql`DROP TABLE \`hq_media\`;`)
  await db.run(sql`DROP TABLE \`hq_social_drafts_platforms\`;`)
  await db.run(sql`DROP TABLE \`hq_social_drafts\`;`)
  await db.run(sql`DROP TABLE \`hq_social_drafts_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_jobs_log\`;`)
  await db.run(sql`DROP TABLE \`payload_jobs\`;`)
  await db.run(sql`DROP TABLE \`payload_jobs_stats\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
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
  	FOREIGN KEY (\`members_id\`) REFERENCES \`members\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "cities_id", "categories_id", "event_kinds_id", "listings_id", "stories_id", "events_id", "weekly_events_id", "spotlights_id", "subscribers_id", "listing_requests_id", "members_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "cities_id", "categories_id", "event_kinds_id", "listings_id", "stories_id", "events_id", "weekly_events_id", "spotlights_id", "subscribers_id", "listing_requests_id", "members_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
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
}
